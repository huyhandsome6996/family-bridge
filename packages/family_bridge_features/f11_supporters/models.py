"""F11 models: SupporterRole — the approved backup-supporter relationship
(US-022/US-035).

Invariants:
- A supporter role NEVER grants admin/data access: it is a plain support
  relationship; contact happens through the normal message transport with
  the supporter as an ordinary connected user.
- Consent is BILATERAL and current: pending -> active requires the
  SUPPORTER's own accept action; roles carry a TTL (expires_at) and are
  re-verified at EVERY contact (active + unexpired + connection guard on
  the transport). Nothing assumes Thầy/anyone "already agreed".
- relationship_kind/scope come from allowlists; scope v1 is listening-only.
- One pending-or-active role per (student, supporter) pair (partial UNIQUE
  constraint); declined/revoked/expired rows allow a fresh invitation.
"""

import datetime as dt
import uuid

from django.conf import settings
from django.db import models

from family_bridge_core.timeutils import UTC

KIND_FAMILY = "family"
KIND_TEACHER = "teacher"
KIND_COUNSELOR = "counselor"
RELATIONSHIP_KINDS = (KIND_FAMILY, KIND_TEACHER, KIND_COUNSELOR)

SCOPE_LISTENING = "listening"
SUPPORT_SCOPES = (SCOPE_LISTENING,)

STATUS_PENDING = "pending"
STATUS_ACTIVE = "active"
STATUS_DECLINED = "declined"
STATUS_REVOKED = "revoked"
STATUS_EXPIRED = "expired"

ROLE_TTL_DAYS = 90  # DEC-17 provisional; ratified policy comes later


def _utc_now() -> dt.datetime:
    return dt.datetime.now(tz=UTC)


class SupporterRole(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(settings.AUTH_USER_MODEL,
                                on_delete=models.CASCADE,
                                related_name="f11_supporter_roles")
    supporter = models.ForeignKey(settings.AUTH_USER_MODEL,
                                  on_delete=models.CASCADE,
                                  related_name="f11_supporter_commitments")
    relationship_kind = models.CharField(max_length=16)
    support_scope = models.CharField(max_length=16, default=SCOPE_LISTENING)
    status = models.CharField(max_length=16, default=STATUS_PENDING)
    invited_at = models.DateTimeField(default=_utc_now, editable=False)
    responded_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = "f11_supporters"
        constraints = [
            models.UniqueConstraint(
                fields=["student", "supporter"],
                condition=models.Q(status__in=["pending", "active"]),
                name="uniq_f11_open_role_per_pair"),
        ]
        indexes = [
            models.Index(fields=["student", "status"]),
            models.Index(fields=["supporter", "status"]),
        ]

    def is_contactable(self, *, now: dt.datetime) -> bool:
        return (self.status == STATUS_ACTIVE
                and (self.expires_at is None or now < self.expires_at))

    def view(self, *, viewer_id: str) -> dict:
        role_for_me = str(self.supporter_id) == str(viewer_id)
        return {
            "role_id": str(self.id),
            "student_id": str(self.student_id),
            "supporter_id": str(self.supporter_id),
            "relationship_kind": self.relationship_kind,
            "support_scope": self.support_scope,
            "status": self.status,
            "invited_at": self.invited_at.isoformat(),
            "responded_at": self.responded_at.isoformat()
            if self.responded_at else None,
            "expires_at": self.expires_at.isoformat()
            if self.expires_at else None,
            "can_contact": self.is_contactable(now=_utc_now())
            and not role_for_me,
        }
