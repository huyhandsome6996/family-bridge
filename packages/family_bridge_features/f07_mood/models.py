"""F07 models: MoodEntry + MoodShare — daily mood, per-entry sharing
(US-015/US-026).

Invariants:
- ONE entry per owner per day (VN calendar day stored as DATE); edits bump
  revision and UN-share the content: grants bind approved_revision, so a
  new revision is never readable by recipients until re-shared explicitly.
- Sharing is PER-ENTRY + PER-RECIPIENT + PER-REVISION only. There is no
  "share whole history" path anywhere in this app.
- No scores, no rankings, no "good child" points: emotions are a fixed
  allowlist of descriptive labels; summary is a personal descriptive count.
- Emotions are NEVER inferred from AI/journals — only the user's explicit
  selection is stored.
- Revocation is immediate: every recipient read re-checks the grant row,
  revision currency and the ACTIVE connection at its CURRENT generation
  (no cache layer to go stale; DB is the only source of truth).
"""

import datetime as dt
import uuid

from django.conf import settings
from django.db import models

from family_bridge_core.timeutils import UTC

# Descriptive allowlist (range rõ; DEC-17 provisional labels — production
# copy needs Thầy/US-005 duyệt). No valence score attached.
EMOTION_VUI = "vui"
EMOTION_BINH_AN = "binh_an"
EMOTION_MET = "met"
EMOTION_BUON = "buon"
EMOTION_LO = "lo"
EMOTION_BUC = "buc"
EMOTION_KHO_NOI = "kho_noi"
EMOTIONS = (EMOTION_VUI, EMOTION_BINH_AN, EMOTION_MET, EMOTION_BUON,
            EMOTION_LO, EMOTION_BUC, EMOTION_KHO_NOI)

EMOTION_LABELS = {
    EMOTION_VUI: "Vui",
    EMOTION_BINH_AN: "Bình an",
    EMOTION_MET: "Mệt",
    EMOTION_BUON: "Buồn",
    EMOTION_LO: "Lo lắng",
    EMOTION_BUC: "Bực bội",
    EMOTION_KHO_NOI: "Khó nói thành lời",
}

MAX_NOTE_CHARS = 2000
MIN_DATE_DAYS_AGO = 730   # bounded history (DEC-17 provisional)
MAX_DATE_DAYS_AHEAD = 1   # tolerate timezone edge (VN day may be ahead)


def _utc_now() -> dt.datetime:
    return dt.datetime.now(tz=UTC)


class MoodEntry(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                              related_name="f07_mood_entries")
    entry_date = models.DateField()
    emotion = models.CharField(max_length=32)
    note = models.TextField(blank=True, default="")
    revision = models.PositiveIntegerField(default=1, editable=False)
    created_at = models.DateTimeField(default=_utc_now, editable=False)
    updated_at = models.DateTimeField(default=_utc_now, editable=False)

    class Meta:
        app_label = "f07_mood"
        constraints = [
            models.UniqueConstraint(fields=["owner", "entry_date"],
                                    name="uniq_f07_owner_day"),
        ]
        indexes = [
            models.Index(fields=["owner", "entry_date"]),
        ]

    def view(self) -> dict:
        return {
            "entry_id": str(self.id),
            "entry_date": self.entry_date.isoformat(),
            "emotion": self.emotion,
            "emotion_label": EMOTION_LABELS.get(self.emotion, self.emotion),
            "note": self.note,
            "revision": self.revision,
            "updated_at": self.updated_at.isoformat(),
        }


class MoodShare(models.Model):
    """A grant binds (entry, recipient, approved_revision) + the connection
    generation AT SHARE TIME; reads re-verify the CURRENT generation."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entry = models.ForeignKey(MoodEntry, on_delete=models.CASCADE,
                              related_name="shares")
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                              related_name="f07_mood_shares_given")
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL,
                                  on_delete=models.CASCADE,
                                  related_name="f07_mood_shares_received")
    approved_revision = models.PositiveIntegerField()
    connection_id = models.CharField(max_length=64, blank=True, default="")
    connection_generation = models.PositiveIntegerField(default=1)
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=_utc_now, editable=False)

    class Meta:
        app_label = "f07_mood"
        constraints = [
            models.UniqueConstraint(
                fields=["entry", "recipient", "approved_revision"],
                name="uniq_f07_entry_recipient_revision"),
        ]
        indexes = [
            models.Index(fields=["recipient", "created_at"]),
            models.Index(fields=["owner", "created_at"]),
        ]

    def grant_view(self) -> dict:
        return {
            "share_id": str(self.id),
            "entry_id": str(self.entry_id),
            "recipient_id": str(self.recipient_id),
            "owner_id": str(self.owner_id),
            "approved_revision": self.approved_revision,
            "revoked": self.revoked_at is not None,
            "created_at": self.created_at.isoformat(),
        }
