"""F04 API: status, refine (idempotent), author-only suggestion list/detail,
accept/discard. No endpoint ever sends a message — final sending is the
user's explicit action through the F05 messages path with preview+confirm."""

from __future__ import annotations

import json

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from family_bridge_core.errors import InputInvalid
from family_bridge_core.validation import (
    validate_idempotency_key, validate_text, validate_uuid,
    reject_unknown_fields,
)

from .auth import FBSDSessionAuthentication
from .models import PURPOSES
from .services.express import AiExpressService, validate_input_revision


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


class AiStatusView(APIView):
    """GET /api/v1/ai/status — truthful availability flag only."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(AiExpressService().status())


class AiRefineView(APIView):
    """POST /api/v1/ai/refine — author asks for a rewrite of ONE chosen
    sentence. X-Idempotency-Key required: replay returns the SAME suggestion
    without a second provider call; same key different payload (text OR
    input_revision) -> 409. Consent `ai_processing` (current policy version)
    is enforced server-side BEFORE the provider call: 403 consent_required,
    provider_calls=0. Provider outage/quota/off -> 503 with reason; the
    client keeps the draft."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_scope = "ai_refine"

    def post(self, request):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"original_text", "purpose",
                                               "input_revision"})
        key = request.META.get("HTTP_X_IDEMPOTENCY_KEY")
        if not key:
            raise InputInvalid({"field": "X-Idempotency-Key",
                                "reason": "required_for_refine"})
        validate_idempotency_key(key)
        text = validate_text(payload.get("original_text"), field="original_text",
                             min_len=1, max_len=4000)
        purpose = validate_text(payload.get("purpose", "refine_expression"),
                                field="purpose", min_len=1, max_len=32)
        input_revision = validate_input_revision(payload.get("input_revision"))
        suggestion = AiExpressService().refine(
            author_id=str(request.user.pk), original_text=text,
            purpose=purpose, idempotency_key=key,
            input_revision=input_revision)
        return Response(suggestion.view(), status=201)


class AiSuggestionListView(APIView):
    """GET /api/v1/ai/suggestions — the AUTHOR'S own latest 20 (bounded)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = AiExpressService().list_own(author_id=str(request.user.pk))
        return Response({"results": [row.view() for row in rows]})


class AiSuggestionDetailView(APIView):
    """GET /api/v1/ai/suggestions/{id} — author-only; others get 404."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, suggestion_id: str):
        suggestion_uuid = validate_uuid(suggestion_id, field="suggestion_id")
        suggestion = AiExpressService().get_own(
            author_id=str(request.user.pk), suggestion_id=str(suggestion_uuid))
        return Response(suggestion.view())


class AiSuggestionAcceptView(APIView):
    """POST /api/v1/ai/suggestions/{id}/accept — author-only, one-way.
    Accepting does NOT send anything: the user still edits/previews/confirms
    the final send through the common path."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, suggestion_id: str):
        return _decide(request, suggestion_id, "accepted")


class AiSuggestionDiscardView(APIView):
    """POST /api/v1/ai/suggestions/{id}/discard — author-only, one-way."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, suggestion_id: str):
        return _decide(request, suggestion_id, "discarded")


def _decide(request, suggestion_id: str, decision: str):
    suggestion_uuid = validate_uuid(suggestion_id, field="suggestion_id")
    payload = _json_body(request)
    reject_unknown_fields(payload, allowed=set())
    suggestion = AiExpressService().decide(
        author_id=str(request.user.pk), suggestion_id=str(suggestion_uuid),
        decision=decision)
    return Response(suggestion.view())
