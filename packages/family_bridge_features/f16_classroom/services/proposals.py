"""De xuat ket noi HS/PH hai chieu (F16) — list / confirm / decline / cancel.

Hai buoc xac nhan:
- Xac nhan thu NHIAT (status=proposed): chi chuyen sang awaiting_confirmation,
  ghi first_confirmed_role/at — KHONG tao invite, KHONG tao ket noi.
- Xac nhan thu HAI (status=awaiting_confirmation): trong CUNG transaction —
  pre-check loi sach (open invite classic cua nguoi xac nhan 2, ket noi
  active cua cap) roi dung InviteService cua F01: create_invite(inviter=nguoi
  xac nhan 2) -> claim_invite(candidate=nguoi xac nhan 1, rate_guard=None)
  -> inviter_confirm(...) → Connection active. Invite chi ton tai trong
  transaction → khong co window bi nguoi khac huy.

Cua membership (khong leak): proposal khong thuoc ve actor → 404
proposal_not_found — khong ke da ton tai hay khong.
"""

from __future__ import annotations

import datetime as dt

from django.db import transaction
from django.db.models import Q

from family_bridge_core.drf import cursor_paginate
from family_bridge_core.errors import (
    ConsentRequired, InputInvalid, NotAuthorized, NotFound, RevisionConflict,
)
from family_bridge_core.timeutils import UTC

from ..models import (
    PROPOSAL_AWAITING, PROPOSAL_CANCELED, PROPOSAL_CONNECTED,
    PROPOSAL_DECLINED, PROPOSAL_PROPOSED, PROPOSAL_TERMINAL_STATUSES,
    ROLE_CAREGIVER, ROLE_STUDENT, ClassAccount, CompanionProposal,
)

DECLINE_REASONS = ("refused", "wrong_pair")

_PAGE_SIZE = 20
_MAX_PAGE_SIZE = 50


def _now() -> dt.datetime:
    return dt.datetime.now(tz=UTC)


def _profile_of(user) -> dict:
    from family_bridge_features.f01_identity.services.display import display_profile
    return display_profile(user)


def _roles_for(proposal, actor) -> tuple:
    """(my_role, my_account, other_role, other_account) theo phia actor."""
    if str(proposal.student_account.user_id) == str(actor.pk):
        return (ROLE_STUDENT, proposal.student_account,
                ROLE_CAREGIVER, proposal.caregiver_account)
    return (ROLE_CAREGIVER, proposal.caregiver_account,
            ROLE_STUDENT, proposal.student_account)


def _confirmed_flags(status: str, first_confirmed_role, my_role: str,
                     other_role: str) -> tuple:
    """(my_confirmed, counterpart_confirmed) theo hop dong:
    my_confirmed=True iff (status==awaiting_confirmation and
    first_confirmed_role==my_role) or status==connected."""
    if status == PROPOSAL_CONNECTED:
        return True, True
    if status == PROPOSAL_AWAITING:
        return (first_confirmed_role == my_role,
                first_confirmed_role == other_role)
    return False, False


def _payload(proposal, my_role, my_confirmed, counterpart_confirmed) -> dict:
    other = (proposal.caregiver_account if my_role == ROLE_STUDENT
             else proposal.student_account)
    return {
        "proposal_id": str(proposal.id),
        "status": proposal.status,
        "my_role": my_role,
        "my_confirmed": my_confirmed,
        "counterpart_confirmed": counterpart_confirmed,
        "counterpart": _profile_of(other.user),
        "created_at": proposal.created_at.isoformat(),
        "updated_at": proposal.updated_at.isoformat(),
        # revision de UI gui dung expected_revision khi confirm (contract
        # confirm nhan expected_revision — client can doc revision tu day).
        "revision": proposal.revision,
    }


class ProposalService:
    def __init__(self, *, clock=None) -> None:
        self.clock = clock

    def _now(self) -> dt.datetime:
        return self.clock.now() if self.clock else _now()

    # -- list ---------------------------------------------------------------
    def list_for(self, user, *, cursor=None, limit: int = _PAGE_SIZE):
        """Danh sach proposal MA actor la 1 trong 2 ben, moi nhat truoc.

        Gioi han 50/trang (keyset theo updated_at, id) — khong full-scan
        payload. Doi user khong co ClassAccount → danh sach rong.
        """
        qs = (CompanionProposal.objects
              .filter(Q(student_account__user=user) | Q(caregiver_account__user=user))
              .select_related("student_account__user", "caregiver_account__user")
              .order_by("-updated_at", "-id"))
        limit = min(max(int(limit or _PAGE_SIZE), 1), _MAX_PAGE_SIZE)
        rows, next_cursor = cursor_paginate(
            qs, cursor=cursor, page_size=limit, timestamp_field="updated_at",
            id_field="id", descending=True)
        results = []
        for row in rows:
            my_role, _mine, other_role, _other = _roles_for(row, user)
            my_confirmed, counterpart_confirmed = _confirmed_flags(
                row.status, row.first_confirmed_role, my_role, other_role)
            results.append(_payload(row, my_role, my_confirmed,
                                    counterpart_confirmed))
        return results, next_cursor

    # -- helpers --------------------------------------------------------------
    @staticmethod
    def _locked_for(actor, proposal_id) -> CompanionProposal | None:
        """select_for_update + membership gate. Khong thuoc ve → None."""
        return (CompanionProposal.objects
                .select_for_update()
                .select_related("student_account__user", "caregiver_account__user")
                .filter(Q(student_account__user=actor) | Q(caregiver_account__user=actor))
                .filter(pk=proposal_id)
                .first())

    @staticmethod
    def _require_service_consent(user) -> None:
        from family_bridge_features.f01_identity.services.identity import has_active_consent
        from family_bridge_features.f01_identity.services.policy import SERVICE_CONSENT_PURPOSE
        if not has_active_consent(user.pk, SERVICE_CONSENT_PURPOSE):
            raise ConsentRequired({"purpose": SERVICE_CONSENT_PURPOSE})

    @staticmethod
    def _require_both_active(proposal) -> None:
        from django.contrib.auth import get_user_model
        User = get_user_model()
        if not (User.objects.filter(pk=proposal.student_account.user_id,
                                    is_active=True).exists()
                and User.objects.filter(pk=proposal.caregiver_account.user_id,
                                        is_active=True).exists()):
            raise NotAuthorized({"reason": "account_inactive"})

    @staticmethod
    def _pair_has_active_connection(user_a_id, user_b_id) -> bool:
        from family_bridge_features.f01_identity.models import CONNECTION_ACTIVE, Connection
        low_id, high_id = sorted([str(user_a_id), str(user_b_id)])
        return Connection.objects.filter(
            party_low_id=low_id, party_high_id=high_id,
            status=CONNECTION_ACTIVE).exists()

    @staticmethod
    def _actor_has_open_primary_invite(actor) -> bool:
        from family_bridge_features.f01_identity.models import (
            INVITE_AWAITING, INVITE_PENDING, ConnectionInvite,
        )
        return ConnectionInvite.objects.filter(
            inviter=actor, relationship_kind="primary",
            status__in=[INVITE_PENDING, INVITE_AWAITING]).exists()

    # -- confirm --------------------------------------------------------------
    @transaction.atomic
    def confirm(self, actor, proposal_id, *, expected_revision=None) -> dict:
        proposal = self._locked_for(actor, proposal_id)
        if proposal is None:
            raise NotFound({"reason": "proposal_not_found"})
        if proposal.status in PROPOSAL_TERMINAL_STATUSES:
            raise InputInvalid({"reason": "proposal_not_confirmable",
                                "status": proposal.status})
        if expected_revision is not None \
                and expected_revision != proposal.revision:
            raise RevisionConflict({"current_revision": proposal.revision})
        self._require_service_consent(actor)
        self._require_both_active(proposal)

        my_role, my_account, other_role, other_account = _roles_for(proposal, actor)
        now = self._now()

        if proposal.status == PROPOSAL_PROPOSED:
            # Xac nhan thu nhat: khong tao invite/connection o buoc nay.
            proposal.status = PROPOSAL_AWAITING
            proposal.first_confirmed_role = my_role
            proposal.first_confirmed_at = now
            proposal.revision += 1
            proposal.save(update_fields=["status", "first_confirmed_role",
                                         "first_confirmed_at", "revision",
                                         "updated_at"])
            return {"proposal_id": str(proposal.id),
                    "status": proposal.status,
                    "my_confirmed": True,
                    "counterpart_confirmed": False,
                    "connection": None}

        # status == awaiting_confirmation — xac nhan thu hai.
        if proposal.first_confirmed_role == my_role:
            # Actor da xac nhan o buoc mot — cho loi sach, khong phai 500.
            raise InputInvalid({"reason": "proposal_not_confirmable",
                                "status": proposal.status})
        if self._actor_has_open_primary_invite(actor):
            # Actor con loi moi classic kind=primary dang mo: huy hoac cho
            # no dong truoc, tranh hai luong ket noi chay song song.
            raise InputInvalid({"reason": "proposal_blocked_by_open_invite"})
        if self._pair_has_active_connection(proposal.student_account.user_id,
                                            proposal.caregiver_account.user_id):
            raise InputInvalid({"reason": "already_connected"})

        from family_bridge_features.f01_identity.services.invites import InviteService
        service = InviteService(clock=self.clock)
        invite, raw_code = service.create_invite(
            inviter=actor, relationship_kind="primary")
        other_user = other_account.user
        service.claim_invite(candidate=other_user, raw_code=raw_code,
                             rate_guard=None)
        _invite, connection = service.inviter_confirm(
            inviter=actor, invite_id=str(invite.id))

        proposal.invite = invite
        proposal.status = PROPOSAL_CONNECTED
        proposal.revision += 1
        proposal.save(update_fields=["invite", "status", "revision",
                                     "updated_at"])
        return {"proposal_id": str(proposal.id),
                "status": proposal.status,
                "my_confirmed": True,
                "counterpart_confirmed": True,
                "connection": {
                    "connection_id": str(connection.id),
                    "status": connection.status,
                    "relationship_kind": connection.relationship_kind,
                    "generation": connection.generation,
                }}

    # -- decline --------------------------------------------------------------
    @transaction.atomic
    def decline(self, actor, proposal_id, *, reason: str) -> dict:
        proposal = self._locked_for(actor, proposal_id)
        if proposal is None:
            raise NotFound({"reason": "proposal_not_found"})
        if proposal.status not in (PROPOSAL_PROPOSED, PROPOSAL_AWAITING):
            raise InputInvalid({"reason": "proposal_not_open",
                                "status": proposal.status})
        if reason not in DECLINE_REASONS:
            raise InputInvalid({"field": "reason", "reason": "invalid_enum",
                                "allowed": sorted(DECLINE_REASONS)})
        my_role, _mine, _other_role, _other = _roles_for(proposal, actor)
        self._close_open_invite(proposal, actor)
        proposal.status = PROPOSAL_DECLINED
        proposal.outcome_role = my_role
        proposal.outcome_reason = reason
        proposal.revision += 1
        proposal.save(update_fields=["status", "outcome_role", "outcome_reason",
                                     "revision", "updated_at"])
        my_confirmed, counterpart_confirmed = _confirmed_flags(
            proposal.status, proposal.first_confirmed_role, my_role, _other_role)
        return _payload(proposal, my_role, my_confirmed, counterpart_confirmed)

    # -- cancel ---------------------------------------------------------------
    @transaction.atomic
    def cancel(self, actor, proposal_id) -> dict:
        proposal = self._locked_for(actor, proposal_id)
        if proposal is None:
            raise NotFound({"reason": "proposal_not_found"})
        if proposal.status not in (PROPOSAL_PROPOSED, PROPOSAL_AWAITING):
            raise InputInvalid({"reason": "proposal_not_open",
                                "status": proposal.status})
        my_role, _mine, _other_role, _other = _roles_for(proposal, actor)
        self._close_open_invite(proposal, actor)
        proposal.status = PROPOSAL_CANCELED
        proposal.outcome_role = my_role
        proposal.outcome_reason = ("canceled_by_student" if my_role == ROLE_STUDENT
                                   else "canceled_by_caregiver")
        proposal.revision += 1
        proposal.save(update_fields=["status", "outcome_role", "outcome_reason",
                                     "revision", "updated_at"])
        my_confirmed, counterpart_confirmed = _confirmed_flags(
            proposal.status, proposal.first_confirmed_role, my_role, _other_role)
        return _payload(proposal, my_role, my_confirmed, counterpart_confirmed)

    # -- internal ---------------------------------------------------------------
    @staticmethod
    def _close_open_invite(proposal, actor) -> None:
        """Dong loi moi classic dang mo (neu co) cung huong voi proposal.

        Proposal mo (proposed/awaiting) thong thuat KHONG co invite — invite
        chi duoc tao trong transaction xac nhan thu hai. Nhung neu du lieu
        cu/co truong hop proposal co invite con mo thi dong no truoc khi
        terminal, dung dung machine cua F01 (candidate_decline /
        inviter_cancel). Khong tim thay / khong mo → bo qua.
        """
        if proposal.invite_id is None:
            return
        from family_bridge_features.f01_identity.models import (
            INVITE_AWAITING, INVITE_PENDING, ConnectionInvite,
        )
        from family_bridge_features.f01_identity.services.invites import InviteService

        invite = (ConnectionInvite.objects.select_for_update()
                  .filter(pk=proposal.invite_id).first())
        if invite is None or invite.status not in (INVITE_PENDING, INVITE_AWAITING):
            return
        service = InviteService()
        if str(invite.inviter_id) == str(actor.pk):
            service.inviter_cancel(inviter=actor, invite_id=str(invite.pk))
            return
        from family_bridge_core.errors import NotFound
        try:
            service.candidate_decline(candidate=actor, invite_id=str(invite.pk))
        except NotFound:
            # Actor khong phai candidate cua invite cu (du lieu khoi tao cu) —
            # proposal van dong, invite se het han theo TTL cua no.
            return
