"""F12 backend tests (US-038/US-046): directory gate, conditional
scheduling, claim scope, stale acceptance, overlap, revoked staff, notes."""

import datetime as dt

from django.test import TestCase
from rest_framework.test import APIClient

from fixtures.actors import make_student, make_staff, make_system_admin

import labgrants.sessions as _lab_sessions
from labgrants.f12_fixtures import TestSchoolDirectory, TestStaffDirectory

from ..models import AppointmentRequest, AppointmentSlot
from ..services import registry
from .helpers import auth_header, make_session

START = dt.datetime(2026, 10, 11, 3, 0, 0, tzinfo=dt.timezone.utc)
SLOT_ISO = "2026-10-12T09:00:00+00:00"


class F12ApiBase(TestCase):
    def setUp(self):
        registry.reset_registries()
        registry.register_session_resolver(_lab_sessions.resolve_session)
        self.staff_directory = TestStaffDirectory()
        registry.register_staff_directory(self.staff_directory)
        registry.register_school_directory(TestSchoolDirectory())
        self.client = APIClient()
        self.student = make_student()
        self.teacher = make_staff()      # synthetic operator (test-only)
        self.admin = make_system_admin()
        self.stranger = make_student()
        self.staff_directory.add_handler(self.teacher.pk)
        self.student_token, _ = make_session(self.student)
        self.teacher_token, _ = make_session(self.teacher)
        self.admin_token, _ = make_session(self.admin)
        self.stranger_token, _ = make_session(self.stranger)

    def _create(self, token=None, **overrides):
        token = token or self.student_token
        payload = {"topic": "tinh_cam", "note": "con muốn gặp cô trò chuyện"}
        payload.update(overrides)
        return self.client.post("/api/v1/appointments/requests", payload,
                                format="json", **auth_header(token))


class DirectoryTests(F12ApiBase):
    def test_school_directory_requires_auth(self):
        response = self.client.get("/api/v1/appointments/directory")
        self.assertEqual(response.status_code, 401)

    def test_school_directory_verified_only(self):
        response = self.client.get("/api/v1/appointments/directory",
                                   format="json",
                                   **auth_header(self.student_token))
        rows = response.data["results"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["status"], "verified")
        self.assertTrue(rows[0]["accepting_appointments"])


class GateTests(F12ApiBase):
    def test_unwired_staff_directory_503(self):
        registry.register_school_directory(TestSchoolDirectory())
        registry.reset_registries()
        registry.register_session_resolver(_lab_sessions.resolve_session)
        response = self._create()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["error"]["details"]["reason"],
                         "scheduling_no_staff")

    def test_empty_staff_directory_503(self):
        self.staff_directory.revoke(self.teacher.pk)
        response = self._create()
        self.assertEqual(response.status_code, 503)


class FlowTests(F12ApiBase):
    def _claimed_request(self):
        response = self._create()
        request_id = response.data["request_id"]
        self.client.post(f"/api/v1/appointments/requests/{request_id}/claim",
                         {}, format="json", **auth_header(self.teacher_token))
        return request_id

    def test_full_flow_submit_claim_propose_accept_complete(self):
        request_id = self._claimed_request()
        detail = self.client.get(f"/api/v1/appointments/requests/{request_id}",
                                 format="json",
                                 **auth_header(self.student_token))
        self.assertEqual(detail.data["status"], "assigned")
        # submission did NOT claim an appointment exists
        self.assertNotEqual(detail.data["status"], "scheduled")
        proposed = self.client.post(
            f"/api/v1/appointments/requests/{request_id}/slots",
            {"start_at": SLOT_ISO}, format="json",
            **auth_header(self.teacher_token))
        self.assertEqual(proposed.status_code, 201)
        self.assertIn("chưa có lịch hẹn", proposed.data["note"])
        slot_id = proposed.data["slot"]["slot_id"]
        accepted = self.client.post(
            f"/api/v1/appointments/requests/{request_id}"
            f"/slots/{slot_id}/accept", {}, format="json",
            **auth_header(self.student_token))
        self.assertEqual(accepted.data["status"], "scheduled")
        completed = self.client.post(
            f"/api/v1/appointments/requests/{request_id}/complete", {},
            format="json", **auth_header(self.teacher_token))
        self.assertEqual(completed.data["status"], "completed")

    def test_stale_acceptance_rejected(self):
        request_id = self._claimed_request()
        slot1 = self.client.post(
            f"/api/v1/appointments/requests/{request_id}/slots",
            {"start_at": SLOT_ISO}, format="json",
            **auth_header(self.teacher_token)).data["slot"]["slot_id"]
        slot2 = self.client.post(
            f"/api/v1/appointments/requests/{request_id}/slots",
            {"start_at": "2026-10-13T09:00:00+00:00"}, format="json",
            **auth_header(self.teacher_token)).data["slot"]["slot_id"]
        stale = self.client.post(
            f"/api/v1/appointments/requests/{request_id}"
            f"/slots/{slot1}/accept", {}, format="json",
            **auth_header(self.student_token))
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(stale.data["error"]["code"], "preview_stale")
        current = self.client.post(
            f"/api/v1/appointments/requests/{request_id}"
            f"/slots/{slot2}/accept", {}, format="json",
            **auth_header(self.student_token))
        self.assertEqual(current.data["status"], "scheduled")

    def test_overlap_same_handler_409(self):
        request_id = self._claimed_request()
        self.client.post(f"/api/v1/appointments/requests/{request_id}/slots",
                         {"start_at": SLOT_ISO}, format="json",
                         **auth_header(self.teacher_token))
        slot_id = AppointmentSlot.objects.get(
            request_id=request_id).id
        self.client.post(
            f"/api/v1/appointments/requests/{request_id}"
            f"/slots/{slot_id}/accept", {}, format="json",
            **auth_header(self.student_token))
        # another request, same handler, overlapping window
        other = self._create()
        other_id = other.data["request_id"]
        self.client.post(f"/api/v1/appointments/requests/{other_id}/claim",
                         {}, format="json", **auth_header(self.teacher_token))
        clash = self.client.post(
            f"/api/v1/appointments/requests/{other_id}/slots",
            {"start_at": "2026-10-12T09:15:00+00:00"}, format="json",
            **auth_header(self.teacher_token))
        self.assertEqual(clash.status_code, 409)
        self.assertEqual(clash.data["error"]["code"], "slot_unavailable")

    def test_notes_requester_and_assigned_only(self):
        request_id = self._claimed_request()
        stranger_view = self.client.get(
            f"/api/v1/appointments/requests/{request_id}", format="json",
            **auth_header(self.stranger_token))
        self.assertEqual(stranger_view.status_code, 404)
        admin_view = self.client.get(
            f"/api/v1/appointments/requests/{request_id}", format="json",
            **auth_header(self.admin_token))
        self.assertEqual(admin_view.status_code, 404)
        handler_view = self.client.get(
            f"/api/v1/appointments/requests/{request_id}", format="json",
            **auth_header(self.teacher_token))
        self.assertEqual(handler_view.data["note"],
                         "con muốn gặp cô trò chuyện")

    def test_revoked_staff_loses_access_immediately(self):
        # A second operator stays so the directory is not empty (otherwise
        # the whole scheduling gate would 503 — covered by GateTests).
        other_teacher = make_staff()
        self.staff_directory.add_handler(other_teacher.pk)
        request_id = self._claimed_request()
        self.staff_directory.revoke(self.teacher.pk)
        propose = self.client.post(
            f"/api/v1/appointments/requests/{request_id}/slots",
            {"start_at": SLOT_ISO}, format="json",
            **auth_header(self.teacher_token))
        self.assertEqual(propose.status_code, 404)
        detail = self.client.get(
            f"/api/v1/appointments/requests/{request_id}", format="json",
            **auth_header(self.teacher_token))
        self.assertEqual(detail.status_code, 404)  # note access gone

    def test_non_capability_claim_no_scope_leak(self):
        response = self._create()
        request_id = response.data["request_id"]
        # admin without appointment capability claims -> 404 (no queue leak)
        denied = self.client.post(
            f"/api/v1/appointments/requests/{request_id}/claim", {},
            format="json", **auth_header(self.admin_token))
        self.assertEqual(denied.status_code, 404)
        queue = self.client.get("/api/v1/appointments/queue", format="json",
                                **auth_header(self.admin_token))
        self.assertEqual(queue.status_code, 404)

    def test_cancel_idempotent(self):
        request_id = self._claimed_request()
        first = self.client.post(
            f"/api/v1/appointments/requests/{request_id}/cancel", {},
            format="json", **auth_header(self.student_token))
        self.assertEqual(first.data["status"], "cancelled")
        again = self.client.post(
            f"/api/v1/appointments/requests/{request_id}/cancel", {},
            format="json", **auth_header(self.teacher_token))
        self.assertEqual(again.data["status"], "cancelled")

    def test_topic_allowlist_and_bounds(self):
        self.assertEqual(self._create(topic="ban_gai").status_code, 400)
        self.assertEqual(self._create(note="x" * 4001).status_code, 400)

    def test_past_slot_rejected(self):
        request_id = self._claimed_request()
        response = self.client.post(
            f"/api/v1/appointments/requests/{request_id}/slots",
            {"start_at": "2020-01-01T00:00:00+00:00"}, format="json",
            **auth_header(self.teacher_token))
        self.assertEqual(response.status_code, 400)

    def test_unauthenticated_401(self):
        response = self.client.get("/api/v1/appointments/requests")
        self.assertEqual(response.status_code, 401)
