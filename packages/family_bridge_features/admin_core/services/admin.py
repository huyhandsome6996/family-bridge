"""B16 services: capability checker, content lifecycle, settings, audit."""

from __future__ import annotations

import datetime as dt
from typing import Any, Dict, List, Optional

from django.db import transaction

from family_bridge_core.errors import (
    InputInvalid, NotFound, PreviewStale,
)
from family_bridge_core.timeutils import UTC

from ..models import (
    CONTENT_DRAFT, CONTENT_PUBLISHED, CONTENT_RETIRED, IMMUTABLE_SETTINGS,
    KNOWN_CAPABILITIES, SCOPE_TYPES, AdminCapabilityGrant, AuditEvent,
    ContentItem, ProductSetting,
)


def _now() -> dt.datetime:
    return dt.datetime.now(tz=UTC)


def audit(*, actor_id: str, action: str, target_ref: str, outcome: str,
          reason: str = "") -> None:
    """Redacted by construction: refs/outcome/reason ONLY (SEC-22)."""
    AuditEvent.objects.create(actor_id=str(actor_id)[:64],
                              action=str(action)[:64],
                              target_ref=str(target_ref)[:128],
                              outcome=str(outcome)[:16],
                              reason=str(reason or "")[:200])


class AdminCapabilityService:
    """Implements the B00 AdminCapabilityChecker protocol: the ONLY admin
    authorization path (is_staff/superuser never consulted)."""

    def has_capability(self, *, actor_id: str, capability: str,
                       scope_type: str = "global",
                       scope_ref: Optional[str] = None,
                       at: Optional[dt.datetime] = None) -> bool:
        now = at or _now()
        grants = AdminCapabilityGrant.objects.filter(
            user_id=str(actor_id), capability=capability,
            revoked_at__isnull=True)
        for grant in grants:
            if grant.is_active(now=now):
                return True
        return False

    @transaction.atomic
    def grant(self, *, actor_id: str, user_id: str, capability: str,
              scope_type: str, scope_ref: str,
              ttl_days: Optional[int]) -> AdminCapabilityGrant:
        if capability not in KNOWN_CAPABILITIES:
            raise InputInvalid({"field": "capability",
                                "reason": "unknown_capability",
                                "allowed": list(KNOWN_CAPABILITIES)})
        if scope_type not in SCOPE_TYPES:
            raise InputInvalid({"field": "scope_type",
                                "reason": "invalid_scope"})
        if str(user_id) == str(actor_id):
            # FINAL-ADMIN GUARD: no self-grant, ever.
            raise InputInvalid({"reason": "cannot_grant_to_self"})
        ttl = None
        if ttl_days is not None:
            if isinstance(ttl_days, bool) or not isinstance(ttl_days, int) \
                    or not 1 <= ttl_days <= 365:
                raise InputInvalid({"field": "ttl_days",
                                    "reason": "must_be_1_365"})
            ttl = _now() + dt.timedelta(days=ttl_days)
        from django.db import IntegrityError
        try:
            with transaction.atomic():
                grant, _ = AdminCapabilityGrant.objects.get_or_create(
                    user_id=str(user_id), capability=capability,
                    scope_type=scope_type, scope_ref=str(scope_ref or ""),
                    revoked_at__isnull=True,
                    defaults={"granted_by": str(actor_id), "expires_at": ttl})
        except IntegrityError:
            grant = AdminCapabilityGrant.objects.filter(
                user_id=str(user_id), capability=capability,
                scope_type=scope_type, scope_ref=str(scope_ref or ""),
                revoked_at__isnull=True,
            ).first()
            if grant is None:
                raise
        audit(actor_id=actor_id, action="cap.grant",
              target_ref=f"grant:{grant.id}", outcome="ok",
              reason=capability)
        return grant

    @transaction.atomic
    def revoke(self, *, actor_id: str, grant_id: str,
               reason: str) -> AdminCapabilityGrant:
        if str(grant_id) == "self":
            raise InputInvalid({"reason": "cannot_revoke_self"})
        grant = AdminCapabilityGrant.objects.filter(pk=grant_id).first()
        if grant is None:
            raise NotFound({"reason": "grant_not_found"})
        if str(grant.user_id) == str(actor_id):
            raise InputInvalid({"reason": "cannot_revoke_self"})
        if grant.revoked_at is None:
            grant.revoked_at = _now()
            grant.save(update_fields=["revoked_at"])
        audit(actor_id=actor_id, action="cap.revoke",
              target_ref=f"grant:{grant.id}", outcome="ok",
              reason=reason)
        return grant

    def list_for(self, *, user_id: str) -> List[AdminCapabilityGrant]:
        return list(AdminCapabilityGrant.objects.filter(
            user_id=str(user_id)).order_by("-granted_at"))


class ContentLifecycleService:
    def list_content(self, *, status: Optional[str] = None):
        qs = ContentItem.objects.all()
        if status:
            qs = qs.filter(status=status)
        return list(qs.order_by("-updated_at")[:50])

    def get_content(self, content_id: str) -> ContentItem:
        item = ContentItem.objects.filter(pk=content_id).first()
        if item is None:
            raise NotFound({"reason": "content_not_found"})
        return item

    @transaction.atomic
    def create_draft(self, *, actor_id: str, kind: str, title: str,
                     body: str, audience: str,
                     content_key: Optional[str] = None) -> ContentItem:
        if not title.strip() or not body.strip():
            raise InputInvalid({"field": "title/body", "reason": "empty"})
        item = ContentItem.objects.create(
            content_key=str(content_key or f"{kind}-{uuid4_short()}")[:64],
            kind=str(kind)[:32], title=str(title)[:120],
            body=str(body)[:8000], audience=str(audience)[:16],
            created_by=str(actor_id))
        audit(actor_id=actor_id, action="content.draft",
              target_ref=f"content:{item.id}", outcome="ok")
        return item

    @transaction.atomic
    def publish(self, *, actor_id: str, content_id: str,
                expected_revision: int) -> ContentItem:
        item = self.get_content(content_id)
        if item.revision != expected_revision:
            raise PreviewStale({"reason": "content_changed"})
        if item.status != CONTENT_DRAFT:
            raise InputInvalid({"reason": "not_a_draft"})
        item.status = CONTENT_PUBLISHED
        item.published_at = _now()
        item.updated_at = _now()
        item.save()
        audit(actor_id=actor_id, action="content.publish",
              target_ref=f"content:{item.id}:rev{item.revision}",
              outcome="ok")
        return item

    @transaction.atomic
    def retire(self, *, actor_id: str, content_id: str,
               expected_revision: int, reason: str) -> ContentItem:
        item = self.get_content(content_id)
        if item.revision != expected_revision:
            raise PreviewStale({"reason": "content_changed"})
        if item.status != CONTENT_PUBLISHED:
            raise InputInvalid({"reason": "not_published"})
        item.status = CONTENT_RETIRED
        item.updated_at = _now()
        item.save()
        audit(actor_id=actor_id, action="content.retire",
              target_ref=f"content:{item.id}:rev{item.revision}",
              outcome="ok", reason=reason)
        return item

    @transaction.atomic
    def clone_draft(self, *, actor_id: str, content_id: str) -> ContentItem:
        """Editing a published item = clone a NEW draft (immutable release)."""
        source = self.get_content(content_id)
        if source.status != CONTENT_PUBLISHED:
            raise InputInvalid({"reason": "clone_from_published_only"})
        clone = ContentItem.objects.create(
            content_key=source.content_key, kind=source.kind,
            title=source.title, body=source.body,
            audience=source.audience, status=CONTENT_DRAFT,
            revision=source.revision + 1, created_by=str(actor_id))
        audit(actor_id=actor_id, action="content.clone",
              target_ref=f"content:{source.id}->{clone.id}", outcome="ok")
        return clone


def uuid4_short() -> str:
    import uuid
    return uuid.uuid4().hex[:8]


class SettingsService:
    def ensure_defaults(self) -> None:
        for key, value in IMMUTABLE_SETTINGS.items():
            ProductSetting.objects.get_or_create(
                key=key, defaults={"value": value, "immutable": True})

    def list_settings(self) -> List[ProductSetting]:
        self.ensure_defaults()
        return list(ProductSetting.objects.all().order_by("key"))

    def get_setting(self, key: str) -> ProductSetting:
        self.ensure_defaults()
        setting = ProductSetting.objects.filter(key=key).first()
        if setting is None:
            raise NotFound({"reason": "setting_not_found"})
        return setting

    @transaction.atomic
    def update(self, *, actor_id: str, key: str, value: Any) -> ProductSetting:
        self.ensure_defaults()
        setting = ProductSetting.objects.filter(key=key).first()
        if setting is not None and setting.immutable:
            # WF-13: safety invariants are read-only; backend rejects.
            raise InputInvalid({"reason": "setting_is_immutable",
                                "key": key})
        if not isinstance(key, str) or len(key) > 64 or \
                not key.replace("_", "").replace(".", "").isalnum():
            raise InputInvalid({"field": "key", "reason": "invalid_key"})
        if setting is None:
            setting = ProductSetting(key=key, value=value,
                                     immutable=False)
        else:
            setting.value = value
        setting.updated_by = str(actor_id)
        setting.updated_at = _now()
        setting.save()
        audit(actor_id=actor_id, action="setting.update",
              target_ref=f"setting:{key}", outcome="ok")
        return setting
