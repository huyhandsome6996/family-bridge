"""F04 models: AiSuggestion — author-private refine record (US-029/US-033).

Invariants:
- original_text AND suggested_text are the AUTHOR'S private data. No other
  actor (caregiver, staff, System Administrator) has any read path; there is
  no admin endpoint, no analytics, no log of sentence content.
- A suggestion NEVER sends anything. The final body travels only through the
  F05 messages send path (send DTO = final body only — no original, no
  suggestion history, no prompt).
- Rows are append-only: status transitions suggested -> discarded | accepted
  are author-only and one-way; text fields are immutable after create.
- provider_id/model_revision/prompt_revision are versioned metadata for
  audit; the prompt SENTENCE text is never stored.
- input_revision is the OPTIONAL author-client revision tag (frozen contract
  C2/C3): echoed int|null, participates in the idempotency payload hash so a
  replayed key with a different revision conflicts (409) instead of silently
  returning a suggestion bound to stale input.
- If the user never accepts, nothing leaves F04 — manual writing always works.
"""

import datetime as dt
import uuid

from django.conf import settings
from django.db import models

from family_bridge_core.timeutils import UTC

PURPOSE_REFINE = "refine_expression"
PURPOSES = (PURPOSE_REFINE,)

STATUS_SUGGESTED = "suggested"
STATUS_DISCARDED = "discarded"
STATUS_ACCEPTED = "accepted"
STATUSES = (STATUS_SUGGESTED, STATUS_DISCARDED, STATUS_ACCEPTED)


def _utc_now() -> dt.datetime:
    return dt.datetime.now(tz=UTC)


STATUS_INFLIGHT = "inflight"
STATUS_COMPLETED = "completed"
OPERATION_STATUSES = (STATUS_INFLIGHT, STATUS_COMPLETED)


class AiRefineOperation(models.Model):
    """Per-(author, idempotency_key) refine claim — R1A2-01 inflight marker.

    Purpose: guarantee at most ONE provider call per (author, key) operation.
    The row is claimed (INFLIGHT) in a short atomic BEFORE the provider call;
    concurrent requests with the same key fail the unique claim and never
    double-charge the provider: a same-payload loser waits (bounded <= 2s,
    see express.REFINE_CLAIM_WAIT_TOTAL_SECONDS) for the winner to finalize
    and replays its stored outcome, and only past that bound receives
    409 slot_unavailable(refine_in_progress). The finalize marks the claim
    COMPLETED together with the suggestion insert (same transaction).

    Outcome-unknown reconciliation: a crash/timeout between claim and finalize
    leaves a stale INFLIGHT row; after the TTL the user's deliberate retry
    reclaims it (same payload) — see express.REFINE_OPERATION_TTL_SECONDS.

    Privacy: NO sentence content here — only the opaque idempotency key and
    the payload hash (same fields AiSuggestion already stores). The F15 "ai"
    deletion hook clears these rows together with the suggestions.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                               related_name="f04_refine_operations")
    idempotency_key = models.CharField(max_length=128)
    payload_hash_hex = models.CharField(max_length=64)
    status = models.CharField(max_length=16, default=STATUS_INFLIGHT)
    created_at = models.DateTimeField(default=_utc_now, editable=False)
    updated_at = models.DateTimeField(default=_utc_now, editable=False)

    class Meta:
        app_label = "f04_ai"
        constraints = [
            models.UniqueConstraint(fields=["author", "idempotency_key"],
                                    name="uniq_f04_author_key_operation"),
        ]
        indexes = [
            models.Index(fields=["author", "created_at"]),
        ]


class AiSuggestion(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                               related_name="f04_suggestions")
    purpose = models.CharField(max_length=32)
    status = models.CharField(max_length=16, default=STATUS_SUGGESTED)
    original_text = models.TextField()
    suggested_text = models.TextField()
    provider_id = models.CharField(max_length=64)
    model_revision = models.CharField(max_length=64)
    prompt_revision = models.CharField(max_length=32)
    idempotency_key = models.CharField(max_length=128)
    payload_hash_hex = models.CharField(max_length=64)
    input_revision = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(default=_utc_now, editable=False)
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = "f04_ai"
        constraints = [
            models.UniqueConstraint(fields=["author", "idempotency_key"],
                                    name="uniq_f04_author_idempotency"),
        ]
        indexes = [
            models.Index(fields=["author", "created_at", "id"]),
        ]

    def view(self) -> dict:
        """Author-only allowlisted view."""
        return {
            "suggestion_id": str(self.id),
            "purpose": self.purpose,
            "status": self.status,
            "original_text": self.original_text,
            "suggested_text": self.suggested_text,
            "model_revision": self.model_revision,
            "prompt_revision": self.prompt_revision,
            "input_revision": self.input_revision,
            "created_at": self.created_at.isoformat(),
            "decided_at": self.decided_at.isoformat() if self.decided_at else None,
        }
