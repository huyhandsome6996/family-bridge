"""F06 AppConfig — production sender wiring (B18, one send path: F05/F03).

`ready()` registers the kind="text" draft sender onto the F06 port, backed
by the F05 MessageTransportService — the SINGLE production send path (F06
never inserts a Message row itself). Same defensive pattern as
family_bridge_features.f04_ai.apps.F04AiConfig:

- Lazy imports: f05 is imported INSIDE the sender function (and f06's own
  registry inside ready()) — no module-level cross-feature import, no
  circular import, and a narrowed build without f05 still boots.
- Never raises: if anything in the wiring fails, the kind simply stays
  unwired and confirm-send keeps failing CLOSED with 503
  sender_not_wired (truthful), boot is unaffected.
- kind="emotion_card" is intentionally NOT wired here: the card send
  service belongs to F03 (owner). Until F03 wires its port, confirm-send
  for cards stays 503 sender_not_wired — honest, never a silent insert.
- Idempotency: the key is derived deterministically from the draft
  identity (draft id + revision), so a retry after an unknown outcome
  (crash between the F05 commit and the F06 draft save) replays the SAME
  F05 message instead of duplicating it; F06's own draft_already_sent
  guard blocks the normal double-confirm before the port is even called.
"""

from django.apps import AppConfig

KIND_TEXT = "text"


def draft_idempotency_key(draft) -> str:
    """Deterministic per (draft, revision) — F05 replays same sender+key to
    the SAME message; a revision bump (new content) is a new key."""
    return f"draft:{draft.id}:rev:{draft.revision}"


def send_text_draft_via_f05(*, author_id: str, draft) -> dict:
    """Production port fn for kind="text": delegate the FINAL send to F05.

    Adds NO guard of its own — F05 transport is the authority (kind
    allowlist, body bounds, payload-hash recompute, active connection at
    current generation via the registered ConnectionReader, idempotent
    replay). Payload hash is recomputed from the draft exactly the way
    make_preview bound it (kind, recipient, body, no reply/context), so a
    confirm against the previewed revision always matches.
    """
    from family_bridge_core.idempotency import send_payload_hash
    from family_bridge_features.f05_inbox.services.transport import (
        MessageTransportService,
    )

    payload_hash = send_payload_hash(
        kind=KIND_TEXT, recipient_id=str(draft.recipient_id),
        body=draft.body, reply_to=None, context_revision=None)
    sent = MessageTransportService().send(
        sender_id=str(author_id),
        recipient_id=str(draft.recipient_id),
        kind=KIND_TEXT,
        approved_body=draft.body,
        idempotency_key=draft_idempotency_key(draft),
        payload_hash_hex=payload_hash,
        body_title=draft.title or "",
    )
    return {"message_id": str(sent.message_id)}


class F06DraftsConfig(AppConfig):
    name = "family_bridge_features.f06_drafts"
    label = "f06_drafts"
    verbose_name = "F06 Drafts + pause 300s (US-030/US-034)"

    def ready(self) -> None:
        """Startup wiring ONLY — no DB access, no network, never raises."""
        try:
            from .services import registry

            registry.register_sender(kind=KIND_TEXT,
                                     fn=send_text_draft_via_f05)
        except Exception as exc:  # noqa: BLE001 — wiring must never break boot
            import logging

            logging.getLogger(__name__).warning(
                "F06 text sender wiring skipped: %s", type(exc).__name__)
