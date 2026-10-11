"""In-memory MessageTransport double implementing the F05 port contract.

Used by F03/F04/F10 tests until the real F05 transport exists. It enforces
the same guards the real transport must enforce (kinds allowlist,
idempotency replay/mismatch) so feature tests break loudly when F05 wires
differently at integration.
"""

import datetime as dt
from typing import Dict, Optional

from family_bridge_core.errors import (
    DuplicateKeyPayloadMismatch, InputInvalid, NotAuthorized,
)
from family_bridge_core.idempotency import send_payload_hash
from family_bridge_core.protocols import SentMessage
from family_bridge_core.timeutils import UTC

MESSAGE_KINDS = ("text", "emotion_card", "journal_reply", "mood_reply",
                 "listening_signal", "quick_reply")


class FakeMessageTransport:
    def __init__(self, connection_reader=None, now=None) -> None:
        self.messages: Dict[str, SentMessage] = {}
        self.by_key: Dict[tuple, str] = {}
        self.connection_reader = connection_reader
        self._now = now or (lambda: dt.datetime.now(tz=UTC))
        self.read_receipts: Dict[str, dt.datetime] = {}

    def send(self, *, sender_id: str, recipient_id: str, kind: str,
             approved_body: str, idempotency_key: str,
             payload_hash_hex: str, reply_to=None, context=None) -> SentMessage:
        if kind not in MESSAGE_KINDS:
            raise InputInvalid({"field": "kind", "reason": "kind_not_allowed"})
        if self.connection_reader is not None:
            conn = self.connection_reader.active_connection_between(
                user_a=sender_id, user_b=recipient_id)
            if conn is None:
                raise NotAuthorized({"reason": "no_active_connection"})
        replayed = self.by_key.get((str(sender_id), idempotency_key))
        if replayed is not None:
            existing = self.messages[replayed]
            if existing.payload_hash_hex != payload_hash_hex:
                raise DuplicateKeyPayloadMismatch({"reason": "same_key_different_payload"})
            return existing
        message = SentMessage(
            message_id=f"msg-{len(self.messages) + 1:06d}",
            sender_id=str(sender_id), recipient_id=str(recipient_id),
            kind=kind, approved_body=approved_body,
            idempotency_key=idempotency_key, payload_hash_hex=payload_hash_hex,
            connection_id=context.get("connection_id", "conn-test") if context else "conn-test",
            connection_generation=int((context or {}).get("connection_generation", 1)),
            created_at=self._now(), reply_to=str(reply_to) if reply_to else None,
        )
        self.messages[message.message_id] = message
        self.by_key[(str(sender_id), idempotency_key)] = message.message_id
        return message

    def mark_read(self, *, message_id: str, actor_id: str,
                  at: Optional[dt.datetime] = None) -> bool:
        message = self.messages.get(str(message_id))
        if message is None or str(actor_id) != message.recipient_id:
            raise NotAuthorized({"reason": "not_recipient"})
        stamp = at or self._now()
        current = self.read_receipts.get(message_id)
        if current is None or stamp < current:
            self.read_receipts[message_id] = stamp
        return True

    def lookup_by_idempotency_key(self, *, sender_id: str,
                                  idempotency_key: str) -> Optional[SentMessage]:
        found = self.by_key.get((str(sender_id), idempotency_key))
        return self.messages[found] if found else None

    # -- helpers for tests ----------------------------------------------------
    def hash_for(self, *, kind, recipient_id, body, reply_to=None,
                 context_revision=None) -> str:
        return send_payload_hash(kind=kind, recipient_id=str(recipient_id),
                                 body=body, reply_to=reply_to,
                                 context_revision=context_revision)
