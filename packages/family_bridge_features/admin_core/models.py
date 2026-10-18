"""B16 models: capability grants + content lifecycle + settings + audit.

Invariants:
- Named capabilities + scope + TTL (WF-14/SEC-04): is_staff/superuser
  NEVER satisfy admin authorization — only an unexpired, unrevoked grant
  matching (capability, scope_type, scope_ref) does.
- FINAL-ADMIN GUARD: nobody can grant/revoke capabilities for themselves
  (anti self-escalation), and grants always carry an actor + reason.
- Content lifecycle (WF-15): draft -> publish (IMMUTABLE release) ->
  retire; editing a published item requires cloning a new draft (new
  revision). Stale revisions are rejected 409.
- Product settings are typed; the three safety invariants are immutable
  and always enforced server-side: help enabled, pause = 300s fixed,
  no_auto_send always kept (WF-13/CFG).
- Audit events are redacted by construction: refs/outcome/reason only —
  never bodies, tokens, codes or private text (SEC-22).
"""

import datetime as dt
import uuid

from django.conf import settings
from django.db import models

from family_bridge_core.timeutils import UTC

SCOPE_GLOBAL = "global"
SCOPE_SCHOOL = "school"
SCOPE_TYPES = (SCOPE_GLOBAL, SCOPE_SCHOOL)

# Named capability codes (subset of the CAP catalog implemented here; the
# full 22-cap catalog maps onto these primitives at integration).
CAP_CONTENT_MANAGE = "content.manage"
CAP_CONTENT_PUBLISH = "content.publish"
CAP_CAPS_GRANT = "caps.grant"
CAP_SETTINGS_MANAGE = "settings.manage"
CAP_AUDIT_READ = "audit.read"
CAP_DASHBOARD_READ = "dashboard.read"
# CAP-23 (bo sung 18/10/2026 — admin-provisioned pairs): cap phat/nap cap
# tai khoan lop HS/PH thanh ket noi ACTIVE. Scope "school" cua grant
# giam scope_ref = class_ref cu the; grant "global" mo rong moi lop.
# So huu nghiep vu: f16_classroom.services.admin_provision.
CAP_CLASSROOM_PROVISION = "classroom.provision"
KNOWN_CAPABILITIES = (CAP_CONTENT_MANAGE, CAP_CONTENT_PUBLISH, CAP_CAPS_GRANT,
                      CAP_SETTINGS_MANAGE, CAP_AUDIT_READ, CAP_DASHBOARD_READ,
                      CAP_CLASSROOM_PROVISION)

CONTENT_DRAFT = "draft"
CONTENT_PUBLISHED = "published"
CONTENT_RETIRED = "retired"

IMMUTABLE_SETTINGS = {
    "help_enabled": True,     # help ALWAYS enabled (WF-13)
    "pause_seconds": 300,     # fixed, server-decided (DEC-03)
    "no_auto_send": True,     # never auto-send (FL-08)
}


def _utc_now() -> dt.datetime:
    return dt.datetime.now(tz=UTC)


class AdminCapabilityGrant(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL,
                             on_delete=models.CASCADE,
                             related_name="f16_capability_grants")
    capability = models.CharField(max_length=64)
    scope_type = models.CharField(max_length=16, default=SCOPE_GLOBAL)
    scope_ref = models.CharField(max_length=64, blank=True, default="")
    granted_by = models.CharField(max_length=64)
    granted_at = models.DateTimeField(default=_utc_now, editable=False)
    expires_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = "admin_core"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "capability", "scope_type", "scope_ref"],
                condition=models.Q(revoked_at__isnull=True),
                name="uniq_f16_active_grant"),
        ]
        indexes = [
            models.Index(fields=["user", "capability"]),
        ]

    def is_active(self, *, now: dt.datetime) -> bool:
        return (self.revoked_at is None
                and (self.expires_at is None or now < self.expires_at))

    def view(self) -> dict:
        return {
            "grant_id": str(self.id),
            "user_id": str(self.user_id),
            "capability": self.capability,
            "scope_type": self.scope_type,
            "scope_ref": self.scope_ref or None,
            "granted_by": self.granted_by,
            "granted_at": self.granted_at.isoformat(),
            "expires_at": self.expires_at.isoformat()
            if self.expires_at else None,
            "revoked": self.revoked_at is not None,
        }


class ContentItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    content_key = models.CharField(max_length=64)
    kind = models.CharField(max_length=32)
    title = models.CharField(max_length=120)
    body = models.TextField()
    audience = models.CharField(max_length=16, default="neutral")
    status = models.CharField(max_length=16, default=CONTENT_DRAFT)
    revision = models.PositiveIntegerField(default=1, editable=False)
    created_by = models.CharField(max_length=64)
    review_note = models.CharField(max_length=200, blank=True, default="")
    published_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(default=_utc_now, editable=False)

    class Meta:
        app_label = "admin_core"
        indexes = [
            models.Index(fields=["status", "updated_at"]),
        ]

    def view(self) -> dict:
        return {
            "content_id": str(self.id),
            "content_key": self.content_key,
            "kind": self.kind,
            "title": self.title,
            "audience": self.audience,
            "status": self.status,
            "revision": self.revision,
            "published_at": self.published_at.isoformat()
            if self.published_at else None,
            "updated_at": self.updated_at.isoformat(),
        }


class ProductSetting(models.Model):
    key = models.CharField(max_length=64, primary_key=True)
    value = models.JSONField()
    immutable = models.BooleanField(default=False)
    updated_by = models.CharField(max_length=64, blank=True, default="")
    updated_at = models.DateTimeField(default=_utc_now, editable=False)

    class Meta:
        app_label = "admin_core"

    def view(self) -> dict:
        return {"key": self.key, "value": self.value,
                "immutable": self.immutable}


class AuditEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor_id = models.CharField(max_length=64)
    action = models.CharField(max_length=64)
    target_ref = models.CharField(max_length=128)
    outcome = models.CharField(max_length=16)
    reason = models.CharField(max_length=200, blank=True, default="")
    created_at = models.DateTimeField(default=_utc_now, editable=False)

    class Meta:
        app_label = "admin_core"
        indexes = [
            models.Index(fields=["actor_id", "created_at"]),
            models.Index(fields=["created_at"]),
        ]

    def view(self) -> dict:
        return {
            "event_id": str(self.id),
            "actor_id": self.actor_id,
            "action": self.action,
            "target_ref": self.target_ref,
            "outcome": self.outcome,
            "reason": self.reason,
            "created_at": self.created_at.isoformat(),
        }
