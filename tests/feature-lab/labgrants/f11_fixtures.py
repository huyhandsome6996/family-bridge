"""TEST-ONLY MessageTransport double for F11 (port-conform): connection
guard via TestConnectionReader + idempotent replay per (sender, key) —
mimics the real F05 contract; B18 wires the real transport."""

import datetime as dt
import uuid

from family_bridge_core.errors import (
    DuplicateKeyPayloadMismatch, InputInvalid, NotAuthorized,
)
from family_bridge_core.protocols import SentMessage
from family_bridge_core.timeutils import UTC

from labgrants.f05_fixtures import TestConnectionReader


class FakeMessageTransport:
    ALLOWED_KINDS = {"text", "emotion_card", "journal_reply", "mood_reply",
                     "listening_signal", "quick_reply"}

    def __init__(self) -> None:
        self.sent = []
        self._by_key = {}

    def send(self, *, sender_id, recipient_id, kind, approved_body,
             idempotency_key, payload_hash_hex, reply_to=None, context=None):
        if kind not in self.ALLOWED_KINDS:
            raise InputInvalid({"field": "kind", "reason": "kind_not_allowed"})
        if not isinstance(approved_body, str) or not approved_body.strip():
            raise InputInvalid({"field": "body", "reason": "empty"})
        connection = TestConnectionReader().active_connection_between(
            user_a=str(sender_id), user_b=str(recipient_id))
        if connection is None:
            raise NotAuthorized({"reason": "no_active_connection"})
        cache_key = (str(sender_id), idempotency_key)
        if cache_key in self._by_key:
            prior = self._by_key[cache_key]
            if prior.payload_hash_hex != payload_hash_hex:
                raise DuplicateKeyPayloadMismatch(
                    {"reason": "same_key_different_payload"})
            return prior
        message = SentMessage(
            message_id=str(uuid.uuid4()), sender_id=str(sender_id),
            recipient_id=str(recipient_id), kind=kind,
            approved_body=approved_body, idempotency_key=idempotency_key,
            payload_hash_hex=payload_hash_hex,
            connection_id=str(connection.connection_id),
            connection_generation=connection.generation,
            created_at=dt.datetime.now(tz=UTC), reply_to=reply_to)
        self.sent.append(message)
        self._by_key[cache_key] = message
        return message

    def mark_read(self, *, message_id, actor_id, at=None):
        return True

    def lookup_by_idempotency_key(self, *, sender_id, idempotency_key):
        return self._by_key.get((str(sender_id), idempotency_key))
