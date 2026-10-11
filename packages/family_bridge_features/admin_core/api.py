"""B16 API: capability-gated admin surface (US-014/020/024/025/041).

EVERY endpoint checks a NAMED capability via AdminCapabilityService —
is_staff/superuser role strings are NEVER consulted (SEC-04). Sensitive
mutations require a reason (>= 10 chars) which lands in the audit trail;
the step-up MFA provider remains a documented pending input (fail-closed
on reason)."""

from __future__ import annotations

import json

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from family_bridge_core.errors import InputInvalid
from family_bridge_core.validation import (
    reject_unknown_fields, validate_reason, validate_text, validate_uuid,
)

from .auth import FBSDSessionAuthentication
from .models import KNOWN_CAPABILITIES
from .services.admin import (
    AdminCapabilityService, ContentLifecycleService, SettingsService,
    audit,
)


def _json_body(request) -> dict:
    if not request.body:
        return {}
    if len(request.body) > 64 * 1024:
        raise InputInvalid({"reason": "body_too_large"})
    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as exc:
        raise InputInvalid({"reason": "malformed_json"}) from exc
    if not isinstance(payload, dict):
        raise InputInvalid({"reason": "must_be_object"})
    return payload


def _require_cap(request, capability: str) -> str:
    actor_id = str(request.user.pk)
    if not AdminCapabilityService().has_capability(actor_id=actor_id,
                                                   capability=capability):
        from family_bridge_core.errors import NotFound
        # 404, not 403: no capability = the admin surface does not exist
        # for you (no enumeration of the admin API).
        raise NotFound({"reason": "not_found"})
    return actor_id


class AdminDashboardView(APIView):
    """GET — safe aggregate counts ONLY (no private bodies, no rankings)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        actor_id = _require_cap(request, "dashboard.read")
        from .models import AuditEvent, ContentItem
        from ..models import ContentItem as _C  # noqa
        items = ContentItem.objects.values("status")
        counts: dict = {}
        for row in items:
            counts[row["status"]] = counts.get(row["status"], 0) + 1
        audit_count = AuditEvent.objects.count()
        return Response({"content_by_status": counts,
                         "audit_events": audit_count,
                         "note": "Chỉ số an toàn — không dữ liệu riêng tư."})


class AdminContentListView(APIView):
    """GET ?status= — drafts/published/retired list. POST — new draft."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _require_cap(request, "content.manage")
        status = request.query_params.get("status") or None
        rows = ContentLifecycleService().list_content(status=status)
        return Response({"results": [row.view() for row in rows]})

    def post(self, request):
        actor_id = _require_cap(request, "content.manage")
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={
            "kind", "title", "body", "audience", "content_key"})
        item = ContentLifecycleService().create_draft(
            actor_id=actor_id, kind=payload.get("kind", "card"),
            title=payload.get("title", ""), body=payload.get("body", ""),
            audience=payload.get("audience", "neutral"),
            content_key=payload.get("content_key"))
        return Response(item.view(), status=201)


class AdminContentDetailView(APIView):
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, content_id: str):
        _require_cap(request, "content.manage")
        item_uuid = validate_uuid(content_id, field="content_id")
        return Response(ContentLifecycleService().get_content(
            str(item_uuid)).view())


class AdminContentPublishView(APIView):
    """POST — publish an immutable release (capability content.publish)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, content_id: str):
        actor_id = _require_cap(request, "content.publish")
        content_uuid = validate_uuid(content_id, field="content_id")
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"expected_revision"})
        revision = payload.get("expected_revision")
        if isinstance(revision, bool) or not isinstance(revision, int):
            raise InputInvalid({"field": "expected_revision",
                                "reason": "must_be_int"})
        item = ContentLifecycleService().publish(
            actor_id=actor_id, content_id=str(content_uuid),
            expected_revision=revision)
        return Response(item.view())


class AdminContentRetireView(APIView):
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, content_id: str):
        actor_id = _require_cap(request, "content.publish")
        content_uuid = validate_uuid(content_id, field="content_id")
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={
            "expected_revision", "reason"})
        revision = payload.get("expected_revision")
        if isinstance(revision, bool) or not isinstance(revision, int):
            raise InputInvalid({"field": "expected_revision",
                                "reason": "must_be_int"})
        reason = validate_reason(payload.get("reason"))
        item = ContentLifecycleService().retire(
            actor_id=actor_id, content_id=str(content_uuid),
            expected_revision=revision, reason=reason)
        return Response(item.view())


class AdminContentCloneView(APIView):
    """POST — clone a published item into a NEW draft (immutable release)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, content_id: str):
        actor_id = _require_cap(request, "content.manage")
        content_uuid = validate_uuid(content_id, field="content_id")
        reject_unknown_fields(_json_body(request), allowed=set())
        item = ContentLifecycleService().clone_draft(
            actor_id=actor_id, content_id=str(content_uuid))
        return Response(item.view(), status=201)


class AdminCapabilityListView(APIView):
    """GET ?user_id= — grants of ONE user (caps.grant or self-view)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        actor_id = str(request.user.pk)
        user_id = request.query_params.get("user_id") or actor_id
        if str(user_id) != actor_id:
            _require_cap(request, "caps.grant")
        rows = AdminCapabilityService().list_for(user_id=str(user_id))
        return Response({"results": [row.view() for row in rows]})


class AdminCapabilityGrantView(APIView):
    """POST — grant a named capability with scope + TTL; self-grant is
    impossible (final-admin guard)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        actor_id = _require_cap(request, "caps.grant")
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={
            "user_id", "capability", "scope_type", "scope_ref", "ttl_days"})
        user_id = validate_uuid(payload.get("user_id"), field="user_id")
        capability = payload.get("capability")
        if capability not in KNOWN_CAPABILITIES:
            raise InputInvalid({"field": "capability",
                                "reason": "unknown_capability"})
        grant = AdminCapabilityService().grant(
            actor_id=actor_id, user_id=str(user_id), capability=capability,
            scope_type=payload.get("scope_type", "global"),
            scope_ref=payload.get("scope_ref", ""),
            ttl_days=payload.get("ttl_days"))
        return Response(grant.view(), status=201)


class AdminCapabilityRevokeView(APIView):
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, grant_id: str):
        actor_id = _require_cap(request, "caps.grant")
        grant_uuid = validate_uuid(grant_id, field="grant_id")
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"reason"})
        reason = validate_reason(payload.get("reason"))
        grant = AdminCapabilityService().revoke(
            actor_id=actor_id, grant_id=str(grant_uuid), reason=reason)
        return Response(grant.view())


class AdminSettingsView(APIView):
    """GET — typed settings incl. immutable safety values (read-only)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _require_cap(request, "settings.manage")
        rows = SettingsService().list_settings()
        return Response({"results": [row.view() for row in rows]})


class AdminSettingDetailView(APIView):
    """POST {value} — update a NON-immutable setting; safety invariants
    (help enabled / pause 300 / no_auto_send) are rejected server-side."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, key: str):
        actor_id = _require_cap(request, "settings.manage")
        key = validate_text(key, field="key", min_len=1, max_len=64)
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"value"})
        if "value" not in payload:
            raise InputInvalid({"field": "value", "reason": "required"})
        setting = SettingsService().update(actor_id=actor_id, key=key,
                                           value=payload["value"])
        return Response(setting.view())


class AdminAuditView(APIView):
    """GET — redacted audit trail (refs/outcome/reason only, bounded)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _require_cap(request, "audit.read")
        from .models import AuditEvent
        rows = AuditEvent.objects.order_by("-created_at")[:50]
        return Response({"results": [row.view() for row in rows]})
