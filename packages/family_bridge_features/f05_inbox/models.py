"""F05 models: Message — the ONE messaging table (US-021/US-028).

Other features (F03 cards, F04 final bodies, F10 signals) send THROUGH the
MessageTransport port; nobody creates a second message table/endpoint.

Invariants (FL-08/11, SEC-07, DSA-05, DEC-13):
- UNIQUE(sender, idempotency_key): replay returns the same message; a same
  key with a different payload hash is rejected (409).
- approved_body is the author-approved snapshot ONLY. No AI original, no
  prompt, no draft linkage to the recipient (ERD: no FK to draft).
- created_at immutable; read_at set once by the real recipient (earliest
  kept); no client-set read_at.
- connection_generation recorded at send time; current-generation checks
  happen at read/send via the ConnectionReader port.
- DEC-13 (OPEN): after unlink, recipient body access fails closed; the
  sender keeps their own sent copy. Documented as a provisional policy
  pending Thầy/US-023 decision.
"""

import datetime as dt
import uuid

from django.conf import settings
from django.db import models

from family_bridge_core.timeutils import UTC

KIND_TEXT = "text"
KIND_EMOTION_CARD = "emotion_card"
KIND_JOURNAL_REPLY = "journal_reply"
KIND_MOOD_REPLY = "mood_reply"
KIND_LISTENING_SIGNAL = "listening_signal"
KIND_QUICK_REPLY = "quick_reply"
MESSAGE_KINDS = (KIND_TEXT, KIND_EMOTION_CARD, KIND_JOURNAL_REPLY,
                 KIND_MOOD_REPLY, KIND_LISTENING_SIGNAL, KIND_QUICK_REPLY)

# Kinds that reference a shared item and therefore require a valid reply
# context validated through the registered context validator (fail closed).
CONTEXT_KINDS = (KIND_JOURNAL_REPLY, KIND_MOOD_REPLY)


def _utc_now() -> dt.datetime:
    return dt.datetime.now(tz=UTC)


class Message(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    connection_id = models.UUIDField()            # ref, cross-module via port
    connection_generation = models.PositiveIntegerField(default=1)
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                               related_name="f05_messages_sent")
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                  related_name="f05_messages_received")
    kind = models.CharField(max_length=32)
    approved_body = models.TextField()
    body_title = models.CharField(max_length=200, blank=True, default="")
    reply_to = models.ForeignKey("self", on_delete=models.SET_NULL,
                                 null=True, blank=True, related_name="replies")
    context_item_type = models.CharField(max_length=32, blank=True, default="")
    context_item_id = models.UUIDField(null=True, blank=True)
    context_owner_id = models.CharField(max_length=64, blank=True, default="")
    idempotency_key = models.CharField(max_length=128)
    payload_hash_hex = models.CharField(max_length=64)
    created_at = models.DateTimeField(default=_utc_now, editable=False)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = "f05_inbox"
        constraints = [
            models.UniqueConstraint(fields=["sender", "idempotency_key"],
                                    name="uniq_sender_idempotency"),
        ]
        indexes = [
            models.Index(fields=["recipient", "created_at", "id"]),
            models.Index(fields=["sender", "created_at", "id"]),
        ]

    def list_view(self, viewer_id) -> dict:
        """Minimal metadata for lists (DSA: no body in list payload)."""
        return {
            "message_id": str(self.id),
            "kind": self.kind,
            "direction": "sent" if str(self.sender_id) == str(viewer_id) else "received",
            "counterparty_id": (str(self.recipient_id)
                                if str(self.sender_id) == str(viewer_id)
                                else str(self.sender_id)),
            "title": self.body_title,
            "created_at": self.created_at.isoformat(),
            "read": self.read_at is not None,
            "reply_to": str(self.reply_to_id) if self.reply_to_id else None,
        }

    def detail_view(self, viewer_id) -> dict:
        view = self.list_view(viewer_id)
        view["body"] = self.approved_body
        view["connection_generation"] = self.connection_generation
        return view
