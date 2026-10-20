"""Importer tests: validation, idempotent reapply, conflicts, caps,
publish order + real-reader verification (SQLite-runnable subset).

Race semantics are proven on MySQL separately (test_race_mysql) — SQLite
cannot prove unique-constraint races under concurrency and is NEVER
cited as race evidence (DSA-07).

Data: ops/content/fb-pilot-dong-hanh-4-tuan/content-items.json — the
editorial bundle committed with this task (25 items: 1 program,
16 activities, 8 micro-lessons). Tests create ZERO user-side rows
(accounts are synthetic fixtures only; no enrollment/progress/invite/
consent is ever written by the importer).
"""

import json
import os
import tempfile
from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from fixtures.actors import make_student, make_staff

from ..models import AuditEvent, ContentItem
from ..services.admin import AdminCapabilityService

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__),
                                         "..", "..", "..", ".."))
BUNDLE_PATH = os.path.join(
    REPO_ROOT, "ops", "content", "fb-pilot-dong-hanh-4-tuan",
    "content-items.json")


class ImporterTestBase(TestCase):
    def setUp(self):
        self.operator = make_staff()   # out-of-band bootstrap grantor
        self.publisher = make_student()  # real user holding the caps
        caps = AdminCapabilityService()
        caps.grant(actor_id=str(self.operator.pk),
                   user_id=str(self.publisher.pk),
                   capability="content.manage",
                   scope_type="global", scope_ref="", ttl_days=None)
        caps.grant(actor_id=str(self.operator.pk),
                   user_id=str(self.publisher.pk),
                   capability="content.publish",
                   scope_type="global", scope_ref="", ttl_days=None)

    def run_cmd(self, *args):
        out, err = StringIO(), StringIO()
        call_command("import_content_bundle", "--json", *args,
                     stdout=out, stderr=err)
        return json.loads(out.getvalue()), out.getvalue()


class BundleValidationTests(ImporterTestBase):
    def test_dry_run_default_no_mutation(self):
        before_items = ContentItem.objects.count()
        before_audit = AuditEvent.objects.count()
        report, _ = self.run_cmd("--source", BUNDLE_PATH,
                                 "--actor", str(self.publisher.pk))
        self.assertTrue(report["dry_run"])
        self.assertEqual(ContentItem.objects.count(), before_items)
        self.assertEqual(AuditEvent.objects.count(), before_audit)
        self.assertEqual(
            sum(1 for r in report["items"]
                if r["outcome"] == "would_create_draft"), 25)

    def test_validation_rejects_bad_bundle(self):
        with open(BUNDLE_PATH, encoding="utf-8") as fh:
            data = json.load(fh)
        data["items"][1]["body"]["minutes"] = 0  # invalid bound
        with tempfile.NamedTemporaryFile("w", suffix=".json",
                                         delete=False,
                                         encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False)
            bad = fh.name
        try:
            with self.assertRaises(CommandError) as ctx:
                self.run_cmd("--source", bad,
                             "--actor", str(self.publisher.pk))
            self.assertIn("khong hop le", str(ctx.exception))
        finally:
            os.unlink(bad)
        self.assertEqual(ContentItem.objects.count(), 0)

    def test_validation_rejects_user_side_fields(self):
        with open(BUNDLE_PATH, encoding="utf-8") as fh:
            data = json.load(fh)
        data["items"][0]["participant_id"] = "fake-user"  # NEVER allowed
        with tempfile.NamedTemporaryFile("w", suffix=".json",
                                         delete=False,
                                         encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False)
            bad = fh.name
        try:
            with self.assertRaises(CommandError):
                self.run_cmd("--source", bad,
                             "--actor", str(self.publisher.pk))
        finally:
            os.unlink(bad)
        self.assertEqual(ContentItem.objects.count(), 0)


class CapabilityGateTests(ImporterTestBase):
    def test_actor_without_cap_is_denied(self):
        outsider = make_student()  # real user, NO grants
        with self.assertRaises(CommandError) as ctx:
            self.run_cmd("--source", BUNDLE_PATH, "--apply",
                         "--actor", str(outsider.pk))
        self.assertIn("content.manage", str(ctx.exception))
        self.assertEqual(ContentItem.objects.count(), 0)

    def test_unknown_actor_is_denied(self):
        with self.assertRaises(CommandError) as ctx:
            self.run_cmd("--source", BUNDLE_PATH, "--apply",
                         "--actor", "00000000-0000-0000-0000-000000000000")
        self.assertIn("actor khong ton tai", str(ctx.exception))
        self.assertEqual(ContentItem.objects.count(), 0)

    def test_publish_without_publish_cap_is_denied(self):
        manager_only = make_student()
        AdminCapabilityService().grant(
            actor_id=str(self.operator.pk), user_id=str(manager_only.pk),
            capability="content.manage", scope_type="global",
            scope_ref="", ttl_days=None)
        with self.assertRaises(CommandError) as ctx:
            self.run_cmd("--source", BUNDLE_PATH, "--publish",
                         "--actor", str(manager_only.pk))
        self.assertIn("content.publish", str(ctx.exception))
        self.assertEqual(ContentItem.objects.count(), 0)


class ApplyIdempotencyTests(ImporterTestBase):
    def test_apply_creates_25_drafts_then_reapply_is_noop(self):
        report, _ = self.run_cmd("--source", BUNDLE_PATH, "--apply",
                                 "--actor", str(self.publisher.pk))
        self.assertEqual(report["counts"]["created_draft"], 25)
        self.assertEqual(ContentItem.objects.count(), 25)
        self.assertTrue(all(i.status == "draft"
                            for i in ContentItem.objects.all()))
        audit_after_first = AuditEvent.objects.count()
        self.assertGreaterEqual(audit_after_first, 25)

        # Reapply the SAME file: no rows, no revisions, no audit mutation.
        report2, _ = self.run_cmd("--source", BUNDLE_PATH, "--apply",
                                  "--actor", str(self.publisher.pk))
        self.assertEqual(ContentItem.objects.count(), 25)
        self.assertEqual(AuditEvent.objects.count(), audit_after_first)
        self.assertEqual(
            sum(1 for r in report2["items"]
                if r["outcome"] == "exists_same"), 25)

    def test_publish_flow_order_and_real_readers(self):
        report, _ = self.run_cmd("--source", BUNDLE_PATH, "--publish",
                                 "--actor", str(self.publisher.pk))
        self.assertEqual(ContentItem.objects.filter(status="published")
                         .count(), 25)

        # Program published AFTER its dependencies (order guarantee).
        program = ContentItem.objects.get(
            content_key="fb-pilot-dong-hanh-4-tuan")
        dependents = ContentItem.objects.filter(
            kind__in=("activity", "micro_lesson"))
        self.assertEqual(dependents.count(), 24)
        latest_dependent = max(d.published_at for d in dependents)
        self.assertGreaterEqual(program.published_at, latest_dependent)

        # Verify block: real readers see everything.
        verify = report["verify"]
        self.assertEqual(verify["activities_in_catalog"], 16)
        self.assertEqual(verify["lessons_in_catalog"], 8)
        self.assertTrue(verify["lesson_minutes_ok"])
        self.assertTrue(verify["program_parsed"])
        self.assertEqual(verify["program_weeks"], 4)
        self.assertEqual(verify["program_week_refs_total"], 16)
        self.assertTrue(verify["program_refs_resolvable"])

        # Re-run publish: all already_published, no lifecycle errors.
        report2, _ = self.run_cmd("--source", BUNDLE_PATH, "--publish",
                                  "--actor", str(self.publisher.pk))
        self.assertEqual(
            sum(1 for r in report2["publish"]
                if r["outcome"] == "already_published"), 25)
        self.assertEqual(ContentItem.objects.count(), 25)


class ConflictTests(ImporterTestBase):
    def _mutated_bundle(self, mutate):
        with open(BUNDLE_PATH, encoding="utf-8") as fh:
            data = json.load(fh)
        mutate(data)
        fh = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False,
                                         encoding="utf-8")
        json.dump(data, fh, ensure_ascii=False)
        fh.close()
        return fh.name

    def test_payload_diff_is_conflict_without_overwrite(self):
        self.run_cmd("--source", BUNDLE_PATH, "--apply",
                     "--actor", str(self.publisher.pk))
        original_title = ContentItem.objects.get(
            content_key="fb-pilot-w1-goi-ten-cam-xuc").title

        def mutate(data):
            for item in data["items"]:
                if item["content_key"] == "fb-pilot-w1-goi-ten-cam-xuc":
                    item["title"] = "Tiêu đề đã bị sửa"

        bad = self._mutated_bundle(mutate)
        try:
            with self.assertRaises(CommandError) as ctx:
                self.run_cmd("--source", bad, "--apply",
                             "--actor", str(self.publisher.pk))
            self.assertIn("conflict", str(ctx.exception))
        finally:
            os.unlink(bad)
        row = ContentItem.objects.get(content_key="fb-pilot-w1-goi-ten-cam-xuc")
        self.assertEqual(row.title, original_title)  # NOT overwritten
        self.assertEqual(ContentItem.objects.count(), 25)  # no dup rows

    def test_retired_key_never_reimported(self):
        self.run_cmd("--source", BUNDLE_PATH, "--publish",
                     "--actor", str(self.publisher.pk))
        item = ContentItem.objects.get(content_key="fb-pilot-w2-ghi-nhan-cu-the")
        from ..services.admin import ContentLifecycleService
        ContentLifecycleService().retire(
            actor_id=str(self.publisher.pk), content_id=str(item.id),
            expected_revision=item.revision, reason="thu hoi thu nghiem")
        with self.assertRaises(CommandError) as ctx:
            self.run_cmd("--source", BUNDLE_PATH, "--apply",
                         "--actor", str(self.publisher.pk))
        self.assertIn("conflict", str(ctx.exception))
        # still exactly one row for that key; status retired untouched
        self.assertEqual(ContentItem.objects.filter(
            content_key="fb-pilot-w2-ghi-nhan-cu-the").count(), 1)

    def test_pending_draft_of_same_key_is_conflict(self):
        self.run_cmd("--source", BUNDLE_PATH, "--publish",
                     "--actor", str(self.publisher.pk))
        published = ContentItem.objects.get(
            content_key="fb-pilot-w3-hoi-truoc-khi-xem")
        from ..services.admin import ContentLifecycleService
        draft = ContentLifecycleService().clone_draft(
            actor_id=str(self.publisher.pk), content_id=str(published.id))
        # Simulate an editor having reworked the pending draft (rev 2) to a
        # NEW payload (direct DB write — test-only simulation of a state
        # that a future edit API will produce; the lifecycle has no edit
        # method today).
        draft.title = "Bản nháp đang soạn lại của biên tập viên"
        draft.save(update_fields=["title"])

        # (a) Re-importing the SAME bundle must stay idempotent: it matches
        # the published rev 1 (already_published) and NEVER touches the
        # pending draft.
        report_a, _ = self.run_cmd("--source", BUNDLE_PATH, "--apply",
                                   "--actor", str(self.publisher.pk))
        outcome_a = next(r["outcome"] for r in report_a["items"]
                         if r["content_key"] == "fb-pilot-w3-hoi-truoc-khi-xem")
        self.assertEqual(outcome_a, "already_published")
        self.assertEqual(
            ContentItem.objects.get(
                content_key="fb-pilot-w3-hoi-truoc-khi-xem",
                revision=2).title,
            "Bản nháp đang soạn lại của biên tập viên")

        # (b) Importing a DIFFERENT payload while a pending draft exists ->
        # conflict_pending_draft: no parallel rows, no overwrite.
        def mutate(data):
            for item in data["items"]:
                if item["content_key"] == "fb-pilot-w3-hoi-truoc-khi-xem":
                    item["title"] = "Bundle khác payload đang soạn dở"

        bad = self._mutated_bundle(mutate)
        before = ContentItem.objects.filter(
            content_key="fb-pilot-w3-hoi-truoc-khi-xem").count()
        try:
            with self.assertRaises(CommandError) as ctx:
                self.run_cmd("--source", bad, "--apply",
                             "--actor", str(self.publisher.pk))
            self.assertIn("conflict", str(ctx.exception))
        finally:
            os.unlink(bad)
        self.assertEqual(ContentItem.objects.filter(
            content_key="fb-pilot-w3-hoi-truoc-khi-xem").count(), before)
