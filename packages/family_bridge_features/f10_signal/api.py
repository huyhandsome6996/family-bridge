"""F10 API: signal meta, preview binding, explicit send (idempotent),
participant-only signal view, recipient-only ack. No broadcast endpoint
exists anywhere; help stays reachable from the client regardless."""

from __future__ import annotations

import json

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from family_bridge_core.errors import InputInvalid
from family_bridge_core.validation import (
    reject_unknown_fields, validate_idempotency_key, validate_uuid,
)

from .auth import FBSDSessionAuthentication
from .services.signal import SignalService


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


class SignalMetaView(APIView):
    """GET /api/v1/signals/meta — need allowlist with labels."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(SignalService().meta())


class SignalPreviewView(APIView):
    """POST /api/v1/signals/preview — exact (need, recipient) binding with
    the canonical body text; never sends."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"need", "recipient_id"})
        recipient_id = validate_uuid(payload.get("recipient_id"),
                                     field="recipient_id")
        need = payload.get("need")
        if not isinstance(need, str):
            raise InputInvalid({"field": "need", "reason": "must_be_string"})
        return Response(SignalService().preview(
            sender_id=str(request.user.pk), recipient_id=str(recipient_id),
            need=need))


class SignalSendView(APIView):
    """POST /api/v1/signals/send — EXPLICIT send through the message
    transport (kind listening_signal, never cooldown-gated by F06). Requires
    X-Idempotency-Key. DTO = (need, recipient) only — no draft/AI content."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_scope = "send_message"

    def post(self, request):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"need", "recipient_id"})
        key = request.META.get("HTTP_X_IDEMPOTENCY_KEY")
        if not key:
            raise InputInvalid({"field": "X-Idempotency-Key",
                                "reason": "required_for_send"})
        validate_idempotency_key(key)
        recipient_id = validate_uuid(payload.get("recipient_id"),
                                     field="recipient_id")
        need = payload.get("need")
        if not isinstance(need, str):
            raise InputInvalid({"field": "need", "reason": "must_be_string"})
        result = SignalService().send(
            sender_id=str(request.user.pk), recipient_id=str(recipient_id),
            need=need, idempotency_key=key)
        return Response(result, status=201)


class SignalDetailView(APIView):
    """GET /api/v1/signals/{message_id} — participant-only; truthful read
    state; no response does NOT trigger anything (client shows manual
    options: other supporter / help directory)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, message_id: str):
        message_uuid = validate_uuid(message_id, field="message_id")
        return Response(SignalService().get_for_viewer(
            message_id=str(message_uuid), viewer_id=str(request.user.pk)))


class SignalAckView(APIView):
    """POST /api/v1/signals/{message_id}/ack — recipient-only read receipt
    (idempotent). Ack never auto-creates a reply or an appointment."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, message_id: str):
        message_uuid = validate_uuid(message_id, field="message_id")
        reject_unknown_fields(_json_body(request), allowed=set())
        return Response(SignalService().ack(
            message_id=str(message_uuid), actor_id=str(request.user.pk)))
