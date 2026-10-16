"""Suite de xuat ket noi hai chieu (F16): list/confirm/decline/cancel."""

import datetime as dt

from django.test import TestCase, override_settings

from family_bridge_core.timeutils import UTC
from family_bridge_features.f01_identity.models import (
    Connection, ConnectionInvite,
)

from ..models import CompanionProposal
from ..services.proposals import ProposalService
from .helpers import (
    ScopedThrottleTestCase, accept_service_consent, auth_header,
    make_class_account, make_proposal, make_session,
)

MD5_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
LIST_URL = "/api/v1/classroom/proposals"


def _confirm(client, token, proposal_id, payload=None):
    return client.post(f"{LIST_URL}/{proposal_id}/confirm",
                       payload or {}, content_type="application/json",
                       **auth_header(token))


def _decline(client, token, proposal_id, payload):
    return client.post(f"{LIST_URL}/{proposal_id}/decline", payload,
                       content_type="application/json", **auth_header(token))


def _cancel(client, token, proposal_id):
    return client.post(f"{LIST_URL}/{proposal_id}/cancel", {},
                       content_type="application/json", **auth_header(token))


def _seed_pair(class_ref="10A1"):
    student, student_user = make_class_account("HS001", "student",
                                               class_ref=class_ref)
    caregiver, caregiver_user = make_class_account("PH001", "caregiver",
                                                   class_ref=class_ref)
    proposal = make_proposal(student, caregiver)
    token_student, _ = make_session(student_user)
    token_caregiver, _ = make_session(caregiver_user)
    return student, caregiver, proposal, token_student, token_caregiver


class ListTests(ScopedThrottleTestCase):
    def test_list_only_own_proposals(self):
        student, caregiver, proposal, token_student, _ = _seed_pair()
        third, _third_user = make_class_account("HS002", "student")
        token_third, _ = make_session(third.user)

        own = self.client.get(LIST_URL, **auth_header(token_student))
        self.assertEqual(own.status_code, 200)
        results = own.json()["results"]
        self.assertEqual(len(results), 1)
        row = results[0]
        self.assertEqual(row["proposal_id"], str(proposal.id))
        self.assertEqual(row["status"], "proposed")
        self.assertEqual(row["my_role"], "student")
        self.assertFalse(row["my_confirmed"])
        self.assertFalse(row["counterpart_confirmed"])
        self.assertIn("display_name", row["counterpart"])
        self.assertEqual(row["counterpart"]["identity_basis"], "self_declared")
        self.assertIn("revision", row)

        stranger = self.client.get(LIST_URL, **auth_header(token_third))
        self.assertEqual(stranger.status_code, 200)
        self.assertEqual(stranger.json()["results"], [])

    def test_unauthenticated_list_401(self):
        response = self.client.get(LIST_URL)
        self.assertEqual(response.status_code, 401)


@override_settings(PASSWORD_HASHERS=MD5_HASHERS)
class ConfirmFlowTests(ScopedThrottleTestCase):
    def test_student_first_then_caregiver_connects_generation_1(self):
        student, caregiver, proposal, token_student, token_caregiver = _seed_pair()
        accept_service_consent(student.user)
        accept_service_consent(caregiver.user)

        first = _confirm(self.client, token_student, str(proposal.id))
        self.assertEqual(first.status_code, 200, first.content)
        body = first.json()
        self.assertEqual(body["status"], "awaiting_confirmation")
        self.assertTrue(body["my_confirmed"])
        self.assertFalse(body["counterpart_confirmed"])
        self.assertIsNone(body["connection"])
        self.assertEqual(Connection.objects.count(), 0)
        proposal.refresh_from_db()
        self.assertEqual(proposal.first_confirmed_role, "student")
        self.assertEqual(proposal.revision, 2)

        second = _confirm(self.client, token_caregiver, str(proposal.id))
        self.assertEqual(second.status_code, 200, second.content)
        body = second.json()
        self.assertEqual(body["status"], "connected")
        self.assertTrue(body["my_confirmed"])
        self.assertTrue(body["counterpart_confirmed"])
        self.assertIsNotNone(body["connection"])
        self.assertEqual(body["connection"]["status"], "active")
        self.assertEqual(body["connection"]["relationship_kind"], "primary")
        self.assertEqual(body["connection"]["generation"], 1)

        # Dung MOTT ket noi, canonical pair, trang thai active.
        self.assertEqual(Connection.objects.count(), 1)
        connection = Connection.objects.get()
        low_id, high_id = sorted([str(student.user_id), str(caregiver.user_id)])
        self.assertEqual(str(connection.party_low_id), low_id)
        self.assertEqual(str(connection.party_high_id), high_id)
        proposal.refresh_from_db()
        self.assertEqual(proposal.status, "connected")
        self.assertIsNotNone(proposal.invite_id)

    def test_reverse_order_caregiver_first(self):
        student, caregiver, proposal, token_student, token_caregiver = _seed_pair()
        accept_service_consent(student.user)
        accept_service_consent(caregiver.user)

        first = _confirm(self.client, token_caregiver, str(proposal.id))
        self.assertEqual(first.json()["status"], "awaiting_confirmation")
        proposal.refresh_from_db()
        self.assertEqual(proposal.first_confirmed_role, "caregiver")

        second = _confirm(self.client, token_student, str(proposal.id))
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.json()["connection"]["generation"], 1)
        self.assertEqual(Connection.objects.count(), 1)

    def test_sequential_double_confirm_loser_gets_business_error(self):
        student, caregiver, proposal, token_student, token_caregiver = _seed_pair()
        accept_service_consent(student.user)
        accept_service_consent(caregiver.user)

        _first = _confirm(self.client, token_student, str(proposal.id))
        replay = _confirm(self.client, token_student, str(proposal.id))
        self.assertEqual(replay.status_code, 400, replay.content)
        self.assertEqual(replay.json()["error"]["details"]["reason"],
                         "proposal_not_confirmable")

        second = _confirm(self.client, token_caregiver, str(proposal.id))
        self.assertEqual(second.status_code, 200)
        self.assertEqual(Connection.objects.count(), 1)

    def test_expected_revision_conflict_409(self):
        student, caregiver, proposal, token_student, _ = _seed_pair()
        accept_service_consent(student.user)
        response = _confirm(self.client, token_student, str(proposal.id),
                            {"expected_revision": 99})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["error"]["code"], "revision_conflict")
        self.assertEqual(response.json()["error"]["details"]["current_revision"],
                         proposal.revision)

    def test_consent_gate_then_pass_after_accept(self):
        student, caregiver, proposal, token_student, _ = _seed_pair()
        gated = _confirm(self.client, token_student, str(proposal.id))
        self.assertEqual(gated.status_code, 403)
        self.assertEqual(gated.json()["error"]["code"], "consent_required")
        self.assertEqual(gated.json()["error"]["details"]["purpose"], "service")

        accept_service_consent(student.user)
        ok = _confirm(self.client, token_student, str(proposal.id))
        self.assertEqual(ok.status_code, 200)

    def test_counterpart_inactive_403(self):
        student, caregiver, proposal, token_student, _ = _seed_pair()
        accept_service_consent(student.user)
        caregiver.user.is_active = False
        caregiver.user.save(update_fields=["is_active"])
        response = _confirm(self.client, token_student, str(proposal.id))
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["error"]["details"]["reason"],
                         "account_inactive")
        # Tai khoan CHINH MINH khong active: khong den duoc buoc confirm —
        # F01 resolve_session tu choi session cua user inactive (401), va
        # login gate cung chan inactive truoc khi phat session.
        caregiver.user.is_active = True
        caregiver.user.save(update_fields=["is_active"])
        student.user.is_active = False
        student.user.save(update_fields=["is_active"])
        response = _confirm(self.client, token_student, str(proposal.id))
        self.assertEqual(response.status_code, 401)

    def test_third_actor_404_no_leak(self):
        student, caregiver, proposal, _token_student, _ = _seed_pair()
        third, _user = make_class_account("HS002", "student")
        accept_service_consent(third.user)
        token_third, _ = make_session(third.user)
        response = _confirm(self.client, token_third, str(proposal.id))
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["error"]["details"]["reason"],
                         "proposal_not_found")

    def test_blocked_by_open_classic_invite_and_invite_kept(self):
        student, caregiver, proposal, token_student, token_caregiver = _seed_pair()
        accept_service_consent(student.user)
        accept_service_consent(caregiver.user)
        # Caregiver tu tao loi moi classic primary con mo.
        from family_bridge_features.f01_identity.services.invites import InviteService
        invite, _raw = InviteService().create_invite(
            inviter=caregiver.user, relationship_kind="primary")

        _first = _confirm(self.client, token_student, str(proposal.id))
        response = _confirm(self.client, token_caregiver, str(proposal.id))
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(response.json()["error"]["details"]["reason"],
                         "proposal_blocked_by_open_invite")
        # Loi moi cua caregiver KHONG bi huy ho (khong side-effect an).
        invite.refresh_from_db()
        self.assertEqual(invite.status, ConnectionInvite.INVITE_PENDING)
        # Proposal van o awaiting sau that bai.
        proposal.refresh_from_db()
        self.assertEqual(proposal.status, "awaiting_confirmation")

    def test_already_connected_precheck(self):
        student, caregiver, proposal, token_student, token_caregiver = _seed_pair()
        accept_service_consent(student.user)
        accept_service_consent(caregiver.user)
        # Tao ket noi active truoc bang luong invite classic.
        from family_bridge_features.f01_identity.services.invites import InviteService
        service = InviteService()
        invite, raw = service.create_invite(inviter=student.user,
                                            relationship_kind="primary")
        service.claim_invite(candidate=caregiver.user, raw_code=raw)
        service.inviter_confirm(inviter=student.user, invite_id=str(invite.id))
        self.assertEqual(Connection.objects.count(), 1)

        _first = _confirm(self.client, token_student, str(proposal.id))
        second = _confirm(self.client, token_caregiver, str(proposal.id))
        self.assertEqual(second.status_code, 400, second.content)
        self.assertEqual(second.json()["error"]["details"]["reason"],
                         "already_connected")
        # Chi MOTT ket noi — khong tao them.
        self.assertEqual(Connection.objects.count(), 1)

    def test_confirm_after_decline_400(self):
        student, caregiver, proposal, token_student, _ = _seed_pair()
        accept_service_consent(student.user)
        self.assertEqual(_decline(self.client, token_student, str(proposal.id),
                                  {"reason": "refused"}).status_code, 200)
        response = _confirm(self.client, token_student, str(proposal.id))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"]["details"]["reason"],
                         "proposal_not_confirmable")


class DeclineCancelTests(ScopedThrottleTestCase):
    def test_decline_both_sides_both_states(self):
        student, caregiver, proposal, token_student, token_caregiver = _seed_pair()
        accept_service_consent(student.user)
        # (1) caregiver tu choi khi proposed.
        response = _decline(self.client, token_caregiver, str(proposal.id),
                            {"reason": "wrong_pair"})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "declined")
        proposal.refresh_from_db()
        self.assertEqual(proposal.status, "declined")
        self.assertEqual(proposal.outcome_role, "caregiver")
        self.assertEqual(proposal.outcome_reason, "wrong_pair")
        self.assertEqual(proposal.revision, 2)

        # (2) student tu choi khi awaiting (proposal moi).
        fresh = make_proposal(student, caregiver)
        _first = _confirm(self.client, token_student, str(fresh.id))
        response = _decline(self.client, token_caregiver, str(fresh.id),
                            {"reason": "refused"})
        self.assertEqual(response.status_code, 200)
        fresh.refresh_from_db()
        self.assertEqual(fresh.status, "declined")
        self.assertEqual(fresh.outcome_role, "caregiver")
        self.assertEqual(fresh.outcome_reason, "refused")

    def test_decline_closes_open_underlying_invite(self):
        student, caregiver, proposal, token_student, token_caregiver = _seed_pair()
        accept_service_consent(student.user)
        # Giao dict evasive: gan invite con mo cho proposal (du lieu cu) de
        # chung minh nhanh dong invite hoat dong.
        from family_bridge_features.f01_identity.services.invites import InviteService
        invite, raw = InviteService().create_invite(
            inviter=student.user, relationship_kind="primary")
        InviteService().claim_invite(candidate=caregiver.user, raw_code=raw)
        CompanionProposal.objects.filter(pk=proposal.pk).update(invite=invite)
        response = _decline(self.client, token_student, str(proposal.id),
                            {"reason": "refused"})
        self.assertEqual(response.status_code, 200)
        invite.refresh_from_db()
        self.assertEqual(invite.status, ConnectionInvite.INVITE_CANCELED)

    def test_decline_invalid_reason_400(self):
        student, caregiver, proposal, token_student, _ = _seed_pair()
        response = _decline(self.client, token_student, str(proposal.id),
                            {"reason": "khongbilegacy"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"]["details"]["reason"],
                         "invalid_enum")

    def test_cancel_both_sides_outcome_reason(self):
        student, caregiver, proposal, token_student, token_caregiver = _seed_pair()
        response = _cancel(self.client, token_student, str(proposal.id))
        self.assertEqual(response.status_code, 200)
        proposal.refresh_from_db()
        self.assertEqual(proposal.status, "canceled")
        self.assertEqual(proposal.outcome_reason, "canceled_by_student")

        fresh = make_proposal(student, caregiver)
        _first = _confirm(self.client, token_student, str(fresh.id))
        response = _cancel(self.client, token_caregiver, str(fresh.id))
        self.assertEqual(response.status_code, 200)
        fresh.refresh_from_db()
        self.assertEqual(fresh.status, "canceled")
        self.assertEqual(fresh.outcome_reason, "canceled_by_caregiver")

    def test_actions_on_terminal_proposal_400(self):
        student, caregiver, proposal, token_student, _ = _seed_pair()
        _cancel(self.client, token_student, str(proposal.id))
        for action, caller_token in (("confirm", token_student),):
            response = _confirm(self.client, caller_token, str(proposal.id))
            self.assertEqual(response.status_code, 400)
            self.assertEqual(
                response.json()["error"]["details"]["reason"],
                "proposal_not_confirmable")
        response = _cancel(self.client, token_student, str(proposal.id))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"]["details"]["reason"],
                         "proposal_not_open")
        response = _decline(self.client, token_student, str(proposal.id),
                            {"reason": "refused"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"]["details"]["reason"],
                         "proposal_not_open")

    def test_third_actor_decline_cancel_404(self):
        student, caregiver, proposal, _token_student, _ = _seed_pair()
        third, _user = make_class_account("HS002", "student")
        token_third, _ = make_session(third.user)
        response = _decline(self.client, token_third, str(proposal.id),
                            {"reason": "refused"})
        self.assertEqual(response.status_code, 404)
        response = _cancel(self.client, token_third, str(proposal.id))
        self.assertEqual(response.status_code, 404)
