"""F15 API: privacy overview, grant revocation, deletion requests, consent
withdrawal (owner-only; admin actors get NO bypass — SEC-03/04)."""

from __future__ import annotations

import json

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from family_bridge_core.errors import (
    InputInvalid, ModuleUnavailable, NotFound,
)
from family_bridge_core.validation import (
    reject_unknown_fields, validate_enum, validate_uuid,
)

from .auth import FBSDSessionAuthentication
from .models import DeletionLedgerEvent, DeletionRequest
from .services.deletion import DeletionService
from .services import registry as grant_registry


def _json_body(request) -> dict:
    if not request.body:
        return {}
    if len(request.body) > 64 * 1024:
        raise InputInvalid({"reason": "body_too_large"})
    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as exc:
        raise InputInvalid({"reason": "malformed_json"}) from exc
    if not isinstance(payload, dict):
        raise InputInvalid({"reason": "must_be_object"})
    return payload


class PrivacyOverviewView(APIView):
    """GET /api/v1/privacy/overview — the owner's privacy page data."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        shared_by_me = []
        for item_type in grant_registry.registered_item_types():
            provider = grant_registry.get_grant_provider(item_type)
            for grant in provider.list_grants(owner_id=str(request.user.pk)):
                shared_by_me.append({
                    "item_type": item_type,
                    "item_id": grant["item_id"],
                    "recipient_id": grant["recipient_id"],
                    "approved_revision": grant["approved_revision"],
                    "revoked": grant.get("revoked", False),
                })
        # Connections come via the ConnectionReader port (F01 at integration;
        # harness fake in tests). Keep the shape minimal.
        connections = getattr(request, "_fb_connections", None)
        return Response({"shared_by_me": shared_by_me[:50],
                         "connections": connections or []})


class GrantRevokeView(APIView):
    """POST /api/v1/privacy/grants/{item_type}/{item_id}/revoke"""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, item_type: str, item_id: str):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"recipient_id", "expected_revision"})
        recipient_id = payload.get("recipient_id")
        if recipient_id is not None:
            validate_uuid(recipient_id, field="recipient_id")
        item_uuid = validate_uuid(item_id, field="item_id")
        try:
            outcome = grant_registry.revoke_grant(
                owner_id=str(request.user.pk), item_type=item_type,
                item_id=str(item_uuid), recipient_id=recipient_id,
                actor_ref=str(request.user.pk))
        except ModuleUnavailable as exc:
            raise exc
        if not outcome.get("found"):
            raise NotFound({"reason": "grant_not_found"})
        return Response({"item_type": item_type, "item_id": str(item_uuid),
                         "revoked": bool(outcome.get("revoked")),
                         "note": "Đọc mới bị chặn ngay; bản sao ngoài ứng dụng không thu hồi được."},
                        status=200)


class DeletionRequestView(APIView):
    """POST /api/v1/privacy/deletion-requests — owner requests deletion."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"categories"})
        service = DeletionService()
        result = service.request_deletion(user=request.user,
                                          categories=payload.get("categories"))
        status_code = 200 if result.get("duplicate") else 201
        return Response(result, status=status_code)


class DeletionRequestDetailView(APIView):
    """GET /api/v1/privacy/deletion-requests/{id} — OWNER ONLY; no admin
    bypass through is_staff/superuser (data access needs a real privacy
    role via B16 capabilities, and still never opens bodies)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, request_id: str):
        request_uuid = validate_uuid(request_id, field="request_id")
        row = (DeletionRequest.objects
               .filter(pk=str(request_uuid), user=request.user).first())
        if row is None:
            # Even is_staff/superuser actors receive 404 here (no bypass).
            raise NotFound({"reason": "deletion_request_not_found"})
        return Response({
            "request_id": str(row.pk),
            "status": row.status,
            "scope_categories": row.scope_categories,
            "requested_at": row.requested_at.isoformat(),
            "completed_at": row.completed_at.isoformat() if row.completed_at else None,
            "failure_detail": row.failure_detail,
            "note": ("Trạng thái là thật: khi có hạng mục chưa xử lý xong, "
                     "yêu cầu ở trạng thái failed_needs_action."),
        })


class DeletionRequestCancelView(APIView):
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, request_id: str):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"expected_revision"})
        expected = payload.get("expected_revision")
        if expected is not None and (isinstance(expected, bool)
                                     or not isinstance(expected, int)):
            raise InputInvalid({"field": "expected_revision",
                                "reason": "must_be_integer"})
        request_uuid = validate_uuid(request_id, field="request_id")
        service = DeletionService()
        row = service.cancel_request(user=request.user, request_id=str(request_uuid),
                                     expected_revision=expected)
        return Response({"request_id": str(row.pk), "status": row.status})


class ConsentWithdrawView(APIView):
    """POST /api/v1/privacy/consents/{purpose}/withdraw — via ConsentPort.

    The consent store belongs to F01 (ERD: identity); F15 wires through a
    local port so modules stay decoupled until B18 integration. Deny when
    port not configured (fail-closed, not a silent no-op)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, purpose: str):
        validate_enum(purpose, field="purpose",
                      allowed=["service", "ai_processing", "research"])
        writer = getattr(request, "_fb_consent_writer", None)
        if writer is None:
            raise ModuleUnavailable({"reason": "consent_port_not_wired"})
        result = writer.withdraw(user_id=str(request.user.pk), purpose=purpose)
        DeletionLedgerEvent.objects.create(
            target_user_id=str(request.user.pk), actor_ref=str(request.user.pk),
            event_type=DeletionLedgerEvent.EVENT_CONSENT_WITHDRAWN,
            payload={"purpose": purpose})
        return Response({"purpose": purpose, "withdrawn": bool(result)})
