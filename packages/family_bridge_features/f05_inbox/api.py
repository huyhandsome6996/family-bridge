"""F05 API: inbox list (cursor, minimal metadata), detail, send, read
receipt, quick replies, operation status lookup."""

from __future__ import annotations

import json

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from family_bridge_core.errors import InputInvalid, NotFound
from family_bridge_core.validation import (
    validate_enum, validate_idempotency_key, validate_page_size,
    validate_text, validate_uuid, reject_unknown_fields,
)

from .auth import FBSDSessionAuthentication
from .models import MESSAGE_KINDS, Message
from .services.registry import get_connection_reader
from .services.transport import MessageTransportService


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


class MessageListView(APIView):
    """GET /api/v1/messages — inbox cursor page; metadata only (DSA).
    POST /api/v1/messages — explicit send with idempotency key + hash.

    Clients compute payload hash via the documented canonical rule; mismatch
    means the client must re-preview, never a silent server-side correction.
    "sent" ≠ "delivered" ≠ "read"; receipt is the message id only.
    """
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_scope = "send_message"

    def get(self, request):
        page_size = validate_page_size(request.query_params.get("page_size"))
        cursor = request.query_params.get("cursor") or None
        service = MessageTransportService()
        rows, next_cursor = service.inbox_page(
            actor_id=str(request.user.pk), cursor=cursor, page_size=page_size)
        return Response({
            "next": next_cursor,
            "results": [row.list_view(request.user.pk) for row in rows],
        })

    def post(self, request):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={
            "kind", "recipient_id", "body", "title", "reply_to", "context"})
        key = request.META.get("HTTP_X_IDEMPOTENCY_KEY")
        if not key:
            raise InputInvalid({"field": "X-Idempotency-Key",
                                "reason": "required_for_send"})
        validate_idempotency_key(key)
        kind = validate_enum(payload.get("kind"), field="kind",
                             allowed=MESSAGE_KINDS)
        body = validate_text(payload.get("body"), field="body",
                             min_len=1, max_len=4000)
        recipient_id = validate_uuid(payload.get("recipient_id"),
                                     field="recipient_id")
        title = validate_text(payload.get("title", ""), field="title",
                              max_len=200, allow_empty=True)
        reply_to = payload.get("reply_to")
        if reply_to is not None:
            reply_to = str(validate_uuid(reply_to, field="reply_to"))
        from family_bridge_core.idempotency import send_payload_hash
        payload_hash = send_payload_hash(
            kind=kind, recipient_id=str(recipient_id), body=body,
            reply_to=reply_to,
            context_revision=(payload.get("context") or {}).get("revision"))
        service = MessageTransportService()
        sent = service.send(
            sender_id=str(request.user.pk), recipient_id=str(recipient_id),
            kind=kind, approved_body=body, idempotency_key=key,
            payload_hash_hex=payload_hash, reply_to=reply_to,
            context=payload.get("context"), body_title=title)
        return Response({"message_id": sent.message_id,
                         "created_at": sent.created_at.isoformat(),
                         "state": "sent"}, status=201)


class MessageDetailView(APIView):
    """GET /api/v1/messages/{id} — participant-only; DEC-13 fail-closed."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, message_id: str):
        message_uuid = validate_uuid(message_id, field="message_id")
        service = MessageTransportService()
        message = service.get_for_viewer(message_id=str(message_uuid),
                                         viewer_id=str(request.user.pk))
        return Response(message.detail_view(request.user.pk))


class MessageReadView(APIView):
    """POST /api/v1/messages/{id}/read — recipient-only, idempotent."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, message_id: str):
        message_uuid = validate_uuid(message_id, field="message_id")
        service = MessageTransportService()
        service.mark_read(message_id=str(message_uuid),
                          actor_id=str(request.user.pk))
        return Response({"read": True})


class QuickReplyListView(APIView):
    """GET /api/v1/messages/quick-replies — published templates via the
    content provider port; suggestions are NOT replies until user edits and
    confirms send (FL-11)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .services.registry import get_quick_reply_provider
        provider = get_quick_reply_provider()
        if provider is None:
            return Response({"results": [], "note": "library_not_configured"})
        return Response({"results": list(provider.list_templates(
            audience=request.query_params.get("audience") or None))[:20]})


class OperationStatusView(APIView):
    """GET /api/v1/operations/{key} — unknown outcome lookup (same key only,
    owner-only; unknown key returns not_found without leaking anything)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, idempotency_key: str):
        validate_idempotency_key(idempotency_key,
                                 field="idempotency_key")
        service = MessageTransportService()
        found = service.lookup_by_idempotency_key(
            sender_id=str(request.user.pk), idempotency_key=idempotency_key)
        if found is None:
            return Response({"idempotency_key": idempotency_key,
                             "state": "not_found"})
        return Response({"idempotency_key": idempotency_key,
                         "state": "sent", "message_id": found.message_id,
                         "created_at": found.created_at.isoformat()})
