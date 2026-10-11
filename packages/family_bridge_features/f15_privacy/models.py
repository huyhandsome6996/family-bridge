"""F15 models: deletion workflow, append-only ledger, privacy case (US-012/017/023).

Invariants (WF-21, SEC-21, FL-20):
- DeletionRequest states: requested -> verified -> processing ->
  completed | failed_needs_action, or rejected (with reason). A truthful
  outcome only: "completed" requires every registered domain hook to report
  success; partial failure stays failed_needs_action. Restore must replay the
  ledger before serving (B17 runbook) — no UI shortcut.
- DeletionLedgerEvent is APPEND-ONLY tombstone/revocation history with NO
  private bodies: item refs, scopes, timestamps, actor refs only. Restore
  (B17) replays the LATEST ledger, not the backup-era one.
- PrivacyCase holds metadata for handlers only (B16 assigns); it never opens
  message/journal/AI bodies and never impersonates users.
"""

import datetime as dt
import json
import secrets
import uuid

from django.conf import settings
from django.db import models

from family_bridge_core.timeutils import UTC


def _utc_now() -> dt.datetime:
    return dt.datetime.now(tz=UTC)


class DeletionRequest(models.Model):
    STATUS_REQUESTED = "requested"
    STATUS_VERIFIED = "verified"
    STATUS_PROCESSING = "processing"
    STATUS_COMPLETED = "completed"
    STATUS_FAILED = "failed_needs_action"
    STATUS_REJECTED = "rejected"
    STATUS_CANCELLED = "cancelled"
    STATUSES = (STATUS_REQUESTED, STATUS_VERIFIED, STATUS_PROCESSING,
                STATUS_COMPLETED, STATUS_FAILED, STATUS_REJECTED, STATUS_CANCELLED)

    # Allowlist of deletion scope categories (ERD + catalog J; retention DEC-12
    # remains OPEN — production data collection is gated until approved).
    CATEGORY_ACCOUNT = "account"
    CATEGORY_CONNECTIONS = "connections"
    CATEGORY_MOOD = "mood"
    CATEGORY_JOURNAL = "journal"
    CATEGORY_DRAFTS = "drafts"
    CATEGORY_MESSAGES = "messages"
    CATEGORY_AI = "ai"
    CATEGORY_SURVEYS = "surveys"
    CATEGORY_PROGRAM = "program_progress"
    CATEGORY_APPOINTMENTS = "appointments"
    CATEGORIES = (CATEGORY_ACCOUNT, CATEGORY_CONNECTIONS, CATEGORY_MOOD,
                  CATEGORY_JOURNAL, CATEGORY_DRAFTS, CATEGORY_MESSAGES,
                  CATEGORY_AI, CATEGORY_SURVEYS, CATEGORY_PROGRAM,
                  CATEGORY_APPOINTMENTS)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="deletion_requests")
    scope_categories = models.JSONField()          # allowlist subset, validated
    status = models.CharField(max_length=32, default=STATUS_REQUESTED)
    receipt_hash = models.CharField(max_length=64, editable=False)  # SHA-256
    failure_detail = models.JSONField(null=True, blank=True)  # truthful outcomes
    requested_at = models.DateTimeField(default=_utc_now)
    completed_at = models.DateTimeField(null=True, blank=True)
    revision = models.PositiveIntegerField(default=1)

    class Meta:
        app_label = "f15_privacy"
        indexes = [models.Index(fields=["user", "status", "requested_at"])]

    def save(self, *args, **kwargs):
        if self.scope_categories:
            unknown = set(self.scope_categories) - set(self.CATEGORIES)
            if unknown:
                raise ValueError(f"invalid deletion categories: {sorted(unknown)}")
        super().save(*args, **kwargs)


class DeletionLedgerEvent(models.Model):
    """Append-only; ordered by (occurred_at, seq). No private payloads."""

    EVENT_DELETION_APPLIED = "deletion_applied"
    EVENT_DELETION_REQUESTED = "deletion_requested"
    EVENT_DELETION_FAILED = "deletion_failed"
    EVENT_DELETION_CANCELLED = "deletion_cancelled"
    EVENT_GRANT_REVOKED = "grant_revoked"
    EVENT_CONNECTION_REVOKED = "connection_revoked"
    EVENT_CONSENT_WITHDRAWN = "consent_withdrawn"
    EVENT_TYPES = (EVENT_DELETION_APPLIED, EVENT_DELETION_REQUESTED,
                   EVENT_DELETION_FAILED, EVENT_DELETION_CANCELLED,
                   EVENT_GRANT_REVOKED, EVENT_CONNECTION_REVOKED,
                   EVENT_CONSENT_WITHDRAWN)

    seq = models.BigAutoField(primary_key=True)
    occurred_at = models.DateTimeField(default=_utc_now)
    target_user_id = models.CharField(max_length=64)   # UUID ref, no PII
    actor_ref = models.CharField(max_length=80)        # uuid or "system:restore"
    event_type = models.CharField(max_length=32)
    payload = models.JSONField(default=dict)           # bounded, no bodies

    class Meta:
        app_label = "f15_privacy"
        indexes = [models.Index(fields=["target_user_id", "occurred_at", "seq"])]

    def save(self, *args, **kwargs):
        # Append-only guard: no update of event type/payload once written.
        if self.pk and DeletionLedgerEvent.objects.filter(
                pk=self.pk).exists():
            raise ValueError("ledger events are append-only")
        if len(json.dumps(self.payload or {}, default=str)) > 8192:
            raise ValueError("ledger payload too large")
        super().save(*args, **kwargs)


class PrivacyCase(models.Model):
    """Handler-facing metadata ONLY (B16 assigns handlers). Never a body viewer."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    deletion_request = models.ForeignKey(DeletionRequest, on_delete=models.PROTECT,
                                         related_name="cases")
    assigned_handler_id = models.CharField(max_length=64, null=True, blank=True)
    status = models.CharField(max_length=32, default="open")
    outcome_note = models.CharField(max_length=1000, blank=True, default="")
    opened_at = models.DateTimeField(default=_utc_now)
    revision = models.PositiveIntegerField(default=1)

    class Meta:
        app_label = "f15_privacy"
