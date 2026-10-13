"""F01 models: provider identity, application sessions, consent records,
connection invites and connections (ERD: Dinh danh va ket noi).

Invariants encoded here (do not weaken):
- ProviderIdentity UNIQUE(provider, app_id, provider_subject); binding is
  written only after server-side verification (SEC-01).
- Sessions store a HASH of the bearer token; raw tokens are returned once at
  issue time and never logged (SEC-02/19/22).
- ConnectionInvite stores code_hash only; the raw code is shown once to the
  inviter (SEC-06).
- Connection uses canonical party ordering (party_low < party_high) with a
  UNIQUE pair constraint; reconnection is a NEW invite -> NEW generation; a
  revoked connection never revives (WF-08/FL-20).
- No admin flags grant data access here; is_staff/superuser are technical
  flags only.
"""

import datetime as dt
import hashlib
import uuid

from django.conf import settings
from django.db import models

from family_bridge_core.timeutils import UTC

RELATIONSHIP_PRIMARY = "primary"
RELATIONSHIP_BACKUP = "backup"
RELATIONSHIP_KINDS = (RELATIONSHIP_PRIMARY, RELATIONSHIP_BACKUP)

INVITE_PENDING = "pending"                     # created, code not yet claimed
INVITE_AWAITING = "awaiting_confirmation"      # candidate claimed the code
INVITE_ACTIVE = "active"
INVITE_DECLINED = "declined"
INVITE_CANCELED = "canceled"
INVITE_EXPIRED = "expired"

CONNECTION_ACTIVE = "active"
CONNECTION_REVOKED = "revoked"


def _utc_now() -> dt.datetime:
    return dt.datetime.now(tz=UTC)


def hash_token(raw: str) -> str:
    """SHA-256 for at-rest hashing of session tokens and invite codes."""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class ProviderIdentity(models.Model):
    """(provider, app_id, provider_subject) -> internal UUID user (SEC-01)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="provider_identities")
    provider = models.CharField(max_length=32)          # "zalo"
    app_id = models.CharField(max_length=64)            # parent Zalo App ID
    provider_subject = models.CharField(max_length=128) # Zalo id, STRING
    bound_at = models.DateTimeField(default=_utc_now)

    class Meta:
        app_label = "f01_identity"
        constraints = [
            models.UniqueConstraint(fields=["provider", "app_id", "provider_subject"],
                                    name="uniq_provider_subject"),
        ]
        indexes = [models.Index(fields=["provider", "app_id", "provider_subject"])]

    def __str__(self) -> str:  # pragma: no cover - debug aid only
        return f"ProviderIdentity({self.provider}/{self.app_id})"


class Session(models.Model):
    """Application session with server-side revoke (SEC-02)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="f01_sessions")
    token_hash = models.CharField(max_length=64, unique=True, editable=False)
    created_at = models.DateTimeField(default=_utc_now)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = "f01_identity"
        indexes = [models.Index(fields=["user", "expires_at"])]

    @property
    def is_live(self) -> bool:
        return self.check_live()

    def check_live(self, now: dt.datetime | None = None) -> bool:
        now = now or _utc_now()
        return (self.revoked_at is None and self.expires_at > now)

    def revoke(self) -> bool:
        if self.revoked_at is None:
            self.revoked_at = _utc_now()
            self.save(update_fields=["revoked_at"])
            return True
        return False


class ConsentRecord(models.Model):
    """Per-purpose consent with immutable accepted version (WF-17).

    A new policy version NEVER auto-accepts: new record required per purpose.
    Withdrawal keeps the row with withdrawn_at set (ledger semantics).
    """

    PURPOSE_SERVICE = "service"
    PURPOSE_AI_PROCESSING = "ai_processing"
    PURPOSE_RESEARCH = "research"
    PURPOSES = (PURPOSE_SERVICE, PURPOSE_AI_PROCESSING, PURPOSE_RESEARCH)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="consent_records")
    purpose = models.CharField(max_length=32, choices=[(p, p) for p in PURPOSES])
    policy_version = models.CharField(max_length=32)
    decision = models.CharField(max_length=16)  # accepted | declined
    recorded_at = models.DateTimeField(default=_utc_now)
    withdrawn_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = "f01_identity"
        indexes = [models.Index(fields=["user", "purpose", "recorded_at"])]

    def withdraw(self) -> bool:
        if self.withdrawn_at is None:
            self.withdrawn_at = _utc_now()
            self.save(update_fields=["withdrawn_at"])
            return True
        return False

    @classmethod
    def latest_active(cls, user_id, purpose: str):
        return (cls.objects.filter(user_id=user_id, purpose=purpose,
                                   withdrawn_at__isnull=True)
                .order_by("-recorded_at", "-id").first())


class ConnectionInvite(models.Model):
    INVITE_PENDING = INVITE_PENDING
    INVITE_AWAITING = INVITE_AWAITING
    INVITE_ACTIVE = INVITE_ACTIVE
    INVITE_DECLINED = INVITE_DECLINED
    INVITE_CANCELED = INVITE_CANCELED
    INVITE_EXPIRED = INVITE_EXPIRED

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    inviter = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                related_name="invites_sent")
    candidate = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                  null=True, blank=True, related_name="invites_received")
    code_hash = models.CharField(max_length=64, unique=True, editable=False)
    relationship_kind = models.CharField(max_length=16,
                                         choices=[(k, k) for k in RELATIONSHIP_KINDS])
    status = models.CharField(max_length=32, default=INVITE_PENDING)
    created_at = models.DateTimeField(default=_utc_now)
    expires_at = models.DateTimeField()
    candidate_confirmed_at = models.DateTimeField(null=True, blank=True)
    inviter_confirmed_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    revision = models.PositiveIntegerField(default=1)

    class Meta:
        app_label = "f01_identity"
        indexes = [models.Index(fields=["inviter", "status", "created_at"]),
                   models.Index(fields=["candidate", "status"])]

    def is_expired(self, now: dt.datetime) -> bool:
        return now > self.expires_at

    def display_for(self, user_id) -> dict:
        """Minimal metadata; a stranger must not enumerate invitations."""
        return {
            "invite_id": str(self.id),
            "relationship_kind": self.relationship_kind,
            "status": self.status,
            "expires_at": self.expires_at.isoformat(),
            "role": "inviter" if str(self.inviter_id) == str(user_id) else "candidate",
        }


class ClaimAttempt(models.Model):
    """DB-backed sliding-window rate record for invite code claims (SEC-14).

    Stores actor UUID + time only — never the attempted code (SEC-22).
    """

    id = models.BigAutoField(primary_key=True)
    actor_id = models.CharField(max_length=64)
    attempted_at = models.DateTimeField(default=_utc_now)

    class Meta:
        app_label = "f01_identity"
        indexes = [models.Index(fields=["actor_id", "attempted_at"])]


class Connection(models.Model):
    CONNECTION_ACTIVE = CONNECTION_ACTIVE
    CONNECTION_REVOKED = CONNECTION_REVOKED

    """Canonical pair connection with generation (reconnect = new generation)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    party_low = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                  related_name="connections_low",
                                  db_column="party_low_id")
    party_high = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                   related_name="connections_high",
                                   db_column="party_high_id")
    invite = models.ForeignKey(ConnectionInvite, on_delete=models.PROTECT,
                               related_name="connections")
    relationship_kind = models.CharField(max_length=16,
                                         choices=[(k, k) for k in RELATIONSHIP_KINDS])
    status = models.CharField(max_length=16, default=CONNECTION_ACTIVE)
    generation = models.PositiveIntegerField(default=1)
    revision = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(default=_utc_now)
    revoked_at = models.DateTimeField(null=True, blank=True)
    active_marker = models.GeneratedField(
        expression=models.Case(
            models.When(status=CONNECTION_ACTIVE, then=models.Value("active")),
            default=models.Value(None),
            output_field=models.CharField(max_length=16, null=True),
        ),
        output_field=models.CharField(max_length=16, null=True),
        db_persist=False,
    )

    class Meta:
        app_label = "f01_identity"
        constraints = [
            models.UniqueConstraint(fields=["party_low", "party_high", "active_marker"],
                                    name="uniq_active_pair"),
        ]
        indexes = [models.Index(fields=["party_low", "status"]),
                   models.Index(fields=["party_high", "status"])]

    def other_party(self, user_id):
        return self.party_high_id if str(user_id) == str(self.party_low_id) \
            else self.party_low_id

    def involves(self, user_id) -> bool:
        return str(user_id) in {str(self.party_low_id), str(self.party_high_id)}

    def view(self) -> dict:
        from family_bridge_core.protocols import ConnectionView
        return ConnectionView(
            connection_id=str(self.id),
            party_a=str(self.party_low_id), party_b=str(self.party_high_id),
            relationship_kind=self.relationship_kind, status=self.status,
            generation=self.generation, revision=self.revision,
        )
