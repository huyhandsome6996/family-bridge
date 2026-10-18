"""F07 concurrency suites requiring real MySQL row locks / unique indexes.

SQLite cannot prove concurrent INSERT race semantics (no SELECT ... FOR
UPDATE interplay with unique constraints under threads); these cases run
ONLY when FB_TEST_DB=mysql and are reported NOT_RUN otherwise (f01 pattern:
tests/test_race_mysql.py).
"""

import os
import threading
import unittest

from django.db import transaction
from django.test import TransactionTestCase

MYSQL = os.getenv("FB_TEST_DB", "sqlite") == "mysql"
SKIP_REASON = ("requires FB_TEST_DB=mysql: SQLite cannot prove row-lock/"
               "unique race semantics (DSA-07, verification plan)")

from fixtures.actors import make_student, make_caregiver  # noqa: E402

import labgrants.sessions as _lab_sessions  # noqa: E402
from labgrants.f05_fixtures import TestConnectionReader, make_test_connection  # noqa: E402

from ..models import MoodEntry, MoodShare  # noqa: E402
from ..services import registry  # noqa: E402
from ..services.mood import MoodEntryService, MoodShareService  # noqa: E402


@unittest.skipIf(not MYSQL, SKIP_REASON)
class ConcurrentCreateOnePerDayTests(TransactionTestCase):
    """F07-T03: two racing creates for the same owner/day -> exactly one
    row; the loser gets the business recovery error, never a 500."""

    def setUp(self):
        registry.reset_registries()
        registry.register_session_resolver(_lab_sessions.resolve_session)
        registry.register_connection_reader(TestConnectionReader())
        self.student = make_student()
        self.service = MoodEntryService()

    def test_two_threads_same_day_single_row(self):
        outcomes = []
        barrier = threading.Barrier(2)

        def worker():
            barrier.wait()
            try:
                self.service.create(owner_id=str(self.student.pk),
                                    entry_date=None, emotion="vui", note="")
                outcomes.append("created")
            except Exception as exc:  # noqa: BLE001
                outcomes.append(type(exc).__name__)

        threads = [threading.Thread(target=worker) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual(MoodEntry.objects.filter(
            owner_id=str(self.student.pk)).count(), 1)
        self.assertEqual(sorted(outcomes), ["created", "InputInvalid"])


@unittest.skipIf(not MYSQL, SKIP_REASON)
class ConcurrentShareRaceTests(TransactionTestCase):
    """F07-T26: double share submit for the same (entry, recipient,
    revision) -> exactly one ACTIVE grant; no duplicate rows."""

    def setUp(self):
        registry.reset_registries()
        registry.register_session_resolver(_lab_sessions.resolve_session)
        self.reader = TestConnectionReader()
        registry.register_connection_reader(self.reader)
        self.student = make_student()
        self.caregiver = make_caregiver()
        self.connection = make_test_connection(self.student, self.caregiver)
        self.entry = MoodEntryService().create(
            owner_id=str(self.student.pk), entry_date=None, emotion="vui",
            note="chia sẻ một lần thôi")
        self.service = MoodShareService()

    def test_double_share_single_active_grant(self):
        outcomes = []
        barrier = threading.Barrier(2)

        def worker():
            barrier.wait()
            try:
                with transaction.atomic():
                    self.service.share(
                        owner_id=str(self.student.pk),
                        entry_id=str(self.entry.pk),
                        recipient_id=str(self.caregiver.pk))
                outcomes.append("shared")
            except Exception as exc:  # noqa: BLE001
                outcomes.append(type(exc).__name__)

        threads = [threading.Thread(target=worker) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual(MoodShare.objects.filter(
            entry_id=str(self.entry.pk)).count(), 1)
        share = MoodShare.objects.get(entry_id=str(self.entry.pk))
        self.assertIsNone(share.revoked_at)
