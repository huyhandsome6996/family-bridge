"""F07 concurrency suites requiring real MySQL row locks / unique indexes.

SQLite cannot prove concurrent INSERT race semantics (no SELECT ... FOR
UPDATE interplay with unique constraints under threads); these cases run
ONLY when FB_TEST_DB=mysql and are reported NOT_RUN otherwise (f01 pattern:
tests/test_race_mysql.py).
"""

import os
import threading
import unittest

from django.db import close_old_connections, transaction
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
        barrier = threading.Barrier(2, timeout=15)

        def worker():
            try:
                barrier.wait()
                self.service.create(owner_id=str(self.student.pk),
                                    entry_date=None, emotion="vui", note="")
                outcomes.append("created")
            except Exception as exc:  # noqa: BLE001
                outcomes.append(type(exc).__name__)
            finally:
                # R04 hygiene: each worker owns its DB connection; release
                # it here so no thread leaks a connection into teardown.
                close_old_connections()

        threads = [threading.Thread(target=worker) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=30)
        self.assertFalse(any(t.is_alive() for t in threads),
                         "worker thread exceeded 30s")
        self.assertEqual(MoodEntry.objects.filter(
            owner_id=str(self.student.pk)).count(), 1)
        # R04 fix: multiset comparison — the runner cannot know which
        # worker wins; sorted() against an unsorted literal was always
        # false. Exactly one "created" and exactly one business error.
        self.assertCountEqual(outcomes, ["created", "InputInvalid"])


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
        barrier = threading.Barrier(2, timeout=15)

        def worker():
            try:
                barrier.wait()
                with transaction.atomic():
                    self.service.share(
                        owner_id=str(self.student.pk),
                        entry_id=str(self.entry.pk),
                        recipient_id=str(self.caregiver.pk))
                outcomes.append("shared")
            except Exception as exc:  # noqa: BLE001
                outcomes.append(type(exc).__name__)
            finally:
                close_old_connections()

        threads = [threading.Thread(target=worker) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=30)
        self.assertFalse(any(t.is_alive() for t in threads),
                         "worker thread exceeded 30s")
        # R04 fix: assert BOTH workers' outcomes — the loser of the
        # get_or_create race rebinds the SAME active grant (idempotent
        # explicit re-share), so both threads observe "shared" and exactly
        # one row exists. No worker error is swallowed here.
        self.assertCountEqual(outcomes, ["shared", "shared"])
        self.assertEqual(MoodShare.objects.filter(
            entry_id=str(self.entry.pk)).count(), 1)
        share = MoodShare.objects.get(entry_id=str(self.entry.pk))
        self.assertIsNone(share.revoked_at)


@unittest.skipIf(not MYSQL, SKIP_REASON)
class ConcurrentEditRevisionTests(TransactionTestCase):
    """R02 regression (in-app): concurrent edits must serialize so two
    different contents can NEVER share one revision, and a grant pinned
    to an approved revision must never expose unapproved content."""

    def setUp(self):
        registry.reset_registries()
        registry.register_session_resolver(_lab_sessions.resolve_session)
        registry.register_connection_reader(TestConnectionReader())
        self.student = make_student()
        self.caregiver = make_caregiver()
        make_test_connection(self.student, self.caregiver)
        self.entry = MoodEntryService().create(
            owner_id=str(self.student.pk), entry_date=None, emotion="vui",
            note="ban dau")
        self.entry_service = MoodEntryService()
        self.share_service = MoodShareService()

    def test_concurrent_edits_serialize_and_revision_stays_monotonic(self):
        outcomes = []
        barrier = threading.Barrier(2, timeout=15)

        def worker(note):
            try:
                barrier.wait()
                self.entry_service.edit(owner_id=str(self.student.pk),
                                        entry_id=str(self.entry.pk),
                                        emotion=None, note=note)
                outcomes.append("edited")
            except Exception as exc:  # noqa: BLE001
                outcomes.append(type(exc).__name__)
            finally:
                close_old_connections()

        threads = [threading.Thread(target=worker, args=(note,))
                   for note in ("lan sua mot", "lan sua hai")]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=30)
        self.assertFalse(any(t.is_alive() for t in threads),
                         "worker thread exceeded 30s")
        self.assertCountEqual(outcomes, ["edited", "edited"])
        self.entry.refresh_from_db()
        # Two committed edits from revision 1 -> exactly revision 3, and
        # the row content is one of the two notes (serialized last-write).
        self.assertEqual(self.entry.revision, 3)
        self.assertIn(self.entry.note, ("lan sua mot", "lan sua hai"))
        # A grant pinned to the OLD approved revision (2) is stale now and
        # must not leak either edit; sharing current revision 3 works.
        with self.assertRaises(Exception):
            self.share_service.share(owner_id=str(self.student.pk),
                                     entry_id=str(self.entry.pk),
                                     recipient_id=str(self.caregiver.pk),
                                     expected_revision=2)
        grant = self.share_service.share(
            owner_id=str(self.student.pk), entry_id=str(self.entry.pk),
            recipient_id=str(self.caregiver.pk), expected_revision=3)
        data = self.share_service.read_shared(
            recipient_id=str(self.caregiver.pk), share_id=str(grant.pk))
        self.assertEqual(data["entry"]["revision"], 3)
        self.assertEqual(data["entry"]["note"], self.entry.note)

    def test_interleaved_edit_share_never_reads_unapproved(self):
        # Mirrors the independent review choreography (patched read point
        # coordinates two edit threads and one share thread); the row-lock
        # fix makes the interleaving safe instead of reusing revision 2.
        from unittest.mock import patch

        from ..services import mood as mood_module
        from family_bridge_core.errors import PreviewStale

        owner_id, entry_id, recipient_id = map(
            str, (self.student.pk, self.entry.pk, self.caregiver.pk))
        first_read = threading.Event()
        second_read = threading.Event()
        release_first = threading.Event()
        first_done = threading.Event()
        grant_done = threading.Event()
        errors = []
        grants = []
        share_outcomes = []
        real_read = mood_module._require_own_entry

        def read_with_schedule(**kwargs):
            result = real_read(**kwargs)
            name = threading.current_thread().name
            if name == "review-first-edit":
                first_read.set()
                if not release_first.wait(timeout=15):
                    raise TimeoutError("first edit was not released")
            elif name == "review-second-edit":
                second_read.set()
                # With the row-lock fix this thread blocks later on
                # select_for_update until the first edit commits; the
                # bounded wait keeps the choreography finite.
                grant_done.wait(timeout=2)
            return result

        def edit_worker(note, first):
            try:
                mood_module.MoodEntryService().edit(
                    owner_id=owner_id, entry_id=entry_id,
                    emotion=None, note=note)
            except Exception as exc:  # noqa: BLE001
                errors.append(type(exc).__name__)
            finally:
                close_old_connections()
                if first:
                    first_done.set()

        def share_worker():
            try:
                grants.append(mood_module.MoodShareService().share(
                    owner_id=owner_id, entry_id=entry_id,
                    recipient_id=recipient_id, expected_revision=2))
                share_outcomes.append("shared")
            except PreviewStale:
                share_outcomes.append("preview_stale")
            except Exception as exc:  # noqa: BLE001
                errors.append(type(exc).__name__)
            finally:
                close_old_connections()
                grant_done.set()

        with patch.object(mood_module, "_require_own_entry",
                          side_effect=read_with_schedule):
            first = threading.Thread(name="review-first-edit",
                                     target=edit_worker,
                                     args=("phien ban da duyet", True))
            second = threading.Thread(name="review-second-edit",
                                      target=edit_worker,
                                      args=("phien ban CHUA duyet", False))
            first.start()
            self.assertTrue(first_read.wait(timeout=15), "first edit stalled")
            second.start()
            second_read.wait(timeout=1)
            release_first.set()
            self.assertTrue(first_done.wait(timeout=20), "first edit stalled")
            sharing = threading.Thread(name="review-share",
                                       target=share_worker)
            sharing.start()
            first.join(timeout=20)
            second.join(timeout=20)
            sharing.join(timeout=20)
            self.assertFalse(first.is_alive() or second.is_alive()
                             or sharing.is_alive(), "worker timeout")
        self.assertEqual(errors, [])
        self.assertIn(share_outcomes, [["shared"], ["preview_stale"]])
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.revision, 3,
                         "two committed edits reused one revision")
        if grants:
            try:
                data = mood_module.MoodShareService().read_shared(
                    recipient_id=recipient_id,
                    share_id=str(grants[0].pk))
            except Exception:
                data = None
            self.assertTrue(
                data is None or
                data["entry"]["note"] != "phien ban CHUA duyet",
                "grant exposed unapproved content")
