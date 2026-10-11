"""F10 backend tests (US-032): need allowlist, preview binding, explicit
idempotent send, participant-only view, recipient-only ack, no escalation."""

from django.test import TestCase
from rest_framework.test import APIClient

from fixtures.actors import make_student, make_caregiver, make_system_admin

import labgrants.sessions as _lab_sessions
from labgrants.f05_fixtures import TestConnectionReader, make_test_connection
from labgrants.f10_fixtures import FakeSignalTransport

from ..services import registry
from .helpers import auth_header, make_session


class F10ApiBase(TestCase):
    def setUp(self):
        registry.reset_registries()
        registry.register_session_resolver(_lab_sessions.resolve_session)
        registry.register_connection_reader(TestConnectionReader())
        self.transport = FakeSignalTransport()
        registry.register_transport(self.transport)
        self.client = APIClient()
        self.student = make_student()
        self.caregiver = make_caregiver()
        self.admin = make_system_admin()
        self.connection = make_test_connection(self.student, self.caregiver)
        self.student_token, _ = make_session(self.student)
        self.caregiver_token, _ = make_session(self.caregiver)
        self.admin_token, _ = make_session(self.admin)

    def _send(self, token=None, need="muon_tro_chuyen", recipient=None,
              key="signal-001-abcdef01", extra=None):
        token = token or self.student_token
        payload = {"need": need,
                   "recipient_id": str((recipient or self.caregiver).pk)}
        if extra:
            payload.update(extra)
        return self.client.post("/api/v1/signals/send", payload,
                                format="json", HTTP_X_IDEMPOTENCY_KEY=key,
                                **auth_header(token))


class SignalSendTests(F10ApiBase):
    def test_meta_lists_three_needs(self):
        response = self.client.get("/api/v1/signals/meta", format="json",
                                   **auth_header(self.student_token))
        needs = [row["need"] for row in response.data["needs"]]
        self.assertEqual(needs, ["muon_tro_chuyen", "muon_duoc_o_ben",
                                 "muon_hen_gio"])

    def test_preview_binds_need_recipient_with_canonical_body(self):
        response = self.client.post(
            "/api/v1/signals/preview",
            {"need": "muon_duoc_o_ben",
             "recipient_id": str(self.caregiver.pk)},
            format="json", **auth_header(self.student_token))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["body"],
                         "Con cần được lắng nghe — con muốn có bố mẹ ở bên.")

    def test_send_creates_listening_signal_via_transport(self):
        response = self._send()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(self.transport.sent), 1)
        message = self.transport.sent[0]
        self.assertEqual(message.kind, "listening_signal")
        self.assertEqual(message.approved_body,
                         "Con cần được lắng nghe — con muốn trò chuyện với bố mẹ.")

    def test_replay_same_key_same_message(self):
        first = self._send()
        replay = self._send()
        self.assertEqual(replay.data["message_id"], first.data["message_id"])
        self.assertEqual(len(self.transport.sent), 1)

    def test_invalid_need_rejected(self):
        response = self._send(need="cuu_cuu_em")
        self.assertEqual(response.status_code, 400)

    def test_send_without_connection_403(self):
        # The transport port enforces the connection guard (same as F05):
        # no active connection -> 403 not_authorized.
        response = self._send(recipient=make_student())
        self.assertEqual(response.status_code, 403)

    def test_transport_unwired_503(self):
        registry.reset_registries()  # no transport wired
        registry.register_session_resolver(_lab_sessions.resolve_session)
        registry.register_connection_reader(TestConnectionReader())
        response = self._send()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["error"]["details"]["reason"],
                         "transport_not_wired")

    def test_unknown_fields_rejected(self):
        response = self._send(extra={"draft_id": "abc", "original": "tâm sự"})
        self.assertEqual(response.status_code, 400)

    def test_requires_idempotency_key(self):
        response = self.client.post(
            "/api/v1/signals/send",
            {"need": "muon_tro_chuyen",
             "recipient_id": str(self.caregiver.pk)},
            format="json", **auth_header(self.student_token))
        self.assertEqual(response.status_code, 400)

    def test_no_broadcast_endpoint_only_single_recipient(self):
        # The API surface has no broadcast: /signals/send requires exactly
        # one recipient; sending to TWO recipients requires two explicit
        # sends with two keys (proven here by counting transport calls).
        self._send(key="signal-002-abcdef01")
        self._send(key="signal-003-abcdef01")
        self.assertEqual(len(self.transport.sent), 2)
        self.assertEqual(len({m.recipient_id for m in self.transport.sent}),
                         1)  # both to the SAME chosen recipient


class SignalViewAckTests(F10ApiBase):
    def _sent_message_id(self, key="signal-010-abcdef01"):
        return self._send(key=key).data["message_id"]

    def test_participant_view_and_wrong_reader_404(self):
        message_id = self._sent_message_id()
        sender_view = self.client.get(f"/api/v1/signals/{message_id}",
                                      format="json",
                                      **auth_header(self.student_token))
        self.assertEqual(sender_view.status_code, 200)
        self.assertEqual(sender_view.data["need"], "muon_tro_chuyen")
        recipient_view = self.client.get(f"/api/v1/signals/{message_id}",
                                         format="json",
                                         **auth_header(self.caregiver_token))
        self.assertEqual(recipient_view.status_code, 200)
        stranger_token, _ = make_session(make_student())
        stranger_view = self.client.get(f"/api/v1/signals/{message_id}",
                                        format="json",
                                        **auth_header(stranger_token))
        self.assertEqual(stranger_view.status_code, 404)
        admin_view = self.client.get(f"/api/v1/signals/{message_id}",
                                     format="json",
                                     **auth_header(self.admin_token))
        self.assertEqual(admin_view.status_code, 404)

    def test_ack_recipient_only_and_idempotent(self):
        message_id = self._sent_message_id()
        denied = self.client.post(f"/api/v1/signals/{message_id}/ack", {},
                                  format="json",
                                  **auth_header(self.student_token))
        self.assertEqual(denied.status_code, 404)
        acked = self.client.post(f"/api/v1/signals/{message_id}/ack", {},
                                 format="json",
                                 **auth_header(self.caregiver_token))
        self.assertEqual(acked.data, {"ack": True})
        again = self.client.post(f"/api/v1/signals/{message_id}/ack", {},
                                 format="json",
                                 **auth_header(self.caregiver_token))
        self.assertEqual(again.data, {"ack": True})

    def test_view_reflects_read_state(self):
        message_id = self._sent_message_id()
        before = self.client.get(f"/api/v1/signals/{message_id}", format="json",
                                 **auth_header(self.caregiver_token))
        self.assertEqual(before.data["read"], False)
        self.client.post(f"/api/v1/signals/{message_id}/ack", {},
                         format="json", **auth_header(self.caregiver_token))
        after = self.client.get(f"/api/v1/signals/{message_id}", format="json",
                                **auth_header(self.caregiver_token))
        self.assertEqual(after.data["read"], True)

    def test_no_response_triggers_nothing(self):
        # A signal nobody responds to stays a row: no jobs, no escalation,
        # no forwarding — the only state change is the read receipt.
        message_id = self._sent_message_id()
        self.assertEqual(len(self.transport.sent), 1)
        self.assertNotIn(message_id, self.transport.read_at)
        view = self.client.get(f"/api/v1/signals/{message_id}", format="json",
                               **auth_header(self.student_token))
        self.assertEqual(view.data["response"], "none")

    def test_unauthenticated_401(self):
        response = self.client.get("/api/v1/signals/meta")
        self.assertEqual(response.status_code, 401)
