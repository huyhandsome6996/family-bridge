"""F01 API endpoints (/api/v1/auth, /api/v1/connections, /api/v1/consents).

Views are thin: explicit request parsing with field allowlists (SEC-05),
services own the business rules. Errors use the shared envelope.
"""

from __future__ import annotations

import json

from django.db.models import Q
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from family_bridge_core.errors import (
    ConsentRequired, InputInvalid, NotAuthenticated, NotFound,
    TemporarilyUnavailable,
)
from family_bridge_core.validation import (
    reject_unknown_fields, validate_enum, validate_text, validate_uuid,
)

from .auth import FBSDSessionAuthentication
from .models import Connection, ConnectionInvite, ConsentRecord
from .services.display import (
    display_name_of, display_profiles_for, save_display_name,
)
from .services.identity import (
    SessionService, has_active_consent, record_consent,
)
from .services.invites import (
    ClaimRateGuard, InviteService,
)
from .services.pagination import apply_keyset_page, clamp_limit
from .services.policy import SERVICE_CONSENT_PURPOSE, CURRENT_POLICY_VERSIONS
from .services.preview import preview_invite
from .services.zalo_provider import ZaloPlatformVerifier
from django.conf import settings as dj_settings


def _json_body(request) -> dict:
    if not request.body:
        raise InputInvalid({"reason": "empty_body"})
    if len(request.body) > 64 * 1024:
        raise InputInvalid({"reason": "body_too_large"})
    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as exc:
        raise InputInvalid({"reason": "malformed_json"}) from exc
    if not isinstance(payload, dict):
        raise InputInvalid({"reason": "must_be_object"})
    return payload


def _get_verifier() -> ZaloPlatformVerifier:
    return ZaloPlatformVerifier(
        app_id=getattr(dj_settings, "ZALO_APP_ID", ""),
        app_secret=getattr(dj_settings, "ZALO_APP_SECRET", ""),
    )


def _get_invite_service() -> InviteService:
    return InviteService()


def _require_service_consent(user) -> None:
    """A05: connection-forming actions need an ACTIVE service consent.

    The gate is enforced server-side (the UI checkbox alone is not the
    control). Auth/consent/logout/help stay reachable without it, and
    AI/research remain optional — nothing else is gated here.
    """
    if not has_active_consent(user.pk, SERVICE_CONSENT_PURPOSE):
        raise ConsentRequired({"purpose": SERVICE_CONSENT_PURPOSE})


def _invite_payload(invite: ConnectionInvite, viewer_id,
                    profiles=None) -> dict:
    """display_for + revision + counterpart display profile (view-layer
    composition — models.py stays untouched, W036 ownership).

    `counterpart` is the OTHER party relative to the viewer with the
    self-declared display name (identity_basis="self_declared"); raw UUIDs
    and provider_subject are never included. revision lets the inviter send
    a real expected_revision on confirm (review finding: display_for alone
    carries no revision, so the UI used to send null unconditionally).

    `profiles` is a prebuilt {user_id: profile} map — list endpoints pass
    ONE batched lookup (no N+1); single-item responses omit it.
    """
    payload = dict(invite.display_for(viewer_id))
    payload["revision"] = invite.revision
    is_inviter = str(invite.inviter_id) == str(viewer_id)
    counterpart_id = invite.candidate_id if is_inviter else invite.inviter_id
    if counterpart_id is None:
        payload["counterpart"] = None
    elif profiles is not None:
        payload["counterpart"] = profiles.get(str(counterpart_id))
    else:
        payload["counterpart"] = display_profiles_for(
            [counterpart_id]).get(str(counterpart_id))
    return payload


class AuthSessionView(APIView):
    """POST /api/v1/auth/session — exchange Zalo credential for app session."""
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"access_token"})
        # A03: the credential must NOT go through validate_text — its control
        # char sanitizer silently rewrote tokens (e.g. stripped CR/NUL), which
        # is exactly the "silent sanitizer" the audit forbids for credentials.
        # Type check here; length + header-safe charset are enforced by the
        # service BEFORE any transport call, with no value echoed back.
        access_token = payload.get("access_token")
        if not isinstance(access_token, str):
            raise InputInvalid({"field": "access_token", "reason": "must_be_string"})
        service = SessionService(verifier=_get_verifier(),
                                 app_id=getattr(dj_settings, "ZALO_APP_ID", ""))
        user, raw_token, session = service.login_with_zalo_token(
            access_token=access_token)
        return Response({
            "token": raw_token,
            "token_type": "Bearer",
            "expires_at": session.expires_at.isoformat(),
            "user": {"id": str(user.pk),
                     "display_name": display_name_of(user)},
            # Consent snapshot: nothing is implied by login (WF-17). A05:
            # only purposes WITHOUT an active current-version acceptance are
            # listed — a stale list made the UI re-ask for settled consents.
            "consents_required": [
                purpose for purpose in ConsentRecord.PURPOSES
                if not has_active_consent(user.pk, purpose)
            ],
        }, status=200)


class AuthProfileView(APIView):
    """GET/PUT /api/v1/auth/me — own minimal profile.

    display_name is SELF-DECLARED (identity_basis=self_declared): the UI
    must label it as not Zalo-verified. It exists so the two parties can
    check they connect with the right person (FL-02); it grants nothing and
    never feeds authorization decisions.
    """
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({
            "user_id": str(request.user.pk),
            "display_name": display_name_of(request.user),
            "identity_basis": "self_declared",
        }, status=200)

    def put(self, request):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"display_name"})
        name = save_display_name(request.user, payload.get("display_name"))
        return Response({
            "user_id": str(request.user.pk),
            "display_name": name,
            "identity_basis": "self_declared",
        }, status=200)


class ConsentView(APIView):
    """POST /api/v1/consents — explicit per-purpose decision."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"purpose", "policy_version", "decision"})
        purpose = validate_enum(payload.get("purpose"), field="purpose",
                                allowed=ConsentRecord.PURPOSES)
        policy_version = validate_text(payload.get("policy_version"),
                                       field="policy_version", min_len=1, max_len=32)
        decision = validate_enum(payload.get("decision"), field="decision",
                                 allowed=["accepted", "declined"])
        record = record_consent(user=request.user, purpose=purpose,
                                policy_version=policy_version, decision=decision)
        return Response({"consent_id": str(record.id), "purpose": purpose,
                         "policy_version": policy_version, "decision": decision,
                         "recorded_at": record.recorded_at.isoformat()}, status=201)

    def get(self, request):
        """A09: bounded O(P) read — one indexed latest-row lookup per known
        purpose (3 purposes), never a full-history scan + Python dedupe.
        Every known purpose is listed (decision "none" when absent) so the
        contract stays stable for the UI."""
        latest: dict = {}
        for purpose in ConsentRecord.PURPOSES:
            row = (ConsentRecord.objects.filter(user=request.user, purpose=purpose)
                   .order_by("-recorded_at", "-id").first())
            if row is not None:
                latest[purpose] = row
        return Response({"consents": [
            {"purpose": p,
             "decision": (row.decision if row else "none"),
             "policy_version": (row.policy_version if row else None),
             "withdrawn": bool(row and row.withdrawn_at),
             "current": (row.policy_version == CURRENT_POLICY_VERSIONS.get(p))
             if row else False}
            for p in sorted(ConsentRecord.PURPOSES)
            for row in [latest.get(p)]
        ]})


class InviteView(APIView):
    """POST /api/v1/connections/invites — create invitation (returns code ONCE).
    GET /api/v1/connections/invites — only invitations the actor joins."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"relationship_kind"})
        kind = validate_enum(payload.get("relationship_kind", "primary"),
                             field="relationship_kind",
                             allowed=["primary", "backup"])
        _require_service_consent(request.user)
        invite, raw_code = _get_invite_service().create_invite(
            inviter=request.user, relationship_kind=kind)
        return Response({
            "invite_id": str(invite.id),
            "code": raw_code,                      # shown once; only hash stored
            "expires_at": invite.expires_at.isoformat(),
            "status": invite.status,
        }, status=201)

    def get(self, request):
        """A09: bounded keyset page (default 20, max 50) + next_cursor."""
        limit = clamp_limit(request.query_params.get("limit"))
        qs = (ConnectionInvite.objects
              .filter(Q(inviter=request.user) | Q(candidate=request.user))
              .exclude(status=ConnectionInvite.INVITE_ACTIVE)
              .order_by("-created_at", "-id"))
        rows, next_cursor = apply_keyset_page(
            qs, cursor=request.query_params.get("cursor"), limit=limit,
            descending=True)
        # ONE batched profile lookup for the whole page (no N+1).
        counterpart_ids = [
            (row.candidate_id if str(row.inviter_id) == str(request.user.pk)
             else row.inviter_id) for row in rows]
        profiles = display_profiles_for(
            cid for cid in counterpart_ids if cid is not None)
        return Response({"results": [
            _invite_payload(row, request.user.pk, profiles) for row in rows],
            "next_cursor": next_cursor})


class InvitePreviewView(APIView):
    """POST /api/v1/connections/invites/preview — read-only code check.

    Lets the code holder see WHO created the code (self-declared display
    name, labeled) and the proposed relationship BEFORE deciding to accept.
    Shares the claim rate budget; changes no state.
    """
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_scope = "invite_claim"

    def post(self, request):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"code"})
        code = validate_text(payload.get("code"), field="code",
                             min_len=4, max_len=64)
        meta = preview_invite(candidate=request.user, raw_code=code,
                              rate_guard=ClaimRateGuard())
        inviter_id = meta.pop("inviter_user_id")
        meta["counterpart"] = display_profiles_for([inviter_id]).get(inviter_id)
        meta["identity_basis"] = "self_declared"
        return Response(meta, status=200)


class InviteClaimView(APIView):
    """POST /api/v1/connections/invites/claim — candidate confirms."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_scope = "invite_claim"

    def post(self, request):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"code"})
        code = validate_text(payload.get("code"), field="code",
                             min_len=4, max_len=64)
        _require_service_consent(request.user)
        service = _get_invite_service()
        invite = service.claim_invite(candidate=request.user, raw_code=code,
                                      rate_guard=ClaimRateGuard())
        return Response(_invite_payload(invite, request.user.pk), status=200)


class InviteConfirmView(APIView):
    """POST /api/v1/connections/invites/{id}/confirm — inviter confirms."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, invite_id: str):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"expected_revision"})
        expected = payload.get("expected_revision")
        if expected is not None:
            if isinstance(expected, bool) or not isinstance(expected, int):
                raise InputInvalid({"field": "expected_revision",
                                    "reason": "must_be_integer"})
        _require_service_consent(request.user)
        invite_uuid = validate_uuid(invite_id, field="invite_id")
        service = _get_invite_service()
        invite, connection = service.inviter_confirm(
            inviter=request.user, invite_id=str(invite_uuid),
            expected_revision=expected)
        return Response({
            "invite": _invite_payload(invite, request.user.pk),
            "connection": {
                "connection_id": str(connection.id),
                "status": connection.status,
                "relationship_kind": connection.relationship_kind,
                "generation": connection.generation,
            },
        }, status=200)


class InviteDeclineView(APIView):
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, invite_id: str):
        invite_uuid = validate_uuid(invite_id, field="invite_id")
        invite = _get_invite_service().candidate_decline(
            candidate=request.user, invite_id=str(invite_uuid))
        return Response(_invite_payload(invite, request.user.pk), status=200)


class InviteCancelView(APIView):
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, invite_id: str):
        invite_uuid = validate_uuid(invite_id, field="invite_id")
        invite = _get_invite_service().inviter_cancel(
            inviter=request.user, invite_id=str(invite_uuid))
        return Response(_invite_payload(invite, request.user.pk), status=200)


class ConnectionListView(APIView):
    """GET /api/v1/connections — active connections of the actor."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        """A09: bounded keyset page (default 20, max 50) + next_cursor.
        Authorization filter is applied BEFORE pagination."""
        service = _get_invite_service()
        rows, next_cursor = service.list_active_for_user(
            user_id=str(request.user.pk),
            limit=clamp_limit(request.query_params.get("limit")),
            cursor=request.query_params.get("cursor"))
        counterpart_ids = [
            (v.party_b if v.party_a == str(request.user.pk) else v.party_a)
            for v in rows]
        profiles = display_profiles_for(counterpart_ids)
        return Response({"results": [
            {"connection_id": v.connection_id,
             "other_party_id": v.party_b if v.party_a == str(request.user.pk) else v.party_a,
             "relationship_kind": v.relationship_kind,
             "generation": v.generation,
             "status": v.status,
             "counterpart": profiles.get(
                 v.party_b if v.party_a == str(request.user.pk) else v.party_a)}
            for v in rows
        ], "next_cursor": next_cursor})


class ConnectionRevokeView(APIView):
    """POST /api/v1/connections/{id}/revoke — unlink (atomic, generation kept).

    R10 fix: the ACTUAL endpoint now invokes the F15 privacy adapter
    (revoke_connection_with_privacy) so dependent grants die in the SAME
    transaction and the per-party ``connection_revoked`` ledger events are
    appended on the real call path. When the f15_privacy package is not
    installed (minimal standalone F01 runs) the plain F01 service is used
    and the privacy coupling is documented as pending — never silently
    claimed as wired."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, connection_id: str):
        connection_uuid = validate_uuid(connection_id, field="connection_id")
        try:
            from family_bridge_features.f15_privacy.services.revocation import (
                revoke_connection_with_privacy,
            )
        except ImportError:
            revoke_connection_with_privacy = None
        if revoke_connection_with_privacy is not None:
            summary = revoke_connection_with_privacy(
                actor=request.user, connection_id=str(connection_uuid))
            return Response({
                "connection_id": summary["connection_id"],
                "status": summary["status"],
                "revoked_at": summary.get("revoked_at"),
                "generation": summary["generation"],
                "grants_revoked": summary.get("grants_revoked", 0),
                "note": "Kết nối mới phải qua lời mời hai bên; quyền đã thu hồi không hồi sinh.",
            }, status=200)
        connection = _get_invite_service().revoke_connection(
            actor=request.user, connection_id=str(connection_uuid))
        return Response({
            "connection_id": str(connection.id),
            "status": connection.status,
            "revoked_at": connection.revoked_at.isoformat() if connection.revoked_at else None,
            "generation": connection.generation,
            "note": "Kết nối mới phải qua lời mời hai bên; quyền đã thu hồi không hồi sinh.",
        }, status=200)


class LogoutView(APIView):
    """POST /api/v1/auth/logout — revoke current session (server-side)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        header = request.META.get("HTTP_AUTHORIZATION", "")
        raw = header[len("Bearer "):].strip() if header.startswith("Bearer ") else ""
        revoked = SessionService.revoke_by_token(raw)
        return Response({"revoked": bool(revoked)}, status=200)
