"""F03 backend tests (US-027): catalog, preview binding, explicit send,
snapshot immutability, participant authorization, suggestions.

Test doubles (card provider, transport, connection reader, sessions) are
clearly labelled TEST-ONLY implementations in tests/feature-lab/labgrants —
they prove the F03 CONTRACT, not real B16 content or the real F05 store
(B18 wires those; MySQL-gated suites stay NOT_RUN without a DB).
"""

import json

from django.test import TestCase
from rest_framework.test import APIClient

from fixtures.actors import make_student, make_caregiver, make_system_admin

import labgrants.sessions as _lab_sessions
from labgrants.f03_fixtures import FakeMessageTransport, TestCardProvider
from labgrants.f05_fixtures import make_test_connection

from ..models import EmotionCardSnapshot
from ..services import registry
from .helpers import auth_header, make_session


class F03ApiBase(TestCase):
    def setUp(self):
        registry.reset_registries()
        register = registry.register_session_resolver
        register(_lab_sessions.resolve_session)
        self.provider = TestCardProvider()
        registry.register_card_provider(self.provider)
        self.transport = FakeMessageTransport()
        registry.register_transport(self.transport)
        from labgrants.f05_fixtures import TestConnectionReader
        self.reader = TestConnectionReader()
        registry.register_connection_reader(self.reader)
        self.client = APIClient()
        self.student = make_student()
        self.caregiver = make_caregiver()
        self.admin = make_system_admin()
        self.connection = make_test_connection(self.student, self.caregiver)
        self.student_token, _ = make_session(self.student)
        self.caregiver_token, _ = make_session(self.caregiver)
        self.admin_token, _ = make_session(self.admin)

    def _send(self, *, token, card_id="card-thank-01", version=3,
              recipient=None, note="", key="card-0001-abcdef01", extra=None):
        payload = {"card_id": card_id, "version": version,
                   "recipient_id": str(recipient or self.caregiver.pk)}
        if note:
            payload["author_note"] = note
        if extra:
            payload.update(extra)
        return self.client.post("/api/v1/cards/send", payload, format="json",
                                HTTP_X_IDEMPOTENCY_KEY=key,
                                **auth_header(token))


class CatalogTests(F03ApiBase):
    def test_published_only_draft_and_retired_hidden(self):
        response = self.client.get("/api/v1/cards", format="json",
                                   **auth_header(self.student_token))
        self.assertEqual(response.status_code, 200)
        ids = [c["card_id"] for c in response.data["results"]]
        self.assertIn("card-thank-01", ids)
        self.assertNotIn("card-draft-01", ids)
        self.assertNotIn("card-retired-01", ids)

    def test_group_filter_and_empty_group(self):
        filtered = self.client.get("/api/v1/cards?group=nho", format="json",
                                   **auth_header(self.student_token))
        ids = [c["card_id"] for c in filtered.data["results"]]
        self.assertEqual(ids, ["card-miss-01"])
        empty = self.client.get("/api/v1/cards?group=khongco", format="json",
                                **auth_header(self.student_token))
        self.assertEqual(empty.data["results"], [])

    def test_window_bounded(self):
        response = self.client.get("/api/v1/cards?limit=2", format="json",
                                   **auth_header(self.student_token))
        self.assertLessEqual(len(response.data["results"]), 2)
        self.assertTrue(response.data["truncated"])

    def test_unauthenticated_401(self):
        response = self.client.get("/api/v1/cards")
        self.assertEqual(response.status_code, 401)


class PreviewTests(F03ApiBase):
    def test_preview_binds_exact_card_version_recipient(self):
        response = self.client.post(
            "/api/v1/cards/preview",
            {"card_id": "card-thank-01", "version": 3,
             "recipient_id": str(self.caregiver.pk)},
            format="json", **auth_header(self.student_token))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["card"]["card_id"], "card-thank-01")
        self.assertEqual(response.data["card"]["version"], 3)
        self.assertEqual(response.data["recipient_id"], str(self.caregiver.pk))

    def test_preview_rejects_wrong_version(self):
        response = self.client.post(
            "/api/v1/cards/preview",
            {"card_id": "card-thank-01", "version": 2,
             "recipient_id": str(self.caregiver.pk)},
            format="json", **auth_header(self.student_token))
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error"]["code"], "preview_stale")

    def test_preview_rejects_unknown_or_unpublished_card(self):
        for card_id in ("card-khongtontai", "card-draft-01"):
            response = self.client.post(
                "/api/v1/cards/preview",
                {"card_id": card_id, "version": 1,
                 "recipient_id": str(self.caregiver.pk)},
                format="json", **auth_header(self.student_token))
            self.assertEqual(response.status_code, 404)

    def test_preview_denied_without_active_connection(self):
        stranger = make_student()
        stranger_token, _ = make_session(stranger)
        response = self.client.post(
            "/api/v1/cards/preview",
            {"card_id": "card-thank-01", "version": 3,
             "recipient_id": str(self.caregiver.pk)},
            format="json", **auth_header(stranger_token))
        self.assertEqual(response.status_code, 404)

    def test_preview_mass_assignment_rejected(self):
        response = self.client.post(
            "/api/v1/cards/preview",
            {"card_id": "card-thank-01", "version": 3,
             "recipient_id": str(self.caregiver.pk), "is_staff": True},
            format="json", **auth_header(self.student_token))
        self.assertEqual(response.status_code, 400)


class SendTests(F03ApiBase):
    def test_send_creates_message_and_snapshot_with_author_note(self):
        response = self._send(token=self.student_token,
                              note="Con thương bố mẹ nhiều.")
        self.assertEqual(response.status_code, 201)
        message_id = response.data["message_id"]
        snapshot = EmotionCardSnapshot.objects.get(message_id=message_id)
        self.assertEqual(snapshot.card_id, "card-thank-01")
        self.assertEqual(snapshot.card_version, 3)
        self.assertEqual(snapshot.title, "Cảm ơn con")
        # composed body = author note when present
        self.assertEqual(self.transport.sent[0].approved_body,
                         "Con thương bố mẹ nhiều.")
        self.assertEqual(self.transport.sent[0].kind, "emotion_card")
        self.assertEqual(self.transport.sent[0].connection_generation,
                         self.connection.generation)

    def test_send_without_note_uses_card_body(self):
        response = self._send(token=self.student_token)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.transport.sent[0].approved_body,
                         "Cảm ơn con đã chịu khó chia sẻ với bố mẹ nhé.")

    def test_double_submit_same_key_returns_same_message_one_snapshot(self):
        first = self._send(token=self.student_token)
        replay = self._send(token=self.student_token)
        self.assertEqual(replay.data["message_id"], first.data["message_id"])
        self.assertEqual(len(self.transport.sent), 1)
        self.assertEqual(EmotionCardSnapshot.objects.count(), 1)

    def test_same_key_different_card_rejected(self):
        self._send(token=self.student_token, key="card-0002-abcdef01")
        clash = self._send(token=self.student_token,
                           card_id="card-miss-01", version=1,
                           key="card-0002-abcdef01")
        self.assertEqual(clash.status_code, 409)
        self.assertEqual(clash.data["error"]["code"],
                         "duplicate_key_payload_mismatch")

    def test_send_rejects_retired_card(self):
        self.provider.bump_version("card-retired-01", status="retired")
        response = self._send(token=self.student_token,
                              card_id="card-retired-01", version=5)
        self.assertEqual(response.status_code, 404)

    def test_card_retired_between_preview_and_send(self):
        self._send(token=self.student_token, key="card-0003-abcdef01")
        self.provider.bump_version("card-thank-01", status="retired")
        late = self._send(token=self.student_token, version=3,
                          key="card-0004-abcdef01")
        self.assertEqual(late.status_code, 404)
        self.assertEqual(late.data["error"]["code"], "not_found")

    def test_version_changed_between_preview_and_send(self):
        self.provider.bump_version("card-thank-01", new_body="Nội dung mới")
        stale = self._send(token=self.student_token, version=3)
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(stale.data["error"]["code"], "preview_stale")

    def test_send_requires_idempotency_key(self):
        response = self.client.post(
            "/api/v1/cards/send",
            {"card_id": "card-thank-01", "version": 3,
             "recipient_id": str(self.caregiver.pk)},
            format="json", **auth_header(self.student_token))
        self.assertEqual(response.status_code, 400)
        self.assertIn("X-Idempotency-Key",
                      str(response.data["error"]["details"]))

    def test_send_unknown_fields_rejected(self):
        response = self._send(token=self.student_token,
                              extra={"kind": "text", "approved_body": "hack"})
        self.assertEqual(response.status_code, 400)

    def test_author_note_too_long_rejected(self):
        response = self._send(token=self.student_token, note="x" * 1001)
        self.assertEqual(response.status_code, 400)

    def test_transport_unwired_fails_closed_503(self):
        # Fresh registries WITHOUT a transport (wiring forgotten): other
        # ports still present so the request reaches the send guard.
        registry.reset_registries()
        registry.register_session_resolver(_lab_sessions.resolve_session)
        registry.register_card_provider(TestCardProvider())
        from labgrants.f05_fixtures import TestConnectionReader
        registry.register_connection_reader(TestConnectionReader())
        response = self._send(token=self.student_token)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["error"]["code"], "module_unavailable")


class SnapshotViewTests(F03ApiBase):
    def _send_first(self, key="card-0010-abcdef01"):
        response = self._send(token=self.student_token, key=key)
        return response.data["message_id"]

    def test_recipient_sees_snapshot(self):
        message_id = self._send_first()
        detail = self.client.get(f"/api/v1/cards/{message_id}", format="json",
                                 **auth_header(self.caregiver_token))
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["card"]["title"], "Cảm ơn con")

    def test_snapshot_immutable_after_provider_changes(self):
        message_id = self._send_first()
        self.provider.bump_version("card-thank-01",
                                   new_body="Nội dung đã sửa sau khi gửi",
                                   status="retired")
        detail = self.client.get(f"/api/v1/cards/{message_id}", format="json",
                                 **auth_header(self.caregiver_token))
        self.assertEqual(detail.data["card"]["version"], 3)
        self.assertEqual(detail.data["card"]["body"],
                         "Cảm ơn con đã chịu khó chia sẻ với bố mẹ nhé.")

    def test_stranger_and_admin_cannot_read(self):
        message_id = self._send_first()
        stranger = make_student()
        stranger_token, _ = make_session(stranger)
        stranger_view = self.client.get(f"/api/v1/cards/{message_id}",
                                        format="json",
                                        **auth_header(stranger_token))
        self.assertEqual(stranger_view.status_code, 404)
        admin_view = self.client.get(f"/api/v1/cards/{message_id}",
                                     format="json",
                                     **auth_header(self.admin_token))
        self.assertEqual(admin_view.status_code, 404)

    def test_recipient_loses_card_after_unlink_sender_keeps(self):
        message_id = self._send_first()
        # simulate unlink: connection no longer active
        from labgrants.models import TestConnection
        row = TestConnection.objects.get(pk=self.connection.pk)
        row.status = "revoked"
        row.save(update_fields=["status"])
        recipient_view = self.client.get(f"/api/v1/cards/{message_id}",
                                         format="json",
                                         **auth_header(self.caregiver_token))
        self.assertEqual(recipient_view.status_code, 404)
        sender_view = self.client.get(f"/api/v1/cards/{message_id}",
                                      format="json",
                                      **auth_header(self.student_token))
        self.assertEqual(sender_view.status_code, 200)


class SuggestionsTests(F03ApiBase):
    def test_recipient_gets_group_suggestions(self):
        sent = self._send(token=self.student_token, key="card-0020-abcdef01")
        message_id = sent.data["message_id"]
        response = self.client.get(
            f"/api/v1/cards/{message_id}/reply-suggestions", format="json",
            **auth_header(self.caregiver_token))
        self.assertEqual(response.status_code, 200)
        texts = [s["text"] for s in response.data["results"]]
        self.assertTrue(any("thương con" in t for t in texts))

    def test_suggestions_never_auto_send(self):
        sent = self._send(token=self.student_token, key="card-0021-abcdef01")
        message_id = sent.data["message_id"]
        self.client.get(f"/api/v1/cards/{message_id}/reply-suggestions",
                        format="json", **auth_header(self.caregiver_token))
        self.assertEqual(len(self.transport.sent), 1)  # only the original card

    def test_suggestions_recipient_only(self):
        sent = self._send(token=self.student_token, key="card-0022-abcdef01")
        message_id = sent.data["message_id"]
        sender_view = self.client.get(
            f"/api/v1/cards/{message_id}/reply-suggestions", format="json",
            **auth_header(self.student_token))
        self.assertEqual(sender_view.status_code, 403)
        stranger = make_student()
        stranger_token, _ = make_session(stranger)
        stranger_view = self.client.get(
            f"/api/v1/cards/{message_id}/reply-suggestions", format="json",
            **auth_header(stranger_token))
        self.assertEqual(stranger_view.status_code, 404)
