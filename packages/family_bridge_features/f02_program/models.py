"""F02 models: Enrollment + WeekProgress + AgreementAcceptance + the
week-4 FamilyAgreement instance (US-036/044).

Invariants:
- Participation is VOLUNTARY: join/opt-out anytime; opt-out leaves no
  pressure, no streak, no ranking. Suggestions never lock other weeks —
  ALL published weeks of the pinned revision stay accessible.
- Enrollment PINS the program revision; content re-publishes NEVER
  silently migrate an enrollment (explicit re-enroll required).
- The personal agreement acceptance binds (participant, program,
  agreement_revision) and is each person's own action; the FAMILY
  agreement instance (FamilyAgreement) is bound to the pair
  (party_low/party_high), the connection generation and ONE agreement
  revision. It is confirmed only when TWO DIFFERENT actors of the same
  pair have confirmed the SAME revision (proposer + counterpart, each
  recorded with their own timestamp). Editing creates a NEW revision = a
  new instance; old confirmed instances stay valid per policy until the
  new one is confirmed (superseded) or ended. Nobody can sign for
  another person.
- Week progress is private per participant and pinned to the program
  revision it was made on (program_revision column) so a reused
  activity_key in a newer revision cannot inherit old status.
- Joint activities are F09 invites (referenced by key — no duplicated
  invite tables here).
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
    # Revision of the program this progress was made on. Nullable only for
    # legacy rows created before this column existed (production had zero
    # rows at introduction); new writes always pin the enrollment revision.
    program_revision = models.PositiveIntegerField(null=True, blank=True)
    week_no = models.PositiveIntegerField()
    activity_key = models.CharField(max_length=64)
    status = models.CharField(max_length=16)  # done | skipped | reset
    updated_at = models.DateTimeField(default=_utc_now, editable=False)

    class Meta:
        app_label = "f02_program"
        constraints = [
            models.UniqueConstraint(
                fields=["participant", "program_key", "activity_key",
                        "program_revision"],
                name="uniq_f02_participant_activity_rev"),
        ]
        indexes = [
            models.Index(fields=["participant", "updated_at"]),
        ]

    def view(self) -> dict:
        return {
            "week_no": self.week_no,
            "activity_key": self.activity_key,
            "program_revision": self.program_revision,
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


AGREEMENT_PROPOSED = "proposed"
AGREEMENT_CONFIRMED = "confirmed"
AGREEMENT_SUPERSEDED = "superseded"
AGREEMENT_WITHDRAWN = "withdrawn"
AGREEMENT_ENDED = "ended"
AGREEMENT_OPEN_STATUSES = (AGREEMENT_PROPOSED,)
AGREEMENT_LIVE_STATUSES = (AGREEMENT_PROPOSED, AGREEMENT_CONFIRMED)
AGREEMENT_TERMINAL_STATUSES = (
    AGREEMENT_SUPERSEDED, AGREEMENT_WITHDRAWN, AGREEMENT_ENDED,
)


class FamilyAgreement(models.Model):
    """Week-4 family agreement INSTANCE of exactly one pair.

    State machine (docs/product/four-week-flow.md — Thỏa ước):
      proposed -> proposed   : one side confirmed the revision
      proposed -> confirmed  : BOTH sides confirmed the same revision
      proposed -> withdrawn  : proposer withdraws
      proposed|confirmed -> superseded : a newer revision got confirmed
      confirmed -> ended     : explicit end (or unlink policy upstream)
    One row per (pair, program_key, agreement_revision, generation):
    re-confirming the same row by the same person is idempotent, never a
    second signature; A confirming v1 and B confirming v2 touch DIFFERENT
    rows and can never merge into one confirmed agreement.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    program_key = models.CharField(max_length=64)
    program_revision = models.PositiveIntegerField()
    agreement_revision = models.PositiveIntegerField()
    connection_generation = models.PositiveIntegerField()
    party_low_id = models.CharField(max_length=64)
    party_high_id = models.CharField(max_length=64)
    proposed_by = models.CharField(max_length=64)
    proposed_by_role = models.CharField(max_length=16)
    commitments = models.JSONField(default=list)
    status = models.CharField(max_length=16, default=AGREEMENT_PROPOSED)
    proposer_confirmed_at = models.DateTimeField(null=True, blank=True)
    counterpart_confirmed_at = models.DateTimeField(null=True, blank=True)
    counterpart_role = models.CharField(max_length=16, blank=True, default="")
    created_at = models.DateTimeField(default=_utc_now, editable=False)
    updated_at = models.DateTimeField(default=_utc_now, editable=False)

    class Meta:
        app_label = "f02_program"
        constraints = [
            models.UniqueConstraint(
                fields=["party_low_id", "party_high_id", "program_key",
                        "agreement_revision", "connection_generation"],
                name="uniq_f02_agreement_pair_revision_generation"),
        ]
        indexes = [
            models.Index(fields=["party_low_id", "updated_at"]),
            models.Index(fields=["party_high_id", "updated_at"]),
        ]

    def is_member(self, user_id: str) -> bool:
        return str(user_id) in (str(self.party_low_id), str(self.party_high_id))

    def other_party(self, user_id: str) -> str:
        return (str(self.party_high_id)
                if str(user_id) == str(self.party_low_id)
                else str(self.party_low_id))

    def role_of(self, user_id: str) -> str:
        """Role ONLY via the proposal record — the pair is one student and
        one caregiver (class accounts); the proposer's role pins which side
        is which for this instance."""
        return (self.proposed_by_role
                if str(user_id) == str(self.proposed_by)
                else self.counterpart_role
                or ("caregiver" if self.proposed_by_role == "student"
                    else "student"))

    def view(self, *, viewer_id: str) -> dict:
        my_confirmed = (self.proposer_confirmed_at is not None
                        if str(viewer_id) == str(self.proposed_by)
                        else self.counterpart_confirmed_at is not None)
        counterpart_confirmed = (self.counterpart_confirmed_at is not None
                                 if str(viewer_id) == str(self.proposed_by)
                                 else self.proposer_confirmed_at is not None)
        return {
            "agreement_id": str(self.id),
            "program_key": self.program_key,
            "program_revision": self.program_revision,
            "agreement_revision": self.agreement_revision,
            "connection_generation": self.connection_generation,
            "status": self.status,
            "proposed_by": self.proposed_by,
            "proposed_by_me": str(viewer_id) == str(self.proposed_by),
            "my_confirmed": my_confirmed,
            "counterpart_confirmed": counterpart_confirmed,
            "commitments": list(self.commitments or []),
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "confirmed_at": (min(
                t for t in (self.proposer_confirmed_at,
                            self.counterpart_confirmed_at)
                if t is not None).isoformat()
                if self.status == AGREEMENT_CONFIRMED else None),
        }
