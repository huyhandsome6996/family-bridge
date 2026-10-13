"""F09 models: ActivityProgress + SharedActivityInvite (US-037).

Invariants:
- Progress is PRIVATE per participant (no shared leaderboards, no
  comparisons); marking requires the content to STILL be published at the
  referenced revision (pinned retirement honored).
- Shared invites need TWO independent responses — nobody ticks for anyone
  else. Inviter and invitee each own their response; decline/cancel keep
  honest states.
- No reminders are scheduled anywhere in this app (voluntary by design);
  content links come from the published-content port (F02 refs at B18) —
  no duplicated program/enrollment logic.
"""

import datetime as dt
import uuid

from django.conf import settings
from django.db import models

from family_bridge_core.timeutils import UTC

PROGRESS_DONE = "done"
PROGRESS_SKIPPED = "skipped"
PROGRESS_STATUSES = (PROGRESS_DONE, PROGRESS_SKIPPED)

INVITE_PENDING = "pending"
INVITE_ACCEPTED = "accepted"
INVITE_DECLINED = "declined"
INVITE_CANCELLED = "cancelled"


def _utc_now() -> dt.datetime:
    return dt.datetime.now(tz=UTC)


class ActivityProgress(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    participant = models.ForeignKey(settings.AUTH_USER_MODEL,
                                    on_delete=models.CASCADE,
                                    related_name="f09_progress")
    content_key = models.CharField(max_length=64)
    content_revision = models.PositiveIntegerField()
    status = models.CharField(max_length=16)
    updated_at = models.DateTimeField(default=_utc_now, editable=False)

    class Meta:
        app_label = "f09_activities"
        constraints = [
            models.UniqueConstraint(fields=["participant", "content_key"],
                                    name="uniq_f09_participant_content"),
        ]
        indexes = [
            models.Index(fields=["participant", "updated_at"]),
        ]

    def view(self) -> dict:
        return {
            "progress_id": str(self.id),
            "content_key": self.content_key,
            "content_revision": self.content_revision,
            "status": self.status,
            "updated_at": self.updated_at.isoformat(),
        }


class SharedActivityInvite(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    content_key = models.CharField(max_length=64)
    content_revision = models.PositiveIntegerField()
    inviter = models.ForeignKey(settings.AUTH_USER_MODEL,
                                on_delete=models.CASCADE,
                                related_name="f09_invites_sent")
    invitee = models.ForeignKey(settings.AUTH_USER_MODEL,
                                on_delete=models.CASCADE,
                                related_name="f09_invites_received")
    status = models.CharField(max_length=16, default=INVITE_PENDING)
    inviter_response = models.CharField(max_length=16, blank=True, default="")
    invitee_response = models.CharField(max_length=16, blank=True, default="")
    created_at = models.DateTimeField(default=_utc_now, editable=False)
    updated_at = models.DateTimeField(default=_utc_now, editable=False)
    active_marker = models.GeneratedField(
        expression=models.Case(
            models.When(status=INVITE_PENDING, then=models.Value("pending")),
            default=models.Value(None),
            output_field=models.CharField(max_length=16, null=True),
        ),
        output_field=models.CharField(max_length=16, null=True),
        db_persist=False,
    )

    class Meta:
        app_label = "f09_activities"
        constraints = [
            models.UniqueConstraint(
                fields=["content_key", "inviter", "invitee", "active_marker"],
                name="uniq_f09_open_invite"),
        ]
        indexes = [
            models.Index(fields=["inviter", "updated_at"]),
            models.Index(fields=["invitee", "updated_at"]),
        ]

    def view(self, *, viewer_id: str) -> dict:
        return {
            "invite_id": str(self.id),
            "content_key": self.content_key,
            "content_revision": self.content_revision,
            "inviter_id": str(self.inviter_id),
            "invitee_id": str(self.invitee_id),
            "direction": ("sent" if str(self.inviter_id) == str(viewer_id)
                          else "received"),
            "status": self.status,
            "inviter_response": self.inviter_response or None,
            "invitee_response": self.invitee_response or None,
            "updated_at": self.updated_at.isoformat(),
        }
