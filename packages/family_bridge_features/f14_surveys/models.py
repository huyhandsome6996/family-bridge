"""F14 models: ResearchConsent + SurveyResponse (US-040/US-045).

Invariants:
- Research consent is SEPARATE from app usage: skipping/withdrawing never
  disables any other feature (nothing depends on F14). Consent is an
  explicit action — opening a survey screen NEVER implies consent.
- Raw responses live only in the backend: there is NO raw export endpoint,
  no admin bypass, no free-text answers (typed allowlist question kinds
  only until a research protocol approves text handling).
- One response per (participant, form, phase); responses bind the exact
  published form revision; reports are computed live with the CURRENT
  policy and only over participants whose consent is STILL active —
  withdrawal takes effect on the next computation (no stale cache).
"""

import datetime as dt
import uuid

from django.conf import settings
from django.db import models

from family_bridge_core.timeutils import UTC

PURPOSE_PRE_POST = "pre_post_study"
PURPOSES = (PURPOSE_PRE_POST,)

CONSENT_GRANTED = "granted"
CONSENT_WITHDRAWN = "withdrawn"

PHASE_PRE = "pre"
PHASE_POST = "post"
PHASES = (PHASE_PRE, PHASE_POST)

QUESTION_KINDS = ("scale_1_5", "choice", "number")


def _utc_now() -> dt.datetime:
    return dt.datetime.now(tz=UTC)


class ResearchConsent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    participant = models.ForeignKey(settings.AUTH_USER_MODEL,
                                    on_delete=models.CASCADE,
                                    related_name="f14_consents")
    purpose = models.CharField(max_length=32)
    status = models.CharField(max_length=16, default=CONSENT_GRANTED)
    consent_version = models.PositiveIntegerField(default=1)
    granted_at = models.DateTimeField(null=True, blank=True)
    withdrawn_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(default=_utc_now, editable=False)

    class Meta:
        app_label = "f14_surveys"
        constraints = [
            models.UniqueConstraint(fields=["participant", "purpose"],
                                    name="uniq_f14_participant_purpose"),
        ]

    def view(self) -> dict:
        return {
            "purpose": self.purpose,
            "status": self.status,
            "consent_version": self.consent_version,
            "granted_at": self.granted_at.isoformat()
            if self.granted_at else None,
            "withdrawn_at": self.withdrawn_at.isoformat()
            if self.withdrawn_at else None,
        }


class SurveyResponse(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    participant = models.ForeignKey(settings.AUTH_USER_MODEL,
                                    on_delete=models.CASCADE,
                                    related_name="f14_responses")
    form_key = models.CharField(max_length=64)
    form_revision = models.PositiveIntegerField()
    phase = models.CharField(max_length=8)
    answers = models.JSONField()
    submitted_at = models.DateTimeField(default=_utc_now, editable=False)

    class Meta:
        app_label = "f14_surveys"
        constraints = [
            models.UniqueConstraint(
                fields=["participant", "form_key", "phase"],
                name="uniq_f14_participant_form_phase"),
        ]
        indexes = [
            models.Index(fields=["form_key", "phase"]),
        ]
