"""AI expression service (US-029/US-033).

Refine flow (explicit user action only):
1. AI off / provider unwired / kill switch -> module_unavailable (503);
   manual writing is unaffected (nothing else in the app depends on AI).
2. Payload to the provider is MINIMAL: only the author-selected sentence
   (single `text` param) + purpose tag. Never history, journals, other
   users' data, or any context beyond the chosen sentence.
3. Provider output is UNTRUSTED TEXT: bounded, stored as data, rendered as
   text; never executed, never parsed as instructions, never auto-sent.
4. Idempotency: same author+key returns the SAME suggestion without a
   second provider call; same key different payload -> 409.
5. Provider failure modes map to truthful statuses: timeout/outage/quota ->
   temporarily_unavailable (503) with reason; malformed/oversized output ->
   temporarily_unavailable(provider_output_invalid). The author keeps what
   they typed (the client holds the draft; the server never received a send).
6. accept/discard are author-only, one-way; they NEVER send anything.
"""

from __future__ import annotations

import datetime as dt
from typing import Any, Dict, Optional

from django.db import transaction

from family_bridge_core.errors import (
    DuplicateKeyPayloadMismatch, InputInvalid, ModuleUnavailable,
    NotFound, TemporarilyUnavailable,
)
from family_bridge_core.idempotency import send_payload_hash
from family_bridge_core.timeutils import UTC
from family_bridge_core.validation import MAX_TEXT_CHARS

from ..models import (
    PURPOSES, STATUSES, STATUS_ACCEPTED, STATUS_DISCARDED, STATUS_SUGGESTED,
    AiSuggestion,
)
from . import registry

PROVIDER_TIMEOUT_SECONDS = 15


class _ProviderFailed(Exception):
    def __init__(self, reason: str) -> None:
        self.reason = reason


class AiExpressService:
    def _call_provider(self, *, text: str, purpose: str) -> Dict[str, Any]:
        provider = registry.get_ai_provider()
        if provider is None:
            raise ModuleUnavailable({"reason": "ai_unavailable_or_off"})
        try:
            result = provider.refine(text=text, purpose=purpose,
                                     timeout_seconds=PROVIDER_TIMEOUT_SECONDS)
        except Exception as exc:
            # Provider failures map to truthful 503 with the specific reason
            # (outage/timeout/quota) when the provider marks it via the
            # fb_provider_reason attribute; unknown crashes stay generic.
            reason = getattr(exc, "fb_provider_reason",
                             "provider_unexpected_failure")
            raise TemporarilyUnavailable({"reason": reason}) from exc
        if not isinstance(result, dict) or "suggested_text" not in result:
            raise TemporarilyUnavailable(
                {"reason": "provider_output_invalid"})
        suggested = result.get("suggested_text")
        if not isinstance(suggested, str) or not suggested.strip():
            raise TemporarilyUnavailable({"reason": "provider_output_invalid"})
        if len(suggested) > MAX_TEXT_CHARS:
            raise TemporarilyUnavailable(
                {"reason": "provider_output_invalid"})
        return {
            "suggested_text": suggested,
            "provider_id": str(result.get("provider_id", "unknown"))[:64],
            "model_revision": str(result.get("model_revision", "unknown"))[:64],
            "prompt_revision": str(result.get("prompt_revision", "unknown"))[:32],
        }

    @transaction.atomic
    def refine(self, *, author_id: str, original_text: str, purpose: str,
               idempotency_key: str) -> AiSuggestion:
        if purpose not in PURPOSES:
            raise InputInvalid({"field": "purpose", "reason": "purpose_not_allowed",
                                "allowed": list(PURPOSES)})
        if not isinstance(original_text, str) or not original_text.strip():
            raise InputInvalid({"field": "original_text", "reason": "empty"})
        if len(original_text) > MAX_TEXT_CHARS:
            raise InputInvalid({"field": "original_text",
                                "reason": "too_long", "max": MAX_TEXT_CHARS})

        payload_hash = send_payload_hash(kind="ai_refine", recipient_id="",
                                         body=original_text, reply_to=None,
                                         context_revision=None)

        existing = AiSuggestion.objects.filter(
            author_id=str(author_id), idempotency_key=idempotency_key).first()
        if existing is not None:
            if existing.payload_hash_hex != payload_hash:
                raise DuplicateKeyPayloadMismatch(
                    {"reason": "same_key_different_payload"})
            return existing  # replay: NO second provider call

        result = self._call_provider(text=original_text, purpose=purpose)
        return AiSuggestion.objects.create(
            author_id=str(author_id), purpose=purpose,
            status=STATUS_SUGGESTED,
            original_text=original_text,
            suggested_text=result["suggested_text"],
            provider_id=result["provider_id"],
            model_revision=result["model_revision"],
            prompt_revision=result["prompt_revision"],
            idempotency_key=idempotency_key,
            payload_hash_hex=payload_hash,
        )

    def _get_own(self, *, author_id: str, suggestion_id: str) -> AiSuggestion:
        suggestion = AiSuggestion.objects.filter(pk=suggestion_id).first()
        if suggestion is None or str(suggestion.author_id) != str(author_id):
            raise NotFound({"reason": "suggestion_not_found"})
        return suggestion

    def get_own(self, *, author_id: str, suggestion_id: str) -> AiSuggestion:
        return self._get_own(author_id=author_id, suggestion_id=suggestion_id)

    def list_own(self, *, author_id: str, limit: int = 20):
        return (AiSuggestion.objects.filter(author_id=str(author_id))
                .order_by("-created_at", "-id")[: max(1, min(limit, 20))])

    @transaction.atomic
    def decide(self, *, author_id: str, suggestion_id: str,
               decision: str) -> AiSuggestion:
        if decision not in (STATUS_ACCEPTED, STATUS_DISCARDED):
            raise InputInvalid({"field": "decision", "reason": "invalid_decision"})
        suggestion = self._get_own(author_id=author_id,
                                   suggestion_id=suggestion_id)
        if suggestion.status != STATUS_SUGGESTED:
            return suggestion  # one-way, idempotent
        suggestion.status = decision
        suggestion.decided_at = dt.datetime.now(tz=UTC)
        suggestion.save(update_fields=["status", "decided_at"])
        return suggestion

    def status(self) -> Dict[str, Any]:
        """Truthful availability: nothing about quality or approval."""
        provider = registry.get_ai_provider()
        return {"ai_enabled": provider is not None}
