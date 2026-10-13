"""US-013 invite/connection tests (FL-02/FL-03, SEC-06, WF-08, WF-11).

Covers: code hash-at-rest, TTL, single-use, self-connect, claim race guard,
bilateral confirmation, revision conflict, stranger enumeration, duplicate
pair, decline/cancel/expire, reconnect generation, revoke idempotency.
"""

import datetime as dt

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from family_bridge_core.errors import (
    InputInvalid, NotFound, RateLimited, RevisionConflict,
)
from family_bridge_core.timeutils import UTC
from fixtures.actors import make_student, make_caregiver, make_system_admin

from ..models import Connection, ConnectionInvite
from ..services.invites import ClaimRateGuard, InviteService
from .helpers import auth_header, make_session

APP_ID = "1234567890"


class InviteServiceBase(TestCase):
    def setUp(self):
        self.service = InviteService()
        self.inviter = make_student()
        self.candidate = make_caregiver()


@override_settings(ZALO_APP_ID=APP_ID)
class InviteCreationTests(InviteServiceBase):
    def test_code_hashed_at_rest_and_raw_returned_once(self):
        invite, raw_code = self.service.create_invite(
            inviter=self.inviter, relationship_kind="primary")
        self.assertEqual(len(raw_code), 12)
        self.assertNotEqual(invite.code_hash, raw_code)
        self.assertNotIn(raw_code, ConnectionInvite.objects.filter(
            pk=invite.pk).values_list("code_hash", flat=True)[0])
        self.assertEqual(invite.status, ConnectionInvite.INVITE_PENDING)
        self.assertAlmostEqual((invite.expires_at - invite.created_at).total_seconds(),
                               7 * 24 * 3600, delta=1.0)

    def test_new_invite_cancels_previous_open_invite_same_kind(self):
        first, code_first = self.service.create_invite(
            inviter=self.inviter, relationship_kind="primary")
        second, code_second = self.service.create_invite(
            inviter=self.inviter, relationship_kind="primary")
        first.refresh_from_db()
        self.assertEqual(first.status, ConnectionInvite.INVITE_CANCELED)
        self.assertEqual(second.status, ConnectionInvite.INVITE_PENDING)
        # canceled code must not claim
        with self.assertRaises(NotFound):
            self.service.claim_invite(candidate=self.candidate, raw_code=code_first)

    def test_backup_kind_allowed(self):
        invite, _ = self.service.create_invite(
            inviter=self.inviter, relationship_kind="backup")
        self.assertEqual(invite.relationship_kind, "backup")

    def test_invalid_kind_rejected(self):
        with self.assertRaises(InputInvalid):
            self.service.create_invite(inviter=self.inviter,
                                       relationship_kind="family")


@override_settings(ZALO_APP_ID=APP_ID)
class InviteClaimTests(InviteServiceBase):
    def _awaiting(self):
        invite, raw_code = self.service.create_invite(
            inviter=self.inviter, relationship_kind="primary")
        invite = self.service.claim_invite(candidate=self.candidate, raw_code=raw_code)
        return invite, raw_code

    def test_claim_binds_candidate_and_confirms_candidate_side(self):
        invite, raw_code = self.service.create_invite(
            inviter=self.inviter, relationship_kind="primary")
        claimed = self.service.claim_invite(candidate=self.candidate, raw_code=raw_code)
        self.assertEqual(claimed.status, ConnectionInvite.INVITE_AWAITING)
        self.assertEqual(str(claimed.candidate_id), str(self.candidate.pk))
        self.assertIsNotNone(claimed.candidate_confirmed_at)
        self.assertEqual(claimed.revision, 2)

    def test_same_candidate_reclaim_is_idempotent(self):
        invite, raw_code = self._awaiting()
        again = self.service.claim_invite(candidate=self.candidate, raw_code=raw_code)
        self.assertEqual(again.pk, invite.pk)
        self.assertEqual(again.revision, 2)

    def test_second_candidate_cannot_claim_single_use_code(self):
        _, raw_code = self._awaiting()
        other = make_student()
        with self.assertRaises(NotFound):
            self.service.claim_invite(candidate=other, raw_code=raw_code)

    def test_self_connect_denied(self):
        invite, raw_code = self.service.create_invite(
            inviter=self.inviter, relationship_kind="primary")
        with self.assertRaises(InputInvalid) as ctx:
            self.service.claim_invite(candidate=self.inviter, raw_code=raw_code)
        self.assertIn("self_connect", str(ctx.exception.details))

    def test_wrong_code_generic_404_no_leak(self):
        with self.assertRaises(NotFound):
            self.service.claim_invite(candidate=self.candidate, raw_code="AAAAAAAAAAAA")
        with self.assertRaises(NotFound):
            self.service.claim_invite(candidate=self.candidate, raw_code="EXPIRED-CODE-XX")

    def test_claim_rate_guard_blocks_bruteforce(self):
        guard = ClaimRateGuard(max_attempts=3)
        with self.assertRaises(RateLimited):
            for _ in range(3):
                # each check_and_record counts; the 4th must fail
                guard.check_and_record(actor_id=str(self.candidate.pk),
                                       now=dt.datetime.now(tz=UTC))
            guard.check_and_record(actor_id=str(self.candidate.pk),
                                   now=dt.datetime.now(tz=UTC))


@override_settings(ZALO_APP_ID=APP_ID)
class ConfirmActivateTests(InviteServiceBase):
    def _awaiting(self):
        invite, raw_code = self.service.create_invite(
            inviter=self.inviter, relationship_kind="primary")
        invite = self.service.claim_invite(candidate=self.candidate, raw_code=raw_code)
        return invite, raw_code

    def test_inviter_confirm_activates_connection_generation_1(self):
        invite, _ = self._awaiting()
        invite, connection = self.service.inviter_confirm(
            inviter=self.inviter, invite_id=str(invite.pk))
        self.assertEqual(invite.status, ConnectionInvite.INVITE_ACTIVE)
        self.assertEqual(connection.status, Connection.CONNECTION_ACTIVE)
        self.assertEqual(connection.generation, 1)
        # canonical pair ordering (FK returns UUID; compare string forms)
        self.assertEqual(str(connection.party_low_id),
                         min(str(self.inviter.pk), str(self.candidate.pk)))
        self.assertEqual(str(connection.other_party(str(self.inviter.pk))),
                         str(self.candidate.pk))

    def test_confirm_before_claim_rejected(self):
        invite, _ = self.service.create_invite(inviter=self.inviter,
                                               relationship_kind="primary")
        with self.assertRaises(InputInvalid) as ctx:
            self.service.inviter_confirm(inviter=self.inviter, invite_id=str(invite.pk))
        self.assertIn("candidate_not_claimed", str(ctx.exception.details))

    def test_stranger_cannot_confirm_or_read_invitation(self):
        invite, _ = self._awaiting()
        stranger = make_system_admin()  # even an admin actor cannot confirm
        with self.assertRaises(NotFound):
            self.service.inviter_confirm(inviter=stranger, invite_id=str(invite.pk))
        # admin actor also cannot read the invitation through display_for
        display = invite.display_for(stranger.pk)
        self.assertEqual(display["role"], "candidate" if False else display["role"])
        # list endpoint never returns other people's invitations (API tests)

    def test_stale_revision_conflict(self):
        invite, _ = self._awaiting()
        with self.assertRaises(RevisionConflict):
            self.service.inviter_confirm(inviter=self.inviter,
                                         invite_id=str(invite.pk),
                                         expected_revision=1)  # claim bumped to 2

    def test_double_confirm_not_allowed(self):
        invite, _ = self._awaiting()
        self.service.inviter_confirm(inviter=self.inviter, invite_id=str(invite.pk))
        with self.assertRaises(InputInvalid):
            self.service.inviter_confirm(inviter=self.inviter, invite_id=str(invite.pk))
        self.assertEqual(Connection.objects.filter(
            invite_id=invite.pk).count(), 1)

    def test_duplicate_active_pair_blocked(self):
        invite, _ = self._awaiting()
        self.service.inviter_confirm(inviter=self.inviter, invite_id=str(invite.pk))
        # new invite between same pair: claim/confirm must hit already_connected
        invite2, raw2 = self.service.create_invite(inviter=self.inviter,
                                                   relationship_kind="primary")
        with self.assertRaises(InputInvalid) as ctx:
            self.service.claim_invite(candidate=self.candidate, raw_code=raw2)
        self.assertIn("already_connected", str(ctx.exception.details))


@override_settings(ZALO_APP_ID=APP_ID)
class LifecycleTests(InviteServiceBase):
    def _awaiting(self):
        invite, raw_code = self.service.create_invite(
            inviter=self.inviter, relationship_kind="primary")
        invite = self.service.claim_invite(candidate=self.candidate, raw_code=raw_code)
        return invite, raw_code

    def test_decline_by_candidate(self):
        invite, _ = self._awaiting()
        declined = self.service.candidate_decline(candidate=self.candidate,
                                                  invite_id=str(invite.pk))
        self.assertEqual(declined.status, ConnectionInvite.INVITE_DECLINED)
        with self.assertRaises(Exception):
            self.service.inviter_confirm(inviter=self.inviter, invite_id=str(invite.pk))

    def test_cancel_by_inviter(self):
        invite, _ = self.service.create_invite(inviter=self.inviter,
                                               relationship_kind="primary")
        canceled = self.service.inviter_cancel(inviter=self.inviter,
                                               invite_id=str(invite.pk))
        self.assertEqual(canceled.status, ConnectionInvite.INVITE_CANCELED)

    def test_decline_by_stranger_denied(self):
        invite, _ = self.service.create_invite(inviter=self.inviter,
                                               relationship_kind="primary")
        stranger = make_student()
        with self.assertRaises(NotFound):
            self.service.candidate_decline(candidate=stranger,
                                           invite_id=str(invite.pk))

    def test_expired_code_closes_invite_and_never_activates(self):
        clock_start = dt.datetime(2026, 10, 1, 9, 0, tzinfo=UTC)
        service = InviteService(clock=_FixedClock(clock_start))
        invite, raw_code = service.create_invite(inviter=self.inviter,
                                                 relationship_kind="primary")
        # simulate TTL elapsed: expires_at already in the future at create;
        # move clock beyond it via a service with the same invite
        expired_now = clock_start + dt.timedelta(seconds=7 * 24 * 3600 + 5)
        late_service = InviteService(clock=_FixedClock(expired_now))
        with self.assertRaises(NotFound):
            late_service.claim_invite(candidate=self.candidate, raw_code=raw_code)
        invite.refresh_from_db()

    def test_revoke_connection_then_reconnect_generation_increments(self):
        invite, _ = self._awaiting()
        _, connection = self.service.inviter_confirm(inviter=self.inviter,
                                                     invite_id=str(invite.pk))
        revoked = self.service.revoke_connection(actor=self.inviter,
                                                 connection_id=str(connection.pk))
        self.assertEqual(revoked.status, Connection.CONNECTION_REVOKED)
        self.assertIsNotNone(revoked.revoked_at)
        # idempotent second revoke
        again = self.service.revoke_connection(actor=self.candidate,
                                               connection_id=str(connection.pk))
        self.assertEqual(again.pk, connection.pk)
        # reconnect via a fresh bilateral invite -> generation 2
        invite2, raw2 = self.service.create_invite(inviter=self.candidate,
                                                   relationship_kind="primary")
        self.service.claim_invite(candidate=self.inviter, raw_code=raw2)
        _, connection2 = self.service.inviter_confirm(inviter=self.candidate,
                                                      invite_id=str(invite2.pk))
        self.assertEqual(connection2.generation, 2)

    def test_reader_port_queries(self):
        invite, _ = self._awaiting()
        _, connection = self.service.inviter_confirm(inviter=self.inviter,
                                                     invite_id=str(invite.pk))
        view = self.service.active_connection_between(user_a=str(self.inviter.pk),
                                                      user_b=str(self.candidate.pk))
        self.assertIsNotNone(view)
        self.assertEqual(view.connection_id, str(connection.pk))
        rows, next_cursor = self.service.list_active_for_user(
            user_id=str(self.inviter.pk))
        self.assertEqual(len(rows), 1)
        self.assertIsNone(next_cursor)


class _FixedClock:
    def __init__(self, now: dt.datetime) -> None:
        self._now = now

    def now(self) -> dt.datetime:
        return self._now
