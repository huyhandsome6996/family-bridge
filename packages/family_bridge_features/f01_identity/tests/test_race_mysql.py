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
