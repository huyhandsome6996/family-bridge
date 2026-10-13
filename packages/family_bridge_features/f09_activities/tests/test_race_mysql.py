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


class _PublishedContentDouble:
    def list_published(self, limit=50):
        return [{
            "content_key": "art_therapy_01",
            "revision": 1,
            "kind": "activity",
            "title": "Art Activity",
            "body": "Body text",
            "audience": "neutral",
            "status": "published",
        }]


class _ActiveConnectionDouble:
    def active_connection_between(self, *, user_a: str, user_b: str):
        return {"connection_id": "test_conn_id", "status": "active"}


@unittest.skipIf(not MYSQL, SKIP_REASON)
class SharedActivityInviteRaceTests(TransactionTestCase):
    def setUp(self):
        f09_registry.register_content_reader(_PublishedContentDouble())
        f09_registry.register_connection_reader(_ActiveConnectionDouble())
        self.service = ActivityService()
        self.inviter = make_student()
        self.invitee = make_caregiver()

    def tearDown(self):
        f09_registry.reset_registries()

    def test_concurrent_invite_single_pending_invite(self):
        """Two concurrent calls to ActivityService.invite produce exactly 1
        pending SharedActivityInvite; both return the same invite ID safely.
        """
        outcomes = []
        barrier = threading.Barrier(2)

        def invite():
            barrier.wait()
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

        threads = [threading.Thread(target=invite) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(len(outcomes), 2)
        self.assertEqual(outcomes[0], outcomes[1])

        pending_invites = SharedActivityInvite.objects.filter(
            content_key="art_therapy_01",
            inviter_id=self.inviter.pk,
            invitee_id=self.invitee.pk,
            status=INVITE_PENDING,
        )
        self.assertEqual(pending_invites.count(), 1)

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
