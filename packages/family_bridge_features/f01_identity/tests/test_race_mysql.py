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


@unittest.skipIf(not MYSQL, SKIP_REASON)
class ConcurrentFirstLoginRaceTests(TransactionTestCase):
    """Review requirement: concurrent FIRST login of one Zalo identity on
    REAL MySQL — exactly one identity row, one user (no orphan), both
    logins succeed, no 500.

    Proves on MySQL (not claimable from SQLite): the loser of the
    UNIQUE(provider, app_id, provider_subject) race re-reads the winner and
    continues on the winning account, and its provisioning transaction
    rolled back the half-created user (no orphan User without identity).
    """

    def setUp(self):
        from ..services.identity import SessionService
        from ..services.zalo_provider import ZaloPlatformVerifier

        class ScriptedVerifier(ZaloPlatformVerifier):
            def _fetch_token_info(self, access_token):  # no network
                return {"id": "910112233445566"}

        self.service = SessionService(
            verifier=ScriptedVerifier(app_id="1234567890",
                                      app_secret="race-test-secret"),
            app_id="1234567890")

    def _run_two_logins(self):
        from django.db import connections

        outcomes = []
        barrier = threading.Barrier(2)

        def login():
            barrier.wait()
            try:
                user, raw_token, _ = self.service.login_with_zalo_token(
                    access_token="race-token")
                outcomes.append(("ok", str(user.pk), raw_token))
            except Exception as exc:  # noqa: BLE001 - record any failure shape
                outcomes.append(("error", type(exc).__name__, str(exc)))
            finally:
                # Each thread owns its own connection; close it so the test
                # runner does not leak sockets.
                connections.close_all()

        threads = [threading.Thread(target=login) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        return outcomes

    def test_concurrent_first_login_single_identity_no_orphan(self):
        from django.contrib.auth import get_user_model

        from ..models import ProviderIdentity, Session, hash_token

        outcomes = self._run_two_logins()

        # Both logins succeed — no 500, no unhandled IntegrityError leak.
        statuses = [outcome[0] for outcome in outcomes]
        self.assertEqual(statuses, ["ok", "ok"])

        # Exactly ONE internal user behind the identity; both sessions live
        # on THAT user.
        user_ids = {outcome[1] for outcome in outcomes}
        self.assertEqual(len(user_ids), 1)
        self.assertEqual(ProviderIdentity.objects.count(), 1)
        identity = ProviderIdentity.objects.get()
        self.assertEqual(identity.provider, "zalo")
        self.assertEqual(identity.provider_subject, "910112233445566")
        self.assertEqual(str(identity.user_id), outcomes[0][1])

        User = get_user_model()
        provisioning_users = User.objects.filter(
            username__startswith="zalo_1234567890_910112233445566")
        self.assertEqual(provisioning_users.count(), 1,
                         "the losing race must roll back its user insert")
        orphan_count = User.objects.filter(
            username__startswith="zalo_1234567890_").exclude(
            pk=identity.user_id).count()
        self.assertEqual(orphan_count, 0, "no user without a provider identity")

        # Two live sessions, both hashed server-side, both for the winner.
        for outcome in outcomes:
            self.assertTrue(Session.objects.filter(
                token_hash=hash_token(outcome[2]), user_id=identity.user_id,
                revoked_at__isnull=True).exists())
        self.assertEqual(Session.objects.count(), 2)

    def test_concurrent_relogin_of_existing_identity_same_user(self):
        # Second-race flavor: identity already provisioned, two fresh logins
        # at once must reuse the SAME user and never duplicate identities.
        from django.contrib.auth import get_user_model

        from ..models import ProviderIdentity, Session

        first_user, _, _ = self.service.login_with_zalo_token(
            access_token="race-token")
        Session.objects.all().delete()  # isolate the concurrent leg

        outcomes = self._run_two_logins()
        self.assertEqual([outcome[0] for outcome in outcomes], ["ok", "ok"])
        self.assertEqual({outcome[1] for outcome in outcomes},
                         {str(first_user.pk)})
        self.assertEqual(ProviderIdentity.objects.count(), 1)
        self.assertEqual(
            get_user_model().objects.filter(
                username__startswith="zalo_1234567890_").count(), 1)
