"""Importer concurrency suites requiring real MySQL unique-constraint
semantics (DSA-07). SQLite cannot prove concurrent-insert races and is
NEVER cited as race evidence; these cases run ONLY when FB_TEST_DB=mysql
and are skipped with an explicit reason otherwise (NOT_RUN, not PASS).

Scenario: two importers run the SAME bundle concurrently with --apply.
Exactly ONE row per content_key must exist afterwards; the loser of each
create race re-reads the winner and continues idempotently (exists_same).
"""

import os
import threading
import unittest
from io import StringIO

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TransactionTestCase

MYSQL = os.getenv("FB_TEST_DB", "sqlite") == "mysql"
SKIP_REASON = ("requires FB_TEST_DB=mysql: SQLite cannot prove unique-"
               "constraint race semantics (DSA-07)")

from fixtures.actors import make_student, make_staff  # noqa: E402

from ..models import ContentItem  # noqa: E402
from ..services.admin import AdminCapabilityService  # noqa: E402

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__),
                                         "..", "..", "..", ".."))
BUNDLE_PATH = os.path.join(
    REPO_ROOT, "ops", "content", "fb-pilot-dong-hanh-4-tuan",
    "content-items.json")



@unittest.skipIf(not MYSQL, SKIP_REASON)
class TwoImporterRaceTests(TransactionTestCase):
    def setUp(self):
        self.operator = make_staff()
        self.publisher_a = make_student()
        self.publisher_b = make_student()
        caps = AdminCapabilityService()
        for target in (self.publisher_a, self.publisher_b):
            caps.grant(actor_id=str(self.operator.pk),
                       user_id=str(target.pk),
                       capability="content.manage",
                       scope_type="global", scope_ref="", ttl_days=None)

    def _run_import(self, actor_pk):
        out = StringIO()
        call_command("import_content_bundle", "--source", BUNDLE_PATH,
                     "--apply", "--actor", str(actor_pk), stdout=out)
        return out.getvalue()

    def test_two_concurrent_imports_no_duplicates(self):
        barrier = threading.Barrier(2)
        results = {}

        def runner(name, actor_pk):
            barrier.wait()
            try:
                results[name] = ("ok", self._run_import(actor_pk))
            except CommandError as exc:
                results[name] = ("conflict", str(exc))

        t1 = threading.Thread(target=runner, args=("a", self.publisher_a.pk))
        t2 = threading.Thread(target=runner, args=("b", self.publisher_b.pk))
        t1.start()
        t2.start()
        t1.join(timeout=120)
        t2.join(timeout=120)

        self.assertEqual(set(results), {"a", "b"})
        # Invariants that matter: both runs completed (possibly one reports
        # races resolved), and NO key ever got two rows.
        bundle_keys = _bundle_keys()
        for key in bundle_keys:
            self.assertLessEqual(
                ContentItem.objects.filter(content_key=key).count(), 1,
                f"duplicate rows for {key}")
        self.assertEqual(ContentItem.objects.count(), 25)


def _bundle_keys():
    import json
    with open(BUNDLE_PATH, encoding="utf-8") as fh:
        data = json.load(fh)
    return [item["content_key"] for item in data["items"]]
