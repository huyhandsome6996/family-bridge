"""F06 models: Draft + DraftPreview — owner-only drafts and the deliberate
300-second pause before sending (US-030/US-034).

Invariants:
- Drafts hold ONLY the final approved content the author chose to keep:
  no AI original, no suggestion linkage, no prompt. Unknown linkage fields
  are rejected at the API layer (SEC-05).
- Pause is 300 seconds, SERVER-decided (DEC-03): started_at/deadline are
  recorded server-side; the client renders a countdown from (deadline,
  server_time) and can never shorten its send right by changing the device
  clock. Re-pausing does NOT reset/extend an existing deadline; editing the
  draft bumps revision (invalidating previews) but does NOT move the deadline.
- Expiry creates NOTHING: no message, no job, no cron. Passing the deadline
  only makes preview/confirm possible (state computed at request time).
- Sending needs the final confirm binding (preview_id, revision, recipient)
  and delegates through the per-kind sender port — the ONE send path stays
  F05/F03; F06 owns no message table. Unwired kind sender -> 503 fail closed.
- Admin has no read path: drafts are author-private (SEC-04); there is no
  configuration endpoint — the 300 value is immutable in this scope.
"""

import datetime as dt
import uuid

from django.conf import settings
from django.db import models

from family_bridge_core.timeutils import UTC

KIND_TEXT = "text"
KIND_EMOTION_CARD = "emotion_card"
KINDS = (KIND_TEXT, KIND_EMOTION_CARD)

STATUS_EDITING = "editing"
STATUS_PAUSED = "paused"
STATUS_SENT = "sent"
STATUS_DISCARDED = "discarded"

PAUSE_SECONDS = 300  # fixed; admin cannot change (WF-13/CFG pause)


def _utc_now() -> dt.datetime:
    return dt.datetime.now(tz=UTC)


class Draft(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                               related_name="f06_drafts")
    kind = models.CharField(max_length=16)
    body = models.TextField()
    title = models.CharField(max_length=200, blank=True, default="")
    card_id = models.CharField(max_length=64, blank=True, default="")
    card_version = models.PositiveIntegerField(null=True, blank=True)
    recipient_id = models.CharField(max_length=64, blank=True, default="")
    revision = models.PositiveIntegerField(default=1, editable=False)
    status = models.CharField(max_length=16, default=STATUS_EDITING)
    pause_started_at = models.DateTimeField(null=True, blank=True)
    pause_deadline_at = models.DateTimeField(null=True, blank=True)
    sent_message_id = models.CharField(max_length=64, blank=True, default="")
    created_at = models.DateTimeField(default=_utc_now, editable=False)
    updated_at = models.DateTimeField(default=_utc_now, editable=False)

    class Meta:
        app_label = "f06_drafts"
        indexes = [
            models.Index(fields=["author", "updated_at", "id"]),
        ]

    def view(self, *, now: dt.datetime) -> dict:
        deadline = self.pause_deadline_at
        remaining = None
        can_preview = False
        if self.status == STATUS_PAUSED and deadline is not None:
            remaining = max(0, int((deadline - now).total_seconds()))
            can_preview = now >= deadline
        return {
            "draft_id": str(self.id),
            "kind": self.kind,
            "title": self.title,
            "body": self.body,
            "card_id": self.card_id or None,
            "card_version": self.card_version,
            "recipient_id": self.recipient_id or None,
            "revision": self.revision,
            "status": self.status,
            "pause": (None if deadline is None else {
                "started_at": self.pause_started_at.isoformat(),
                "deadline": deadline.isoformat(),
                "remaining_seconds": remaining,
                "can_preview": can_preview,
            }),
            "sent_message_id": self.sent_message_id or None,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class DraftPreview(models.Model):
    """Immutable binding (draft, revision, recipient) made AFTER the pause
    elapsed. Confirm-send must match this binding exactly; a successful send
    consumes the preview (used=True) — never a second send from one preview."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    draft = models.ForeignKey(Draft, on_delete=models.CASCADE,
                              related_name="previews")
    revision = models.PositiveIntegerField()
    recipient_id = models.CharField(max_length=64)
    payload_hash_hex = models.CharField(max_length=64)
    used = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=_utc_now, editable=False)

    class Meta:
        app_label = "f06_drafts"
        indexes = [
            models.Index(fields=["draft", "created_at"]),
        ]
