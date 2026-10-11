"""TEST-ONLY doubles for F10: transport double with signal-aware lookups.

Mirrors the F05 transport contract (connection guard, idempotent replay,
recipient-only mark_read) plus the f10 lookup extension
find_message_for_viewer. Clearly TEST-ONLY; B18 wires an adapter over the
real F05 transport."""

import datetime as dt
import uuid

from family_bridge_core.errors import (
    DuplicateKeyPayloadMismatch, InputInvalid, NotFound, NotAuthorized,
)
from family_bridge_core.protocols import SentMessage
from family_bridge_core.timeutils import UTC

from labgrants.f05_fixtures import TestConnectionReader

_BODY_TO_NEED = {
    "Con cần được lắng nghe — con muốn trò chuyện với bố mẹ.": "muon_tro_chuyen",
    "Con cần được lắng nghe — con muốn có bố mẹ ở bên.": "muon_duoc_o_ben",
    "Con cần được lắng nghe — con muốn hẹn thời gian trao đổi.": "muon_hen_gio",
}


class FakeSignalTransport:
    ALLOWED_KINDS = {"text", "emotion_card", "journal_reply", "mood_reply",
                     "listening_signal", "quick_reply"}

    def __init__(self) -> None:
        self.sent = []
        self._by_key = {}
        self._by_id = {}
        self.read_at = {}

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
        self._by_id[message.message_id] = message
        return message

    def mark_read(self, *, message_id, actor_id, at=None):
        message = self._by_id.get(str(message_id))
        if message is None or str(actor_id) != str(message.recipient_id):
            raise NotFound({"reason": "message_not_found"})
        self.read_at.setdefault(str(message_id),
                                at or dt.datetime.now(tz=UTC))
        return True

    def find_message_for_viewer(self, *, message_id, viewer_id):
        message = self._by_id.get(str(message_id))
        if message is None:
            return None
        viewer = str(viewer_id)
        if viewer not in (str(message.sender_id), str(message.recipient_id)):
            return None
        need = _BODY_TO_NEED.get(message.approved_body)

        class _View:
            pass

        view = _View()
        view.approved_body = message.approved_body
        view.sender_id = message.sender_id
        view.recipient_id = message.recipient_id
        view.created_at = message.created_at
        view.read_at = self.read_at.get(str(message.message_id))
        return (view, need)
