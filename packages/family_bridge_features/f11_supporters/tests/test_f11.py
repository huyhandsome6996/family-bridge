"""F11 backend tests (US-022/US-035): consent lifecycle, TTL, explicit
contact with NEW text, no broadcast/forward, enumeration protection."""

from django.test import TestCase
from rest_framework.test import APIClient

from fixtures.actors import make_student, make_caregiver, make_system_admin

import labgrants.sessions as _lab_sessions
from labgrants.f05_fixtures import make_test_connection
from labgrants.f11_fixtures import FakeMessageTransport

from ..models import SupporterRole
from ..services import registry
from .helpers import auth_header, make_session


class F11ApiBase(TestCase):
    def setUp(self):
        registry.reset_registries()
        registry.register_session_resolver(_lab_sessions.resolve_session)
        self.transport = FakeMessageTransport()
        registry.register_transport(self.transport)
        self.client = APIClient()
        self.student = make_student()
        self.caregiver = make_caregiver()
        self.teacher = make_student()
        self.admin = make_system_admin()
        # supporter must be a CONNECTED user (F01 at integration; double here)
        self.connection = make_test_connection(self.student, self.caregiver)
        self.student_token, _ = make_session(self.student)
        self.caregiver_token, _ = make_session(self.caregiver)
        self.teacher_token, _ = make_session(self.teacher)
        self.admin_token, _ = make_session(self.admin)

    def _invite(self, token=None, supporter=None, kind="family"):
        token = token or self.student_token
        return self.client.post(
            "/api/v1/supporters/roles",
            {"supporter_id": str((supporter or self.caregiver).pk),
             "relationship_kind": kind},
            format="json", **auth_header(token))

    def _respond(self, role_id, decision, token=None):
        token = token or self.caregiver_token
        return self.client.post(f"/api/v1/supporters/roles/{role_id}/respond",
                                {"decision": decision}, format="json",
                                **auth_header(token))


class InviteConsentTests(F11ApiBase):
    def test_invite_pending_then_accept_ttl(self):
        invited = self._invite()
        self.assertEqual(invited.status_code, 201)
        self.assertEqual(invited.data["status"], "pending")
        role_id = invited.data["role_id"]
        # consent belongs to the SUPPORTER only
        wrong = self._respond(role_id, "accept",
                              token=self.student_token)
        self.assertEqual(wrong.status_code, 404)
        accepted = self._respond(role_id, "accept")
        self.assertEqual(accepted.data["status"], "active")
        self.assertIsNotNone(accepted.data["expires_at"])

    def test_decline_one_way(self):
        role_id = self._invite().data["role_id"]
        declined = self._respond(role_id, "decline")
        self.assertEqual(declined.data["status"], "declined")
        late = self._respond(role_id, "accept")
        self.assertEqual(late.data["status"], "declined")

    def test_cannot_invite_self_or_unknown_kind(self):
        self.assertEqual(
            self._invite(supporter=self.student).status_code, 400)
        self.assertEqual(
            self._invite(kind="boss").status_code, 400)

    def test_duplicate_open_role_idempotent(self):
        first = self._invite()
        again = self._invite()
        self.assertEqual(again.data["role_id"], first.data["role_id"])
        self.assertEqual(SupporterRole.objects.count(), 1)

    def test_teacher_needs_connection_too(self):
        # Not connected teacher: invite connector unwired -> blocked honestly
        response = self._invite(supporter=self.teacher, kind="teacher")
        self.assertEqual(response.status_code, 201)  # role row created pending
        # BUT contact stays impossible without an ACTIVE connection
        role_id = response.data["role_id"]
        self._respond(role_id, "accept", token=self.teacher_token)
        contact = self.client.post(
            f"/api/v1/supporters/roles/{role_id}/contact",
            {"body": "chào cô"}, format="json",
            HTTP_X_IDEMPOTENCY_KEY="sup-0001-abcdef01",
            **auth_header(self.student_token))
        self.assertEqual(contact.status_code, 403)  # transport connection guard


class ContactTests(F11ApiBase):
    def _active_role(self):
        role_id = self._invite().data["role_id"]
        self._respond(role_id, "accept")
        return role_id

    def test_contact_sends_new_text_via_transport(self):
        role_id = self._active_role()
        response = self.client.post(
            f"/api/v1/supporters/roles/{role_id}/contact",
            {"body": "Bố mẹ ơi, hôm nay con cần nghe bố mẹ nói chuyện."},
            format="json", HTTP_X_IDEMPOTENCY_KEY="sup-0002-abcdef01",
            **auth_header(self.student_token))
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(self.transport.sent), 1)
        self.assertEqual(self.transport.sent[0].kind, "text")
        self.assertEqual(self.transport.sent[0].approved_body,
                         "Bố mẹ ơi, hôm nay con cần nghe bố mẹ nói chuyện.")

    def test_replay_same_key_same_message(self):
        role_id = self._active_role()
        payload = {"body": "gửi lại an toàn"}
        first = self.client.post(
            f"/api/v1/supporters/roles/{role_id}/contact", payload,
            format="json", HTTP_X_IDEMPOTENCY_KEY="sup-0003-abcdef01",
            **auth_header(self.student_token))
        replay = self.client.post(
            f"/api/v1/supporters/roles/{role_id}/contact", payload,
            format="json", HTTP_X_IDEMPOTENCY_KEY="sup-0003-abcdef01",
            **auth_header(self.student_token))
        self.assertEqual(replay.data["message_id"], first.data["message_id"])
        self.assertEqual(len(self.transport.sent), 1)

    def test_revoked_role_not_contactable(self):
        role_id = self._active_role()
        self.client.post(f"/api/v1/supporters/roles/{role_id}/revoke", {},
                         format="json", **auth_header(self.caregiver_token))
        response = self.client.post(
            f"/api/v1/supporters/roles/{role_id}/contact",
            {"body": "còn không?"}, format="json",
            HTTP_X_IDEMPOTENCY_KEY="sup-0004-abcdef01",
            **auth_header(self.student_token))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["details"]["reason"],
                         "supporter_not_available")

    def test_expired_role_not_contactable(self):
        role_id = self._active_role()
        role = SupporterRole.objects.get(pk=role_id)
        from family_bridge_core.timeutils import UTC
        import datetime as dt
        role.expires_at = dt.datetime.now(tz=UTC) - dt.timedelta(days=1)
        role.save(update_fields=["expires_at"])
        response = self.client.post(
            f"/api/v1/supporters/roles/{role_id}/contact",
            {"body": "hello"}, format="json",
            HTTP_X_IDEMPOTENCY_KEY="sup-0005-abcdef01",
            **auth_header(self.student_token))
        self.assertEqual(response.status_code, 400)

    def test_unlink_blocks_contact(self):
        role_id = self._active_role()
        from labgrants.models import TestConnection
        row = TestConnection.objects.get(pk=self.connection.pk)
        row.status = "revoked"
        row.save(update_fields=["status"])
        response = self.client.post(
            f"/api/v1/supporters/roles/{role_id}/contact",
            {"body": "hello"}, format="json",
            HTTP_X_IDEMPOTENCY_KEY="sup-0006-abcdef01",
            **auth_header(self.student_token))
        self.assertEqual(response.status_code, 403)

    def test_no_context_copy_dto_minimal(self):
        role_id = self._active_role()
        response = self.client.post(
            f"/api/v1/supporters/roles/{role_id}/contact",
            {"body": "lời mới", "quoted_letter": "thư cũ",
             "journal_page": "trang nhật ký"},
            format="json", HTTP_X_IDEMPOTENCY_KEY="sup-0007-abcdef01",
            **auth_header(self.student_token))
        self.assertEqual(response.status_code, 400)  # unknown fields rejected

    def test_enumeration_protection(self):
        self._active_role()
        stranger = make_student()
        stranger_token, _ = make_session(stranger)
        roles = self.client.get("/api/v1/supporters/roles", format="json",
                                **auth_header(stranger_token))
        self.assertEqual(roles.data["results"], [])
        admin_roles = self.client.get("/api/v1/supporters/roles",
                                      format="json",
                                      **auth_header(self.admin_token))
        self.assertEqual(admin_roles.data["results"], [])

    def test_transport_unwired_503(self):
        role_id = self._active_role()
        registry.reset_registries()
        registry.register_session_resolver(_lab_sessions.resolve_session)
        response = self.client.post(
            f"/api/v1/supporters/roles/{role_id}/contact",
            {"body": "hello"}, format="json",
            HTTP_X_IDEMPOTENCY_KEY="sup-0008-abcdef01",
            **auth_header(self.student_token))
        self.assertEqual(response.status_code, 503)

    def test_unauthenticated_401(self):
        response = self.client.get("/api/v1/supporters/roles")
        self.assertEqual(response.status_code, 401)

    def test_student_can_revoke_role(self):
        role_id = self._active_role()
        revoke = self.client.post(
            f"/api/v1/supporters/roles/{role_id}/revoke", {},
            format="json", **auth_header(self.student_token))
        self.assertEqual(revoke.status_code, 200)
        self.assertEqual(revoke.data["status"], "revoked")

    def test_stranger_cannot_revoke_role(self):
        role_id = self._active_role()
        stranger = make_student()
        stranger_token, _ = make_session(stranger)
        revoke = self.client.post(
            f"/api/v1/supporters/roles/{role_id}/revoke", {},
            format="json", **auth_header(stranger_token))
        self.assertEqual(revoke.status_code, 404)

    def test_supporter_commitments_view(self):
        role_id = self._invite().data["role_id"]
        res = self.client.get("/api/v1/supporters/commitments", format="json",
                              **auth_header(self.caregiver_token))
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data["results"]), 1)
        self.assertEqual(res.data["results"][0]["role_id"], role_id)
        # Stranger sees empty commitments
        stranger = make_student()
        stranger_token, _ = make_session(stranger)
        stranger_res = self.client.get("/api/v1/supporters/commitments",
                                       format="json",
                                       **auth_header(stranger_token))
        self.assertEqual(stranger_res.data["results"], [])

    def test_alternate_supporter_selection_no_auto_forward(self):
        # Student has two supporters: caregiver (active) and second supporter (pending)
        second_supporter = make_caregiver()
        second_token, _ = make_session(second_supporter)
        make_test_connection(self.student, second_supporter)

        # Invite second supporter, left pending
        second_invite = self._invite(supporter=second_supporter, kind="family")
        self.assertEqual(second_invite.status_code, 201)
        second_role_id = second_invite.data["role_id"]

        # First supporter is active
        first_role_id = self._active_role()

        # Student contacts first supporter explicitly
        response = self.client.post(
            f"/api/v1/supporters/roles/{first_role_id}/contact",
            {"body": "Nhắn riêng cho điểm tựa thứ nhất."},
            format="json", HTTP_X_IDEMPOTENCY_KEY="sup-alt-0001",
            **auth_header(self.student_token))
        self.assertEqual(response.status_code, 201)

        # Message is delivered ONLY to first supporter
        self.assertEqual(len(self.transport.sent), 1)
        self.assertEqual(self.transport.sent[0].recipient_id, str(self.caregiver.pk))
        self.assertEqual(self.transport.sent[0].approved_body, "Nhắn riêng cho điểm tựa thứ nhất.")

        # Pending second supporter cannot be contacted
        contact_second = self.client.post(
            f"/api/v1/supporters/roles/{second_role_id}/contact",
            {"body": "Nhắn cho điểm tựa chưa accept."},
            format="json", HTTP_X_IDEMPOTENCY_KEY="sup-alt-0002",
            **auth_header(self.student_token))
        self.assertEqual(contact_second.status_code, 400)
        self.assertEqual(contact_second.data["error"]["details"]["reason"], "supporter_not_available")

    def test_supporter_cannot_initiate_contact(self):
        # TC-F11-AUTH-01: Supporter cannot send contact message through student endpoint
        role_id = self._active_role()
        response = self.client.post(
            f"/api/v1/supporters/roles/{role_id}/contact",
            {"body": "Điểm tựa không được khởi tạo tin nhắn ngược."},
            format="json", HTTP_X_IDEMPOTENCY_KEY="sup-reverse-0001",
            **auth_header(self.caregiver_token))
        self.assertEqual(response.status_code, 404)

    def test_supporter_role_grants_no_admin_permissions(self):
        # TC-F11-NEG-05: Accepting supporter role grants zero admin permissions
        self.assertFalse(self.caregiver.is_staff)
        self.assertFalse(self.caregiver.is_superuser)
        role_id = self._active_role()
        self.caregiver.refresh_from_db()
        self.assertFalse(self.caregiver.is_staff)
        self.assertFalse(self.caregiver.is_superuser)


