"""F03 API: catalog (published only), exact preview, explicit send with
idempotency, participant-only snapshot, recipient reply suggestions.

Suggestions are display-only text (FL-11): nothing here creates a reply —
the recipient composes/confirms through the F05 messages endpoint.
"""

from __future__ import annotations

import json

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from family_bridge_core.errors import InputInvalid
from family_bridge_core.validation import (
    validate_idempotency_key, validate_revision, validate_text,
    validate_uuid, reject_unknown_fields, MAX_PAGE_SIZE,
)

from .auth import FBSDSessionAuthentication
from .services.catalog import CardCatalogService, MAX_CATALOG_WINDOW
from .services.sender import (
    MAX_AUTHOR_NOTE_CHARS, CardPreviewService, CardSendService,
)


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


def _card_id(value) -> str:
    return validate_text(value, field="card_id", min_len=1, max_len=64)


class CardCatalogListView(APIView):
    """GET /api/v1/cards — published catalog, bounded window (<= 50)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        group_raw = request.query_params.get("group")
        group = None
        if group_raw:
            group = validate_text(group_raw, field="group",
                                  min_len=1, max_len=32)
        try:
            limit = int(request.query_params.get("limit"))
        except (TypeError, ValueError):
            limit = MAX_CATALOG_WINDOW
        cards, truncated = CardCatalogService().list_cards(
            group_code=group, limit=min(max(limit, 1), MAX_CATALOG_WINDOW))
        return Response({"results": cards, "truncated": truncated,
                         "max_window": min(MAX_CATALOG_WINDOW, MAX_PAGE_SIZE)})


class CardPreviewView(APIView):
    """POST /api/v1/cards/preview — exact (card, version, recipient) binding;
    never sends; stale/retired versions rejected loudly."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={
            "card_id", "version", "recipient_id"})
        card_id = _card_id(payload.get("card_id"))
        version = validate_revision(payload.get("version"), field="version")
        recipient_id = validate_uuid(payload.get("recipient_id"),
                                     field="recipient_id")
        preview = CardPreviewService().preview(
            sender_id=str(request.user.pk), recipient_id=str(recipient_id),
            card_id=card_id, version=version)
        return Response(preview)


class CardSendView(APIView):
    """POST /api/v1/cards/send — explicit send through the MessageTransport
    port (F05). Requires X-Idempotency-Key. The payload hash is computed
    SERVER-SIDE from the composed body (published card + note), so a same-key
    replay with a different card/note is rejected 409 by the transport."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_scope = "send_message"

    def post(self, request):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={
            "card_id", "version", "recipient_id", "author_note"})
        key = request.META.get("HTTP_X_IDEMPOTENCY_KEY")
        if not key:
            raise InputInvalid({"field": "X-Idempotency-Key",
                                "reason": "required_for_send"})
        validate_idempotency_key(key)
        card_id = _card_id(payload.get("card_id"))
        version = validate_revision(payload.get("version"), field="version")
        recipient_id = validate_uuid(payload.get("recipient_id"),
                                     field="recipient_id")
        note = validate_text(payload.get("author_note", ""), field="author_note",
                             min_len=0, max_len=MAX_AUTHOR_NOTE_CHARS,
                             allow_empty=True)
        service = CardSendService()
        sent = service.send(
            sender_id=str(request.user.pk), recipient_id=str(recipient_id),
            card_id=card_id, version=version, author_note=note,
            idempotency_key=key)
        snapshot = service.get_snapshot_for_viewer(
            message_id=sent.message_id, viewer_id=str(request.user.pk))
        return Response({"message_id": sent.message_id, "state": "sent",
                         "card": snapshot.view()["card"]}, status=201)


class CardSnapshotDetailView(APIView):
    """GET /api/v1/cards/{message_id} — participant-only card snapshot
    (write-once at send). DEC-13 mirror: recipient view fails closed after
    unlink; sender keeps their own sent card."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, message_id: str):
        message_uuid = validate_uuid(message_id, field="message_id")
        snapshot = CardSendService().get_snapshot_for_viewer(
            message_id=str(message_uuid), viewer_id=str(request.user.pk))
        return Response(snapshot.view())


class CardReplySuggestionsView(APIView):
    """GET /api/v1/cards/{message_id}/reply-suggestions — recipient-only
    published suggestions (audience/xưng hô fit). Suggestions NEVER auto-send;
    replying goes through the F05 messages endpoint with explicit confirm."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, message_id: str):
        message_uuid = validate_uuid(message_id, field="message_id")
        viewer_id = str(request.user.pk)
        service = CardSendService()
        snapshot = service.get_snapshot_for_viewer(
            message_id=str(message_uuid), viewer_id=viewer_id)
        if snapshot.recipient_id != viewer_id:
            from family_bridge_core.errors import NotAuthorized
            raise NotAuthorized({"reason": "suggestions_for_recipient_only"})
        audience = request.query_params.get("audience") or None
        if audience:
            audience = validate_text(audience, field="audience",
                                     min_len=1, max_len=16)
        suggestions = CardCatalogService().reply_suggestions(
            card={"group_code": snapshot.group_code}, audience=audience)
        return Response({"results": suggestions})
