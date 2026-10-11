"""F05 API tests: envelope, permissions, throttling scope, operation lookup."""

from unittest import mock

from django.test import TestCase
from rest_framework.test import APIClient

from fixtures.actors import make_student, make_caregiver, make_system_admin

from labgrants.f05_fixtures import (
    TestConnectionReader, make_test_connection, validate_reply_context,
)

from ..services import registry
from ..services.registry import register_session_resolver
import labgrants.sessions as _lab_sessions
from .helpers import auth_header, make_session


class F05ApiBase(TestCase):
    def setUp(self):
        registry.reset_registries()
        register_session_resolver(_lab_sessions.resolve_session)
        registry.register_connection_reader(TestConnectionReader())
        registry.register_context_validator(validate_reply_context)
        registry.register_quick_reply_provider(
            __import__("labgrants.f05_fixtures",
                       fromlist=["TestQuickReplyProvider"]).TestQuickReplyProvider())
        self.client = APIClient()
        self.student = make_student()
        self.caregiver = make_caregiver()
        self.admin = make_system_admin()
        self.connection = make_test_connection(self.student, self.caregiver)
        self.student_token, _ = make_session(self.student)
        self.caregiver_token, _ = make_session(self.caregiver)
        self.admin_token, _ = make_session(self.admin)


class MessageApiTests(F05ApiBase):
    def test_full_send_read_reply_flow(self):
        # send student -> caregiver (recipient is caregiver)
        from family_bridge_core.idempotency import send_payload_hash
        body = "con muốn nói bố mẹ nghe nhé"
        key = "send-0001-abcdef01"
        response = self.client.post(
            "/api/v1/messages",
            {"kind": "text", "recipient_id": str(self.caregiver.pk), "body": body},
            format="json", HTTP_X_IDEMPOTENCY_KEY=key,
            **auth_header(self.student_token))
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["state"], "sent")
        message_id = response.data["message_id"]

        # replay same key returns same message (idempotent)
        replay = self.client.post(
            "/api/v1/messages",
            {"kind": "text", "recipient_id": str(self.caregiver.pk), "body": body},
            format="json", HTTP_X_IDEMPOTENCY_KEY=key,
            **auth_header(self.student_token))
        self.assertEqual(replay.data["message_id"], message_id)

        # inbox for caregiver has the message with metadata only
        inbox = self.client.get("/api/v1/messages", format="json",
                                **auth_header(self.caregiver_token))
        self.assertEqual(inbox.status_code, 200)
        self.assertEqual(len(inbox.data["results"]), 1)
        self.assertNotIn("body", inbox.data["results"][0])
        self.assertFalse(inbox.data["results"][0]["read"])

        # caregiver opens detail and reads
        detail = self.client.get(f"/api/v1/messages/{message_id}",
                                 format="json", **auth_header(self.caregiver_token))
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["body"], body)
        read = self.client.post(f"/api/v1/messages/{message_id}/read",
                                format="json", **auth_header(self.caregiver_token))
        self.assertEqual(read.status_code, 200)

        # sender sees read state in list metadata
        inbox_sender = self.client.get("/api/v1/messages", format="json",
                                       **auth_header(self.student_token))
        self.assertTrue(inbox_sender.data["results"][0]["read"])

        # reply by caregiver (template text, still explicit send)
        reply_body = "bố mẹ đã đọc rồi"
        reply = self.client.post(
            "/api/v1/messages",
            {"kind": "quick_reply", "recipient_id": str(self.student.pk),
             "body": reply_body, "reply_to": message_id},
            format="json", HTTP_X_IDEMPOTENCY_KEY="reply-0001-abcdef01",
            **auth_header(self.caregiver_token))
        self.assertEqual(reply.status_code, 201)

    def test_send_requires_idempotency_key(self):
        response = self.client.post(
            "/api/v1/messages",
            {"kind": "text", "recipient_id": str(self.caregiver.pk), "body": "x"},
            format="json", **auth_header(self.student_token))
        self.assertEqual(response.status_code, 400)
        self.assertIn("X-Idempotency-Key", str(response.data["error"]["details"]))

    def test_unknown_fields_rejected(self):
        response = self.client.post(
            "/api/v1/messages",
            {"kind": "text", "recipient_id": str(self.caregiver.pk),
             "body": "x", "is_staff": True, "read_at": "2020-01-01"},
            format="json", HTTP_X_IDEMPOTENCY_KEY="send-0002-abcdef01",
            **auth_header(self.student_token))
        self.assertEqual(response.status_code, 400)

    def test_admin_cannot_read_others_conversation(self):
        body = "tâm sự riêng"
        sent = self.client.post(
            "/api/v1/messages",
            {"kind": "text", "recipient_id": str(self.caregiver.pk), "body": body},
            format="json", HTTP_X_IDEMPOTENCY_KEY="send-0003-abcdef01",
            **auth_header(self.student_token))
        message_id = sent.data["message_id"]
        detail = self.client.get(f"/api/v1/messages/{message_id}",
                                 format="json", **auth_header(self.admin_token))
        self.assertEqual(detail.status_code, 404)
        inbox_admin = self.client.get("/api/v1/messages", format="json",
                                      **auth_header(self.admin_token))
        self.assertEqual(inbox_admin.data["results"], [])
        # read receipt by non-recipient also denied
        read = self.client.post(f"/api/v1/messages/{message_id}/read",
                                format="json", **auth_header(self.admin_token))
        self.assertEqual(read.status_code, 404)

    def test_operation_lookup_owner_only(self):
        body = "kiểm tra operation"
        sent = self.client.post(
            "/api/v1/messages",
            {"kind": "text", "recipient_id": str(self.caregiver.pk), "body": body},
            format="json", HTTP_X_IDEMPOTENCY_KEY="send-0004-abcdef01",
            **auth_header(self.student_token))
        lookup = self.client.get("/api/v1/operations/send-0004-abcdef01",
                                 format="json", **auth_header(self.student_token))
        self.assertEqual(lookup.status_code, 200)
        self.assertEqual(lookup.data["state"], "sent")
        # stranger sees not_found for the same key (no leak)
        stranger = make_student()
        stranger_token, _ = make_session(stranger)
        other = self.client.get("/api/v1/operations/send-0004-abcdef01",
                                format="json", **auth_header(stranger_token))
        self.assertEqual(other.data["state"], "not_found")
        missing = self.client.get("/api/v1/operations/send-9999-abcdef01",
                                  format="json", **auth_header(self.student_token))
        self.assertEqual(missing.data["state"], "not_found")

    def test_quick_replies_suggestions_not_auto_sent(self):
        response = self.client.get("/api/v1/messages/quick-replies?audience=caregiver",
                                   format="json", **auth_header(self.caregiver_token))
        self.assertEqual(response.status_code, 200)
        texts = [item["text"] for item in response.data["results"]]
        self.assertTrue(any("Bố mẹ đã đọc" in t for t in texts))
        self.assertTrue(all(t["audience"] in ("caregiver", "neutral")
                            for t in response.data["results"]))

    def test_unauthenticated_401(self):
        response = self.client.get("/api/v1/messages")
        self.assertEqual(response.status_code, 401)
