"""F09 concurrency tests requiring real MySQL / TiDB constraints (WT-02-03)."""

import os
import threading
import unittest

from django.test import TransactionTestCase

MYSQL = os.getenv("FB_TEST_DB", "sqlite") == "mysql"
SKIP_REASON = ("requires FB_TEST_DB=mysql: SQLite cannot prove row-lock/"
               "unique race semantics (DSA-07, verification plan)")

from fixtures.actors import make_student, make_caregiver  # noqa: E402
from ..models import SharedActivityInvite, INVITE_PENDING, INVITE_ACCEPTED
from ..services.activities import ActivityService
from ..services import registry as f09_registry


class _MultiRevContentDouble:
    def list_published(self, limit=50):
        return [
            {
                "content_key": "art_therapy_01",
                "revision": 1,
                "kind": "activity",
                "title": "Art Activity v1",
                "body": "Body text v1",
                "audience": "neutral",
                "status": "published",
            },
            {
                "content_key": "art_therapy_01",
                "revision": 2,
                "kind": "activity",
                "title": "Art Activity v2",
                "body": "Body text v2",
                "audience": "neutral",
                "status": "published",
            },
        ]


class _ActiveConnectionDouble:
    def active_connection_between(self, *, user_a: str, user_b: str):
        return {"connection_id": "test_conn_id", "status": "active"}


@unittest.skipIf(not MYSQL, SKIP_REASON)
class SharedActivityInviteRaceTests(TransactionTestCase):
    def setUp(self):
        f09_registry.register_content_reader(_MultiRevContentDouble())
        f09_registry.register_connection_reader(_ActiveConnectionDouble())
        self.service = ActivityService()
        self.inviter = make_student()
        self.invitee = make_caregiver()

    def tearDown(self):
        f09_registry.reset_registries()

    def test_concurrent_invite_single_pending_invite(self):
        """Two concurrent calls to ActivityService.invite with SAME revision
        produce exactly 1 pending SharedActivityInvite; both return the same
        valid UUID string matching the database record.
        """
        from django.db import connection
        outcomes = []
        barrier = threading.Barrier(2)

        def invite():
            barrier.wait(timeout=10)
            try:
                inv = self.service.invite(
                    inviter_id=str(self.inviter.pk),
                    invitee_id=str(self.invitee.pk),
                    content_key="art_therapy_01",
                    content_revision=1,
                )
                outcomes.append(str(inv.id))
            except Exception as exc:
                outcomes.append((type(exc).__name__, getattr(exc, "details", {})))
            finally:
                connection.close()

        threads = [threading.Thread(target=invite) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)
            self.assertFalse(t.is_alive())

        self.assertEqual(len(outcomes), 2)
        # Assert both outcomes are valid UUID strings (not exception tuples)
        self.assertTrue(isinstance(outcomes[0], str), f"Outcome 0 was not a string: {outcomes[0]}")
        self.assertTrue(isinstance(outcomes[1], str), f"Outcome 1 was not a string: {outcomes[1]}")
        self.assertEqual(outcomes[0], outcomes[1])

        pending_invites = list(SharedActivityInvite.objects.filter(
            content_key="art_therapy_01",
            inviter_id=self.inviter.pk,
            invitee_id=self.invitee.pk,
            status=INVITE_PENDING,
        ))
        self.assertEqual(len(pending_invites), 1)
        self.assertEqual(outcomes[0], str(pending_invites[0].id))

    def test_concurrent_invite_different_revision_conflict(self):
        """Two concurrent calls with DIFFERENT revisions:
        One wins and returns a valid UUID; the other cleanly receives
        RevisionConflict (409) and does not overwrite the winner's revision.
        """
        from django.db import connection
        outcomes = []
        barrier = threading.Barrier(2)

        def invite_rev(rev):
            barrier.wait(timeout=10)
            try:
                inv = self.service.invite(
                    inviter_id=str(self.inviter.pk),
                    invitee_id=str(self.invitee.pk),
                    content_key="art_therapy_01",
                    content_revision=rev,
                )
                outcomes.append(("ok", rev, str(inv.id)))
            except Exception as exc:
                outcomes.append((type(exc).__name__, rev, getattr(exc, "details", {})))
            finally:
                connection.close()

        t1 = threading.Thread(target=invite_rev, args=(1,))
        t2 = threading.Thread(target=invite_rev, args=(2,))
        t1.start()
        t2.start()
        t1.join(timeout=10)
        t2.join(timeout=10)
        self.assertFalse(t1.is_alive())
        self.assertFalse(t2.is_alive())

        self.assertEqual(len(outcomes), 2)
        successes = [o for o in outcomes if o[0] == "ok"]
        conflicts = [o for o in outcomes if o[0] == "RevisionConflict"]
        self.assertEqual(len(successes), 1, f"Expected exactly 1 success, got {outcomes}")
        self.assertEqual(len(conflicts), 1, f"Expected exactly 1 conflict, got {outcomes}")

        winning_rev = successes[0][1]
        winning_id = successes[0][2]
        self.assertEqual(conflicts[0][2].get("reason"), "pending_invite_revision_mismatch")

        pending_invites = list(SharedActivityInvite.objects.filter(
            content_key="art_therapy_01",
            inviter_id=self.inviter.pk,
            invitee_id=self.invitee.pk,
            status=INVITE_PENDING,
        ))
        self.assertEqual(len(pending_invites), 1)
        self.assertEqual(str(pending_invites[0].id), winning_id)
        self.assertEqual(pending_invites[0].content_revision, winning_rev)

    def test_direct_db_constraint_and_null_marker(self):
        """Direct database constraint tests:
        1. Duplicate active_marker (pending) raises IntegrityError at the DB level.
        2. Status change to accepted sets active_marker to NULL, allowing new pending invite.
        """
        from django.db import IntegrityError
        inv1 = SharedActivityInvite.objects.create(
            content_key="art_therapy_01", content_revision=1,
            inviter=self.inviter, invitee=self.invitee,
            status=INVITE_PENDING,
        )
        from django.db import transaction
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                SharedActivityInvite.objects.create(
                    content_key="art_therapy_01", content_revision=2,
                    inviter=self.inviter, invitee=self.invitee,
                    status=INVITE_PENDING,
                )

        inv1.status = INVITE_ACCEPTED
        inv1.save()

        inv2 = SharedActivityInvite.objects.create(
            content_key="art_therapy_01", content_revision=2,
            inviter=self.inviter, invitee=self.invitee,
            status=INVITE_PENDING,
        )
        self.assertNotEqual(inv1.id, inv2.id)

    def test_respond_and_reinvite_lifecycle(self):
        """Accepted/declined invite sets active_marker to NULL, allowing
        a fresh invite for the same content_key later.
        """
        inv1 = self.service.invite(
            inviter_id=str(self.inviter.pk),
            invitee_id=str(self.invitee.pk),
            content_key="art_therapy_01",
            content_revision=1,
        )
        self.assertEqual(inv1.status, INVITE_PENDING)

        self.service.respond(
            invitee_id=str(self.invitee.pk),
            invite_id=str(inv1.id),
            decision="accept",
        )
        inv1.refresh_from_db()
        self.assertEqual(inv1.status, INVITE_ACCEPTED)

        inv2 = self.service.invite(
            inviter_id=str(self.inviter.pk),
            invitee_id=str(self.invitee.pk),
            content_key="art_therapy_01",
            content_revision=1,
        )
        self.assertEqual(inv2.status, INVITE_PENDING)
        self.assertNotEqual(str(inv1.id), str(inv2.id))
