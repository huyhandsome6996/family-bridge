"""F03 models: EmotionCardSnapshot — immutable card state at send time.

US-027. Invariants:
- ONE messaging path: cards travel through the MessageTransport port
  (owner F05). This app never creates a second Message table/endpoint.
- Snapshot rows are write-once at send: admin edits/retires a card template
  afterwards NEVER changes an already-sent card (snapshot carries the exact
  version fields). No update path exists in code or API.
- message_id references the transport's SentMessage (UUID ref, no cross-app
  FK — feature branches stay standalone; integrity re-checked at B18).
- No AI original data rides along (cards are curated published content).
"""

import uuid

from django.db import models

from family_bridge_core.timeutils import UTC


def _utc_now():
    import datetime as dt
    return dt.datetime.now(tz=UTC)


class EmotionCardSnapshot(models.Model):
    """Card content frozen at send time; participant ids recorded for
    self-contained authorization (no cross-feature table read)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    message_id = models.UUIDField(unique=True, editable=False)
    card_id = models.CharField(max_length=64)
    card_version = models.PositiveIntegerField()
    group_code = models.CharField(max_length=32)
    title = models.CharField(max_length=120)
    body = models.TextField()
    accent = models.CharField(max_length=32, blank=True, default="")
    sender_id = models.CharField(max_length=64)
    recipient_id = models.CharField(max_length=64)
    connection_id = models.CharField(max_length=64, blank=True, default="")
    created_at = models.DateTimeField(default=_utc_now, editable=False)

    class Meta:
        app_label = "f03_cards"
        indexes = [
            models.Index(fields=["recipient_id", "created_at"]),
            models.Index(fields=["sender_id", "created_at"]),
        ]

    def view(self) -> dict:
        """Allowlisted card payload (fixed field set; body is template text
        from published content, rendered as plain text client-side)."""
        return {
            "message_id": str(self.message_id),
            "card": {
                "card_id": self.card_id,
                "version": self.card_version,
                "group_code": self.group_code,
                "title": self.title,
                "body": self.body,
                "accent": self.accent,
            },
            "sender_id": self.sender_id,
            "recipient_id": self.recipient_id,
            "created_at": self.created_at.isoformat(),
        }
