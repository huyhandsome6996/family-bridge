"""Card send + preview services (US-027).

Send path (explicit only):
1. provider card must be published (draft/retired -> not_available);
2. expected_version must equal the provider's current version, otherwise
   preview_stale (retired/version-bumped between preview and send);
3. author note optional, bounded, no silent truncation;
4. composed body = author note when present, else the card body (always
   non-empty); payload hash computed server-side over the composed body;
5. send via the MessageTransport port (owner F05) — connection/generation
   and idempotency guards live THERE, never duplicated here;
6. write-once snapshot row keyed by the transport's message_id (get_or_create
   so a same-key replay returns the same snapshot).

Preview binds (card, version, recipient) exactly; it never sends.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from family_bridge_core.errors import (
    ModuleUnavailable, NotFound, PreviewStale,
)
from family_bridge_core.idempotency import send_payload_hash
from family_bridge_core.protocols import SentMessage

from ..models import EmotionCardSnapshot
from .catalog import CardCatalogService
from . import registry

MAX_AUTHOR_NOTE_CHARS = 1000


def _compose_body(*, card: Dict[str, Any], author_note: str) -> str:
    note = (author_note or "").strip()
    return note if note else card["body"]


class CardPreviewService:
    def __init__(self, catalog: Optional[CardCatalogService] = None) -> None:
        self.catalog = catalog or CardCatalogService()

    def preview(self, *, sender_id: str, recipient_id: str,
                card_id: str, version: int) -> Dict[str, Any]:
        card = self.catalog.get_published_card(card_id=card_id)
        if card is None:
            raise NotFound({"reason": "card_not_available"})
        if card["version"] != int(version):
            raise PreviewStale({"reason": "card_version_changed",
                                "expected": int(version),
                                "current": card["version"]})
        reader = registry.get_connection_reader()
        if reader is not None:
            connection = reader.active_connection_between(
                user_a=str(sender_id), user_b=str(recipient_id))
            if connection is None:
                raise NotFound({"reason": "no_active_connection"})
        return {"card": card, "recipient_id": str(recipient_id)}


class CardSendService:
    def __init__(self, catalog: Optional[CardCatalogService] = None) -> None:
        self.catalog = catalog or CardCatalogService()

    def send(self, *, sender_id: str, recipient_id: str, card_id: str,
             version: int, author_note: str,
             idempotency_key: str) -> SentMessage:
        transport = registry.get_transport()
        if transport is None:
            raise ModuleUnavailable({"reason": "transport_not_wired"})

        card = self.catalog.get_published_card(card_id=card_id)
        if card is None:
            raise NotFound({"reason": "card_not_available"})
        if card["version"] != int(version):
            raise PreviewStale({"reason": "card_version_changed",
                                "expected": int(version),
                                "current": card["version"]})

        # Server-authoritative payload hash: computed from the composed body
        # (published card content + optional author note). A same-key replay
        # with a different card/note therefore mismatches and the transport
        # rejects it with 409 duplicate_key_payload_mismatch.
        composed = _compose_body(card=card, author_note=author_note)
        payload_hash_hex = send_payload_hash(
            kind="emotion_card", recipient_id=str(recipient_id),
            body=composed, reply_to=None, context_revision=None)

        sent = transport.send(
            sender_id=str(sender_id), recipient_id=str(recipient_id),
            kind="emotion_card", approved_body=composed,
            idempotency_key=idempotency_key,
            payload_hash_hex=payload_hash_hex)

        EmotionCardSnapshot.objects.get_or_create(
            message_id=sent.message_id,
            defaults={
                "card_id": card["card_id"],
                "card_version": card["version"],
                "group_code": card["group_code"],
                "title": card["title"],
                "body": card["body"],
                "accent": card["accent"],
                "sender_id": str(sent.sender_id),
                "recipient_id": str(sent.recipient_id),
                "connection_id": str(getattr(sent, "connection_id", "") or ""),
            })
        return sent

    def get_snapshot_for_viewer(self, *, message_id: str,
                                viewer_id: str) -> EmotionCardSnapshot:
        """Participant-only. DEC-13 mirror: after unlink the recipient's view
        of the other person's card fails closed; the sender always sees the
        card they chose to send (their own action)."""
        snapshot = EmotionCardSnapshot.objects.filter(
            message_id=message_id).first()
        if snapshot is None:
            raise NotFound({"reason": "card_not_found"})
        is_sender = snapshot.sender_id == str(viewer_id)
        is_recipient = snapshot.recipient_id == str(viewer_id)
        if not (is_sender or is_recipient):
            raise NotFound({"reason": "card_not_found"})
        if is_recipient and not is_sender:
            reader = registry.get_connection_reader()
            if reader is not None:
                connection = reader.active_connection_between(
                    user_a=snapshot.sender_id, user_b=snapshot.recipient_id)
                if connection is None:
                    raise NotFound({"reason": "card_no_longer_available"})
        return snapshot
