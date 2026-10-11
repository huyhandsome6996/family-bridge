"""F06 API: drafts CRUD (author-only), pause/cancel, preview, confirm-send.

The 300-second value is server-owned and immutable here — no configuration
endpoint exists (WF-13). Admin has no read path. Help/listening requests
never enter this app (their endpoints live in F10/F13), so they are never
cooldown-gated by F06."""

from __future__ import annotations

import json

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from family_bridge_core.errors import InputInvalid
from family_bridge_core.timeutils import UTC
from family_bridge_core.validation import (
    reject_unknown_fields, validate_text, validate_uuid,
)

from .auth import FBSDSessionAuthentication
from .models import PAUSE_SECONDS
from .services.drafts import build_service


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


def _content_fields(payload: dict, *, require_all: bool) -> dict:
    allowed = {"kind", "body", "title", "card_id", "card_version",
               "recipient_id"}
    reject_unknown_fields(payload, allowed=allowed)
    fields = {
        "kind": validate_text(payload.get("kind"), field="kind",
                              min_len=1, max_len=16),
        "body": validate_text(payload.get("body"), field="body",
                              min_len=1, max_len=4000),
        "title": payload.get("title", ""),
        "card_id": payload.get("card_id", "") or "",
        "recipient_id": payload.get("recipient_id", "") or "",
    }
    if fields["title"]:
        fields["title"] = validate_text(fields["title"], field="title",
                                        min_len=0, max_len=200,
                                        allow_empty=True)
    if fields["card_id"]:
        fields["card_id"] = validate_text(fields["card_id"], field="card_id",
                                          min_len=1, max_len=64)
    version = payload.get("card_version")
    if version is not None:
        if isinstance(version, bool) or not isinstance(version, int) or version < 1:
            raise InputInvalid({"field": "card_version",
                                "reason": "must_be_positive_int"})
    fields["card_version"] = version
    if fields["recipient_id"]:
        fields["recipient_id"] = str(validate_uuid(
            fields["recipient_id"], field="recipient_id"))
    return fields


class DraftListView(APIView):
    """GET /api/v1/drafts — own active drafts (editing/paused), latest 20.
    POST /api/v1/drafts — create; AI linkage fields are unknown fields and
    are rejected (drafts store the FINAL approved content only)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = build_service().list_own(author_id=str(request.user.pk))
        now = build_service()._now()
        return Response({"results": [row.view(now=now) for row in rows],
                         "server_time": now.isoformat(),
                         "pause_seconds": PAUSE_SECONDS})

    def post(self, request):
        fields = _content_fields(_json_body(request), require_all=True)
        draft = build_service().create(author_id=str(request.user.pk),
                                      **fields)
        return Response(draft.view(now=build_service()._now()), status=201)


class DraftDetailView(APIView):
    """GET /api/v1/drafts/{id} — author-only, includes pause state and
    server_time (client renders countdown from the SERVER deadline).
    POST /api/v1/drafts/{id} — edit: revision bump invalidates previews;
    an existing pause deadline is intentionally NOT moved. DELETE — discard."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, draft_id: str):
        draft_uuid = validate_uuid(draft_id, field="draft_id")
        draft = build_service().get_own(author_id=str(request.user.pk),
                                       draft_id=str(draft_uuid))
        now = build_service()._now()
        view = draft.view(now=now)
        view["server_time"] = now.isoformat()
        return Response(view)

    def post(self, request, draft_id: str):
        draft_uuid = validate_uuid(draft_id, field="draft_id")
        # Ownership FIRST: non-owners get 404 before any input validation.
        draft = build_service().get_own(author_id=str(request.user.pk),
                                        draft_id=str(draft_uuid))
        fields = _content_fields(_json_body(request), require_all=True)
        fields.pop("kind")  # kind is immutable after create
        draft = build_service().edit(author_id=str(request.user.pk),
                                    draft_id=str(draft.id), **fields)
        return Response(draft.view(now=build_service()._now()))

    def delete(self, request, draft_id: str):
        draft_uuid = validate_uuid(draft_id, field="draft_id")
        draft = build_service().discard(author_id=str(request.user.pk),
                                       draft_id=str(draft_uuid))
        return Response({"draft_id": str(draft.id),
                         "status": draft.status})


class DraftPauseView(APIView):
    """POST /api/v1/drafts/{id}/pause — server records start/deadline
    (300s FIXED); re-pause never resets/extends. Cancel returns to editing."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, draft_id: str):
        draft_uuid = validate_uuid(draft_id, field="draft_id")
        reject_unknown_fields(_json_body(request), allowed=set())
        service = build_service()
        draft = service.start_pause(author_id=str(request.user.pk),
                                    draft_id=str(draft_uuid))
        now = service._now()
        view = draft.view(now=now)
        view["server_time"] = now.isoformat()
        return Response(view)

    def delete(self, request, draft_id: str):
        draft_uuid = validate_uuid(draft_id, field="draft_id")
        service = build_service()
        draft = service.cancel_pause(author_id=str(request.user.pk),
                                     draft_id=str(draft_uuid))
        return Response(draft.view(now=service._now()))


class DraftPreviewView(APIView):
    """POST /api/v1/drafts/{id}/preview — allowed only after the deadline
    (server clock); binds (revision, recipient, payload hash). Sends nothing,
    creates no job."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, draft_id: str):
        draft_uuid = validate_uuid(draft_id, field="draft_id")
        reject_unknown_fields(_json_body(request), allowed=set())
        preview = build_service().make_preview(author_id=str(request.user.pk),
                                              draft_id=str(draft_uuid))
        return Response(preview)


class DraftConfirmSendView(APIView):
    """POST /api/v1/drafts/{id}/confirm-send — the FINAL explicit confirm:
    unused preview + current revision + unchanged recipient + deadline
    passed; delegates through the per-kind sender port (one send path).
    Failure leaves the draft untouched and truthful."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, draft_id: str):
        draft_uuid = validate_uuid(draft_id, field="draft_id")
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"preview_id"})
        preview_id = payload.get("preview_id")
        if not preview_id:
            raise InputInvalid({"field": "preview_id", "reason": "required"})
        validate_uuid(preview_id, field="preview_id")
        result = build_service().confirm_send(
            author_id=str(request.user.pk), draft_id=str(draft_uuid),
            preview_id=str(preview_id))
        return Response(result)
