"""TEST-ONLY doubles for F03: card catalog provider + MessageTransport fake.

These are clearly-labelled test doubles for dependencies OUTSIDE this
branch's ownership (B16 published content, F05 transport). B18 wires the
real implementations. Nothing here may run in production — the provider
lives under tests/feature-lab/labgrants and is registered explicitly by
F03 tests.
"""

import datetime as dt
import uuid

from family_bridge_core.errors import (
    DuplicateKeyPayloadMismatch, InputInvalid, NotAuthorized,
)
from family_bridge_core.protocols import SentMessage
from family_bridge_core.timeutils import UTC

from labgrants.f05_fixtures import TestConnectionReader

# Published catalog fixture (synthetic content — never real approved copy;
# production cards come from B16 lifecycle after Thầy duyệt US-007).
_CARDS = [
    {"card_id": "card-thank-01", "version": 3, "group_code": "thuong",
     "title": "Cảm ơn con", "accent": "warm", "audience": "caregiver",
     "status": "published",
     "body": "Cảm ơn con đã chịu khó chia sẻ với bố mẹ nhé."},
    {"card_id": "card-miss-01", "version": 1, "group_code": "nho",
     "title": "Bố mẹ nhớ con", "accent": "calm", "audience": "caregiver",
     "status": "published",
     "body": "Hôm nay bố mẹ nhớ con nhiều."},
    {"card_id": "card-proud-01", "version": 2, "group_code": "tuhao",
     "title": "Bố mẹ tự hào", "accent": "bright", "audience": "caregiver",
     "status": "published",
     "body": "Bố mẹ thấy con đã cố gắng thật sự."},
    {"card_id": "card-hug-01", "version": 1, "group_code": "thuong",
     "title": "Ôm con một cái", "accent": "warm", "audience": "student",
     "status": "published",
     "body": "Con muốn gửi cả nhà một cái ôm nhé."},
    {"card_id": "card-draft-01", "version": 1, "group_code": "thuong",
     "title": "Bản nháp", "accent": "", "audience": "neutral",
     "status": "draft", "body": "KHÔNG BAO GIỜ hiện ra catalog."},
    {"card_id": "card-retired-01", "version": 4, "group_code": "nho",
     "title": "Thẻ đã nghỉ", "accent": "", "audience": "neutral",
     "status": "retired", "body": "Thẻ đã bị retire."},
]

_SUGGESTIONS = {
    "thuong": [
        {"code": "sg_thank_read", "text": "Bố mẹ đã đọc thẻ rồi, thương con.",
         "audience": "caregiver"},
        {"code": "sg_thank_more",
         "text": "Con muốn kể thêm cho bố mẹ nghe không?",
         "audience": "caregiver"},
    ],
    "nho": [
        {"code": "sg_miss_too", "text": "Con cũng nhớ bố mẹ lắm.",
         "audience": "student"},
    ],
    "tuhao": [
        {"code": "sg_proud_hug", "text": "Cảm ơn bố mẹ, con cũng tự hào.",
         "audience": "student"},
    ],
}


class TestCardProvider:
    """In-memory published-content double; test helpers may mutate it to
    simulate admin version bumps / retirement between preview and send."""

    def __init__(self) -> None:
        self._store = {c["card_id"]: dict(c) for c in _CARDS}

    def list_cards(self, *, group_code=None):
        cards = [dict(c) for c in self._store.values()]
        if group_code:
            cards = [c for c in cards if c["group_code"] == group_code]
        return cards

    def get_card(self, card_id):
        card = self._store.get(str(card_id))
        return dict(card) if card else None

    def reply_suggestions(self, *, group_code, audience=None):
        items = list(_SUGGESTIONS.get(str(group_code), []))
        if audience:
            items = [s for s in items if s["audience"] in (audience, "neutral")]
        return items

    # -- test mutation helpers (simulate admin content ops) ----------------
    def bump_version(self, card_id, *, new_body=None, status=None):
        card = self._store[card_id]
        card["version"] = int(card["version"]) + 1
        if new_body is not None:
            card["body"] = new_body
        if status is not None:
            card["status"] = status
        return dict(card)


class FakeMessageTransport:
    """Port-conform MessageTransport double mimicking F05 guards: kind
    allowlist, active-connection check (via TestConnectionReader),
    idempotent replay per (sender, key) with payload-hash mismatch -> 409.
    Records sends for assertions. NOT a message store."""

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
        reader = TestConnectionReader()
        connection = reader.active_connection_between(
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
            message_id=str(uuid.uuid4()),
            sender_id=str(sender_id), recipient_id=str(recipient_id),
            kind=kind, approved_body=approved_body,
            idempotency_key=idempotency_key,
            payload_hash_hex=payload_hash_hex,
            connection_id=str(connection.connection_id),
            connection_generation=connection.generation,
            created_at=dt.datetime.now(tz=UTC),
            reply_to=reply_to)
        self.sent.append(message)
        self._by_key[cache_key] = message
        return message

    def mark_read(self, *, message_id, actor_id, at=None):
        return True

    def lookup_by_idempotency_key(self, *, sender_id, idempotency_key):
        return self._by_key.get((str(sender_id), idempotency_key))
