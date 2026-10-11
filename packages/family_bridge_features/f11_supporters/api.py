"""F11 API: supporter roles (student side), commitments (supporter side),
consent respond, revoke, explicit contact (NEW composed text only)."""

from __future__ import annotations

import json

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from family_bridge_core.errors import InputInvalid
from family_bridge_core.validation import (
    reject_unknown_fields, validate_idempotency_key, validate_text,
    validate_uuid,
)

from .auth import FBSDSessionAuthentication
from .services.supporters import SupporterService


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


class SupporterRoleListView(APIView):
    """GET /api/v1/supporters/roles — the student's own roles.
    POST — invite a supporter (explicit recipient; no broadcast)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = SupporterService().list_for_student(
            student_id=str(request.user.pk))
        return Response({"results": [row.view(viewer_id=request.user.pk)
                                     for row in rows]})

    def post(self, request):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={
            "supporter_id", "relationship_kind"})
        supporter_id = validate_uuid(payload.get("supporter_id"),
                                     field="supporter_id")
        kind = payload.get("relationship_kind")
        if not isinstance(kind, str):
            raise InputInvalid({"field": "relationship_kind",
                                "reason": "must_be_string"})
        role = SupporterService().invite(
            student_id=str(request.user.pk), supporter_id=str(supporter_id),
            relationship_kind=kind)
        return Response(role.view(viewer_id=request.user.pk), status=201)


class SupporterRoleDetailView(APIView):
    """GET — participant-only (student or supporter of THIS role)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, role_id: str):
        role_uuid = validate_uuid(role_id, field="role_id")
        role = SupporterService()._require_role(role_id=str(role_uuid))
        viewer = str(request.user.pk)
        if viewer not in (str(role.student_id), str(role.supporter_id)):
            from family_bridge_core.errors import NotFound
            raise NotFound({"reason": "role_not_found"})
        return Response(role.view(viewer))


class SupporterRespondView(APIView):
    """POST /api/v1/supporters/roles/{id}/respond — SUPPORTER-only
    accept/decline of their own pending role."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, role_id: str):
        role_uuid = validate_uuid(role_id, field="role_id")
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"decision"})
        decision = payload.get("decision")
        if decision not in ("accept", "decline"):
            raise InputInvalid({"field": "decision",
                                "reason": "invalid_decision"})
        role = SupporterService().respond(
            supporter_id=str(request.user.pk), role_id=str(role_uuid),
            decision=decision)
        return Response(role.view(viewer_id=request.user.pk))


class SupporterRevokeView(APIView):
    """POST — either party ends the role."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, role_id: str):
        role_uuid = validate_uuid(role_id, field="role_id")
        reject_unknown_fields(_json_body(request), allowed=set())
        role = SupporterService().revoke(actor_id=str(request.user.pk),
                                         role_id=str(role_uuid))
        return Response(role.view(viewer_id=request.user.pk))


class SupporterContactView(APIView):
    """POST /api/v1/supporters/roles/{id}/contact — student sends NEW
    self-composed text to THIS supporter. Old bodies are never copied;
    role validity + connection re-checked at send; idempotency key required."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_scope = "send_message"

    def post(self, request, role_id: str):
        role_uuid = validate_uuid(role_id, field="role_id")
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"body"})
        key = request.META.get("HTTP_X_IDEMPOTENCY_KEY")
        if not key:
            raise InputInvalid({"field": "X-Idempotency-Key",
                                "reason": "required_for_send"})
        validate_idempotency_key(key)
        body = validate_text(payload.get("body"), field="body",
                             min_len=1, max_len=4000)
        result = SupporterService().contact(
            student_id=str(request.user.pk), role_id=str(role_uuid),
            body=body, idempotency_key=key)
        return Response(result, status=201)


class SupporterCommitmentsView(APIView):
    """GET /api/v1/supporters/commitments — roles where I am the SUPPORTER
    (pending to answer / active commitments)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = SupporterService().list_for_supporter(
            supporter_id=str(request.user.pk))
        return Response({"results": [row.view(viewer_id=request.user.pk)
                                     for row in rows]})
