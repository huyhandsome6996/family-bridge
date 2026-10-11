"""B16 backend tests (US-014/020/024/025/041): capability matrix, TTL/revocation,
final-admin guard, immutable lifecycle, immutable settings, redacted audit."""

import datetime as dt

from django.test import TestCase
from rest_framework.test import APIClient

from fixtures.actors import make_student, make_staff, make_system_admin

import labgrants.sessions as _lab_sessions
from ..models import (
    AdminCapabilityGrant, AuditEvent, ContentItem, ProductSetting,
)
from ..services import registry
from ..services.admin import AdminCapabilityService
from .helpers import auth_header, make_session


class B16ApiBase(TestCase):
    def setUp(self):
        registry.reset_registries()
        registry.register_session_resolver(_lab_sessions.resolve_session)
        self.client = APIClient()
        self.teacher = make_staff()      # synthetic admin candidate
        self.assistant = make_staff()
        self.student = make_student()
        self.sysadmin = make_system_admin()
        self.teacher_token, _ = make_session(self.teacher)
        self.assistant_token, _ = make_session(self.assistant)
        self.student_token, _ = make_session(self.student)
        self.sysadmin_token, _ = make_session(self.sysadmin)
        # The FIRST admin bootstrap: an out-of-band operator process grants
        # the initial caps.grant (documented; no public registration path).
        AdminCapabilityGrant.objects.create(
            user=self.assistant, capability="caps.grant",
            scope_type="global", granted_by="bootstrap-operator")

    def _grant_teacher_content_caps(self):
        # assistant (has caps.grant) grants teacher content capabilities
        for capability in ("content.manage", "content.publish"):
            response = self.client.post(
                "/api/v1/admin/capabilities/grant",
                {"user_id": str(self.teacher.pk), "capability": capability,
                 "scope_type": "global", "ttl_days": 30},
                format="json", **auth_header(self.assistant_token))
            self.assertEqual(response.status_code, 201, capability)

    def _draft(self, token=None):
        token = token or self.teacher_token
        return self.client.post(
            "/api/v1/admin/content",
            {"kind": "card", "title": "Thẻ thương",
             "body": "Bố mẹ tự hào về con.", "audience": "caregiver"},
            format="json", **auth_header(token))


class CapabilityTests(B16ApiBase):
    def test_no_capability_404_no_admin_surface(self):
        # teacher has NO capabilities yet: admin API effectively invisible
        response = self.client.get("/api/v1/admin/content", format="json",
                                   **auth_header(self.teacher_token))
        self.assertEqual(response.status_code, 404)
        # is_staff WITHOUT a grant is NOT admin (SEC-04)
        staff_no_grant = make_staff()
        token, _ = make_session(staff_no_grant)
        response = self.client.get("/api/v1/admin/content", format="json",
                                   **auth_header(token))
        self.assertEqual(response.status_code, 404)
        # even a superuser gets nothing without a named capability
        response = self.client.get("/api/v1/admin/content", format="json",
                                   **auth_header(self.sysadmin_token))
        self.assertEqual(response.status_code, 404)

    def test_grant_enables_then_revoke_disables(self):
        self._grant_teacher_content_caps()
        response = self.client.get("/api/v1/admin/content", format="json",
                                   **auth_header(self.teacher_token))
        self.assertEqual(response.status_code, 200)
        # revoke the manage grant
        grants = AdminCapabilityService().list_for(
            user_id=str(self.teacher.pk))
        manage_grant = next(g for g in grants
                            if g.capability == "content.manage")
        revoked = self.client.post(
            f"/api/v1/admin/capabilities/{manage_grant.id}/revoke",
            {"reason": "nghi vấn lạm quyền (kiểm tra)"},
            format="json", **auth_header(self.assistant_token))
        self.assertEqual(revoked.status_code, 200)
        response = self.client.get("/api/v1/admin/content", format="json",
                                   **auth_header(self.teacher_token))
        self.assertEqual(response.status_code, 404)

    def test_ttl_expiry_denies(self):
        AdminCapabilityGrant.objects.create(
            user=self.teacher, capability="content.manage",
            scope_type="global", granted_by="bootstrap-operator",
            expires_at=dt.datetime.now(tz=dt.timezone.utc)
            - dt.timedelta(days=1))
        response = self.client.get("/api/v1/admin/content", format="json",
                                   **auth_header(self.teacher_token))
        self.assertEqual(response.status_code, 404)

    def test_self_grant_impossible(self):
        response = self.client.post(
            "/api/v1/admin/capabilities/grant",
            {"user_id": str(self.assistant.pk), "capability": "caps.grant",
             "scope_type": "global"},
            format="json", **auth_header(self.assistant_token))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["details"]["reason"],
                         "cannot_grant_to_self")

    def test_unknown_capability_rejected(self):
        response = self.client.post(
            "/api/v1/admin/capabilities/grant",
            {"user_id": str(self.teacher.pk), "capability": "god.mode",
             "scope_type": "global"},
            format="json", **auth_header(self.assistant_token))
        self.assertEqual(response.status_code, 400)

    def test_own_capability_view_allowed(self):
        response = self.client.get("/api/v1/admin/capabilities",
                                   format="json",
                                   **auth_header(self.assistant_token))
        self.assertEqual(response.status_code, 200)


class ContentLifecycleTests(B16ApiBase):
    def test_teacher_everyday_flow(self):
        self._grant_teacher_content_caps()
        draft = self._draft()
        self.assertEqual(draft.status_code, 201)
        content_id = draft.data["content_id"]
        # publish with stale revision -> 409
        stale = self.client.post(
            f"/api/v1/admin/content/{content_id}/publish",
            {"expected_revision": 99}, format="json",
            **auth_header(self.teacher_token))
        self.assertEqual(stale.status_code, 409)
        published = self.client.post(
            f"/api/v1/admin/content/{content_id}/publish",
            {"expected_revision": 1}, format="json",
            **auth_header(self.teacher_token))
        self.assertEqual(published.data["status"], "published")
        # published content is IMMUTABLE: clone a new draft to change it
        clone = self.client.post(
            f"/api/v1/admin/content/{content_id}/clone", {}, format="json",
            **auth_header(self.teacher_token))
        self.assertEqual(clone.status_code, 201)
        self.assertEqual(clone.data["status"], "draft")
        self.assertEqual(clone.data["revision"], 2)
        # retire with reason
        retired = self.client.post(
            f"/api/v1/admin/content/{content_id}/retire",
            {"expected_revision": 1, "reason": "thay nội dung mới hơn"},
            format="json", **auth_header(self.teacher_token))
        self.assertEqual(retired.data["status"], "retired")

    def test_publish_requires_separate_capability(self):
        # grant ONLY content.manage (not publish)
        response = self.client.post(
            "/api/v1/admin/capabilities/grant",
            {"user_id": str(self.teacher.pk), "capability": "content.manage",
             "scope_type": "global"},
            format="json", **auth_header(self.assistant_token))
        self.assertEqual(response.status_code, 201)
        draft = self._draft()
        content_id = draft.data["content_id"]
        denied = self.client.post(
            f"/api/v1/admin/content/{content_id}/publish",
            {"expected_revision": 1}, format="json",
            **auth_header(self.teacher_token))
        self.assertEqual(denied.status_code, 404)

    def test_short_reason_rejected_for_retire(self):
        self._grant_teacher_content_caps()
        draft = self._draft()
        content_id = draft.data["content_id"]
        self.client.post(f"/api/v1/admin/content/{content_id}/publish",
                         {"expected_revision": 1}, format="json",
                         **auth_header(self.teacher_token))
        bad = self.client.post(
            f"/api/v1/admin/content/{content_id}/retire",
            {"expected_revision": 1, "reason": "ngắn"},
            format="json", **auth_header(self.teacher_token))
        self.assertEqual(bad.status_code, 400)


class SettingsTests(B16ApiBase):
    def test_immutable_safety_settings_rejected(self):
        self.client.post(
            "/api/v1/admin/capabilities/grant",
            {"user_id": str(self.teacher.pk), "capability": "settings.manage",
             "scope_type": "global"},
            format="json", **auth_header(self.assistant_token))
        listing = self.client.get("/api/v1/admin/settings", format="json",
                                  **auth_header(self.teacher_token))
        keys = {row["key"]: row for row in listing.data["results"]}
        self.assertEqual(keys["pause_seconds"]["value"], 300)
        self.assertTrue(keys["pause_seconds"]["immutable"])
        self.assertTrue(keys["help_enabled"]["value"])
        self.assertTrue(keys["no_auto_send"]["value"])
        for key, value in (("pause_seconds", 60), ("help_enabled", False),
                           ("no_auto_send", False)):
            denied = self.client.post(f"/api/v1/admin/settings/{key}",
                                      {"value": value}, format="json",
                                      **auth_header(self.teacher_token))
            self.assertEqual(denied.status_code, 400, key)
            self.assertEqual(denied.data["error"]["details"]["reason"],
                             "setting_is_immutable", key)
        # a normal mutable setting works
        ok = self.client.post("/api/v1/admin/settings/default_page_size",
                              {"value": 20}, format="json",
                              **auth_header(self.teacher_token))
        self.assertEqual(ok.status_code, 200)

    def test_direct_api_denied_without_capability(self):
        response = self.client.get("/api/v1/admin/settings", format="json",
                                   **auth_header(self.sysadmin_token))
        self.assertEqual(response.status_code, 404)  # even superuser


class AuditTests(B16ApiBase):
    def test_audit_redacted_and_bounded(self):
        self._grant_teacher_content_caps()
        draft = self._draft()
        content_id = draft.data["content_id"]
        self.client.post(f"/api/v1/admin/content/{content_id}/publish",
                         {"expected_revision": 1}, format="json",
                         **auth_header(self.teacher_token))
        # assistant needs the audit.read capability to view the trail —
        # granted by the out-of-band bootstrap operator (self-grant is
        # impossible by design, tested in CapabilityTests).
        AdminCapabilityGrant.objects.create(
            user=self.assistant, capability="audit.read",
            scope_type="global", granted_by="bootstrap-operator")
        trail = self.client.get("/api/v1/admin/audit", format="json",
                                **auth_header(self.assistant_token))
        self.assertEqual(trail.status_code, 200)
        for row in trail.data["results"]:
            self.assertEqual(set(row.keys()), {
                "event_id", "actor_id", "action", "target_ref", "outcome",
                "reason", "created_at"})
            # no body/content text leaks into audit
            self.assertNotIn("Bố mẹ tự hào", str(row))

    def test_unauthenticated_401(self):
        response = self.client.get("/api/v1/admin/content")
        self.assertEqual(response.status_code, 401)
