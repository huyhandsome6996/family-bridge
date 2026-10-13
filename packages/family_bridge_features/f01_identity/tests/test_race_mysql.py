"""Concurrency suites requiring real MySQL row locks (SEC-15, WT-02-03).

SQLite does not implement SELECT ... FOR UPDATE; these cases therefore run
ONLY when FB_TEST_DB=mysql (see harness settings) and are reported NOT_RUN
otherwise. They are skipped with an explicit reason — never counted as PASS
on SQLite.
"""

import os
import threading
import unittest

from django.test import TransactionTestCase

MYSQL = os.getenv("FB_TEST_DB", "sqlite") == "mysql"
SKIP_REASON = ("requires FB_TEST_DB=mysql: SQLite cannot prove row-lock/"
               "unique race semantics (DSA-07, verification plan)")

from fixtures.actors import make_student, make_caregiver  # noqa: E402

from ..models import Connection, ConnectionInvite
from ..services.invites import InviteService  # noqa: E402


@unittest.skipIf(not MYSQL, SKIP_REASON)
class BilateralConfirmRaceTests(TransactionTestCase):
    """WT-02-03: two racing confirms of the same invite → exactly one active
    connection; the loser receives a clean business error, no partial state."""

    def setUp(self):
        self.service = InviteService()
        self.inviter = make_student()
        self.candidate = make_caregiver()

    def test_double_confirm_single_connection(self):
        invite, raw_code = self.service.create_invite(
            inviter=self.inviter, relationship_kind="primary")
        self.service.claim_invite(candidate=self.candidate, raw_code=raw_code)
        outcomes = []
        barrier = threading.Barrier(2)

        def confirm():
            barrier.wait()
            try:
                self.service.inviter_confirm(inviter=self.inviter,
                                             invite_id=str(invite.pk))
                outcomes.append("ok")
            except Exception as exc:  # business error expected for the loser
                outcomes.append(type(exc).__name__)

        threads = [threading.Thread(target=confirm) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual(Connection.objects.filter(invite_id=invite.pk).count(), 1)
        self.assertIn("ok", outcomes)
        self.assertEqual(len(outcomes), 2)

    def test_claim_race_same_code_two_candidates(self):
        invite, raw_code = self.service.create_invite(
            inviter=self.inviter, relationship_kind="primary")
        other = make_caregiver()
        results = []
        barrier = threading.Barrier(2)

        def claim(candidate):
            barrier.wait()
            try:
                self.service.claim_invite(candidate=candidate, raw_code=raw_code)
                results.append("claimed")
            except Exception as exc:
                results.append(type(exc).__name__)

        threads = [threading.Thread(target=claim, args=(candidate,))
                   for candidate in (self.candidate, other)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        invite.refresh_from_db()
        self.assertEqual(results.count("claimed"), 1)
        self.assertEqual(invite.status, ConnectionInvite.INVITE_AWAITING)

    def test_two_different_invites_same_pair_concurrent_confirm(self):
        """Two different invites between the same pair of users confirmed concurrently:
        database-enforced uniqueness guarantees exactly 1 active connection,
        and the losing request cleanly receives InputInvalid(already_connected).
        Revoking the connection allows reconnecting with generation 2.
        """
        invite1, raw1 = self.service.create_invite(
            inviter=self.inviter, relationship_kind="primary")
        self.service.claim_invite(candidate=self.candidate, raw_code=raw1)

        invite2, raw2 = self.service.create_invite(
            inviter=self.candidate, relationship_kind="primary")
        self.service.claim_invite(candidate=self.inviter, raw_code=raw2)

        outcomes = []
        barrier = threading.Barrier(2)

        def confirm(inviter_user, inv_id):
            barrier.wait()
            try:
                self.service.inviter_confirm(inviter=inviter_user, invite_id=str(inv_id))
                outcomes.append("ok")
            except Exception as exc:
                outcomes.append((type(exc).__name__, getattr(exc, "details", {})))

        t1 = threading.Thread(target=confirm, args=(self.inviter, invite1.pk))
        t2 = threading.Thread(target=confirm, args=(self.candidate, invite2.pk))
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        low_id, high_id = sorted([str(self.inviter.pk), str(self.candidate.pk)])
        active_conns = Connection.objects.filter(
            party_low_id=low_id, party_high_id=high_id, status="active")
        self.assertEqual(active_conns.count(), 1)
        self.assertEqual(outcomes.count("ok"), 1)
        loser = [o for o in outcomes if o != "ok"][0]
        self.assertEqual(loser[0], "InputInvalid")
        self.assertEqual(loser[1].get("reason"), "already_connected")

        # Lifecycle: revoke and reconnect creates generation 2
        conn = active_conns.first()
        self.service.revoke_connection(actor=self.inviter, connection_id=str(conn.pk))
        conn.refresh_from_db()
        self.assertEqual(conn.status, "revoked")

        invite3, raw3 = self.service.create_invite(
            inviter=self.inviter, relationship_kind="primary")
        self.service.claim_invite(candidate=self.candidate, raw_code=raw3)
        _, conn2 = self.service.inviter_confirm(inviter=self.inviter, invite_id=str(invite3.pk))
        self.assertEqual(conn2.status, "active")
        self.assertEqual(conn2.generation, 2)
