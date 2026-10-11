"""Minimal audit event builder with redaction guard (SEC-22, WF-20).

Audit events carry: actor ref, action, target ref, outcome, reason,
server time and bounded metadata. They NEVER carry: journal/message/AI/survey
bodies, tokens, invite codes, phone numbers, raw survey answers or PII beyond
actor UUID refs. This module is the shared guard; the durable store owner is
B16/B17 (registry) — features write through the AuditWriter port.
"""

from __future__ import annotations

from typing import Any, Mapping, Optional

from .errors import sanitize_details

ACTION_MAX_CHARS = 120
TARGET_REF_MAX_CHARS = 200
METADATA_MAX_ITEMS = 20

FORBIDDEN_METADATA_KEYS = frozenset({
    "body", "approved_body", "original_text", "private_body", "prompt",
    "suggested_text", "token", "access_token", "refresh_token", "secret",
    "password", "invite_code", "code", "phone", "provider_subject",
    "note", "request_note", "answer", "validated_value", "content",
})


def build_audit_event(*, actor_id: str, action: str, target_ref: str,
                      outcome: str, reason: Optional[str] = None,
                      metadata: Optional[Mapping[str, Any]] = None) -> dict:
    """Build a redacted audit event dict. Raises ValueError on bad action.

    outcome: allowed | denied | error | revoked | published | ... (string,
    short, non-sensitive). Reason is bounded and safe-cleaned.
    """
    if not actor_id or not str(actor_id).strip():
        raise ValueError("actor_id required")
    if not action or len(action) > ACTION_MAX_CHARS or "/" in action:
        raise ValueError("invalid action")
    if not target_ref or len(target_ref) > TARGET_REF_MAX_CHARS:
        raise ValueError("invalid target_ref")
    cleaned_meta = {}
    if metadata:
        for key, value in list(metadata.items())[: METADATA_MAX_ITEMS * 2]:
            if str(key).lower() in FORBIDDEN_METADATA_KEYS:
                continue
            if len(cleaned_meta) >= METADATA_MAX_ITEMS:
                break
            cleaned_meta[str(key)] = value
    event = {
        "actor_id": str(actor_id),
        "action": action,
        "target_ref": str(target_ref),
        "outcome": str(outcome)[:64],
        "reason": (reason[:200] if reason else None),
        "metadata": sanitize_details(cleaned_meta),
    }
    return event
