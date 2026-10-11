"""F02 models: Enrollment + WeekProgress + AgreementAcceptance (US-036/044).

Invariants:
- Participation is VOLUNTARY: join/opt-out anytime; opt-out leaves no
  pressure, no streak, no ranking. Suggestions never lock other weeks —
  ALL published weeks of the pinned revision stay accessible.
- Enrollment PINS the program revision; content re-publishes NEVER
  silently migrate an enrollment (explicit re-enroll required).
- The family agreement is immutable-per-revision: acceptance binds
  (participant, program, agreement_revision); editing the template creates
  a NEW revision and old acceptances do NOT carry over. NO ONE can sign
  for another person (each participant's row is their own action).
- Week progress is private per participant; joint activities are F09
  invites (referenced by key — no duplicated invite tables here).
"""

import datetime as dt
import uuid

from django.conf import settings
from django.db import models

from family_bridge_core.timeutils import UTC


def _utc_now() -> dt.datetime:
    return dt.datetime.now(tz=UTC)


class Enrollment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    participant = models.ForeignKey(settings.AUTH_USER_MODEL,
                                    on_delete=models.CASCADE,
                                    related_name="f02_enrollments")
    program_key = models.CharField(max_length=64)
    program_revision = models.PositiveIntegerField()
    active = models.BooleanField(default=True)
    joined_at = models.DateTimeField(default=_utc_now, editable=False)
    updated_at = models.DateTimeField(default=_utc_now, editable=False)

    class Meta:
        app_label = "f02_program"
        constraints = [
            models.UniqueConstraint(fields=["participant", "program_key"],
                                    name="uniq_f02_participant_program"),
        ]
        indexes = [
            models.Index(fields=["participant", "active"]),
        ]

    def view(self) -> dict:
        return {
            "enrollment_id": str(self.id),
            "program_key": self.program_key,
            "program_revision": self.program_revision,
            "active": self.active,
            "joined_at": self.joined_at.isoformat(),
        }


class WeekProgress(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    participant = models.ForeignKey(settings.AUTH_USER_MODEL,
                                    on_delete=models.CASCADE,
                                    related_name="f02_week_progress")
    program_key = models.CharField(max_length=64)
    week_no = models.PositiveIntegerField()
    activity_key = models.CharField(max_length=64)
    status = models.CharField(max_length=16)  # done | skipped | reset
    updated_at = models.DateTimeField(default=_utc_now, editable=False)

    class Meta:
        app_label = "f02_program"
        constraints = [
            models.UniqueConstraint(
                fields=["participant", "program_key", "activity_key"],
                name="uniq_f02_participant_activity"),
        ]
        indexes = [
            models.Index(fields=["participant", "updated_at"]),
        ]

    def view(self) -> dict:
        return {
            "week_no": self.week_no,
            "activity_key": self.activity_key,
            "status": self.status,
            "updated_at": self.updated_at.isoformat(),
        }


class AgreementAcceptance(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    participant = models.ForeignKey(settings.AUTH_USER_MODEL,
                                    on_delete=models.CASCADE,
                                    related_name="f02_agreements")
    program_key = models.CharField(max_length=64)
    program_revision = models.PositiveIntegerField()
    agreement_revision = models.PositiveIntegerField()
    accepted_at = models.DateTimeField(default=_utc_now, editable=False)

    class Meta:
        app_label = "f02_program"
        constraints = [
            models.UniqueConstraint(
                fields=["participant", "program_key", "agreement_revision"],
                name="uniq_f02_acceptance_revision"),
        ]
        indexes = [
            models.Index(fields=["participant", "program_key"]),
        ]

    def view(self) -> dict:
        return {
            "program_key": self.program_key,
            "program_revision": self.program_revision,
            "agreement_revision": self.agreement_revision,
            "accepted_at": self.accepted_at.isoformat(),
        }
