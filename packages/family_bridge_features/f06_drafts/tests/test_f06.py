"""F06 backend tests (US-030/US-034): controlled-clock pause boundaries,
no auto-send, stale preview/revision, cross-user denial, deletion hook."""

import datetime as dt

from django.test import TestCase
from rest_framework.test import APIClient

from fixtures.actors import make_student, make_caregiver, make_system_admin

import labgrants.sessions as _lab_sessions
from labgrants.f06_fixtures import ControlledClock, FakeKindSender
from labgrants.f05_fixtures import make_test_connection

from ..models import Draft, DraftPreview
from ..services import registry
from ..services.drafts import DraftService
from .helpers import auth_header, make_session

START = dt.datetime(2026, 10, 11, 3, 0, 0, tzinfo=dt.timezone.utc)


class F06ApiBase(TestCase):
    def setUp(self):
        registry.reset_registries()
        registry.register_session_resolver(_lab_sessions.resolve_session)
        self.clock = ControlledClock(start=START)
        registry.register_clock(self.clock)  # API uses the same clock
        self.service = DraftService(clock=self.clock)
        self.sender = FakeKindSender()
        registry.register_sender(kind="text", fn=self.sender)
        self.card_sender = FakeKindSender()
        registry.register_sender(kind="emotion_card", fn=self.card_sender)
        self.client = APIClient()
        self.student = make_student()
        self.caregiver = make_caregiver()
        self.admin = make_system_admin()
        self.connection = make_test_connection(self.student, self.caregiver)
        self.student_token, _ = make_session(self.student)
        self.caregiver_token, _ = make_session(self.caregiver)
        self.admin_token, _ = make_session(self.admin)

    def _create(self, token=None, **overrides):
        token = token or self.student_token
        payload = {"kind": "text", "body": "con muốn nói bố mẹ nghe nhé",
                   "recipient_id": str(self.caregiver.pk)}
        payload.update(overrides)
        return self.client.post("/api/v1/drafts", payload, format="json",
                                **auth_header(token))

    def _pause(self, draft_id, token=None):
        token = token or self.student_token
        return self.client.post(f"/api/v1/drafts/{draft_id}/pause", {},
                                format="json", **auth_header(token))

    def _preview(self, draft_id, token=None):
        token = token or self.student_token
        return self.client.post(f"/api/v1/drafts/{draft_id}/preview", {},
                                format="json", **auth_header(token))

    def _confirm(self, draft_id, preview_id, token=None):
        token = token or self.student_token
        return self.client.post(f"/api/v1/drafts/{draft_id}/confirm-send",
                                {"preview_id": preview_id}, format="json",
                                **auth_header(token))

    def _paused_draft(self):
        """Create + pause via the SERVICE with the controlled clock; returns
        the REFRESHED draft (start_pause persists through a separate fetch)."""
        draft = self.service.create(author_id=str(self.student.pk),
                                    kind="text",
                                    body="con muốn nói bố mẹ nghe nhé",
                                    recipient_id=str(self.caregiver.pk))
        self.service.start_pause(author_id=str(self.student.pk),
                                 draft_id=str(draft.id))
        return self.service.get_own(author_id=str(self.student.pk),
                                    draft_id=str(draft.id))


class DraftCrudTests(F06ApiBase):
    def test_create_and_get_own_draft(self):
        response = self._create()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["revision"], 1)
        self.assertEqual(response.data["status"], "editing")
        detail = self.client.get(f"/api/v1/drafts/{response.data['draft_id']}",
                                 format="json",
                                 **auth_header(self.student_token))
        self.assertEqual(detail.status_code, 200)
        self.assertIn("server_time", detail.data)

    def test_ai_linkage_fields_rejected(self):
        response = self._create(extra={"suggestion_id": "abc",
                                       "original_text": "gốc AI"})
        self.assertEqual(response.status_code, 400)

    def test_kind_allowlist_and_bounds(self):
        self.assertEqual(self._create(kind="email").status_code, 400)
        self.assertEqual(self._create(body="x" * 4001).status_code, 400)
        self.assertEqual(self._create(body="   ").status_code, 400)

    def test_edit_bumps_revision_and_keeps_deadline(self):
        draft = self._paused_draft()
        original_deadline = draft.pause_deadline_at
        edited = self.service.edit(author_id=str(self.student.pk),
                                   draft_id=str(draft.id),
                                   body="lời đã sửa", title="",
                                   card_id="", card_version=None,
                                   recipient_id=str(self.caregiver.pk))
        self.assertEqual(edited.revision, 2)
        self.assertEqual(edited.status, "editing")
        self.assertEqual(edited.pause_deadline_at, original_deadline)

    def test_cross_user_and_admin_denied(self):
        draft = self._paused_draft()
        stranger = make_student()
        stranger_token, _ = make_session(stranger)
        for token in (stranger_token, self.caregiver_token,
                      self.admin_token):
            response = self.client.get(f"/api/v1/drafts/{draft.id}",
                                       format="json", **auth_header(token))
            self.assertEqual(response.status_code, 404)
        admin_edit = self.client.post(f"/api/v1/drafts/{draft.id}",
                                      {"body": "admin sửa"}, format="json",
                                      **auth_header(self.admin_token))
        self.assertEqual(admin_edit.status_code, 404)

    def test_discard_and_delete_hook(self):
        draft = self._paused_draft()
        other = self.service.create(author_id=str(self.student.pk),
                                    kind="text", body="nháp khác",
                                    recipient_id=str(self.caregiver.pk))
        result = DraftService.apply_user_deletion(user_id=str(self.student.pk))
        self.assertGreaterEqual(result["drafts_deleted"], 2)
        self.assertEqual(Draft.objects.filter(author=self.student).count(), 0)
        self.assertEqual(
            DraftPreview.objects.filter(draft__author=self.student).count(), 0)


class PauseTimingTests(F06ApiBase):
    def test_pause_records_server_deadline_300(self):
        draft = self._paused_draft()
        self.assertEqual(draft.status, "paused")
        self.assertEqual(
            (draft.pause_deadline_at - draft.pause_started_at).total_seconds(),
            300)

    def test_re_pause_does_not_reset_deadline(self):
        draft = self._paused_draft()
        original = draft.pause_deadline_at
        again = self.service.start_pause(author_id=str(self.student.pk),
                                         draft_id=str(draft.id))
        self.clock.advance(seconds=60)
        third = self.service.start_pause(author_id=str(self.student.pk),
                                         draft_id=str(draft.id))
        self.assertEqual(third.pause_deadline_at, original)
        self.assertEqual(again.pause_deadline_at, original)

    def test_preview_api_boundary(self):
        draft = self._paused_draft()
        self.clock.advance(seconds=299)
        response = self._preview(str(draft.id))
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error"]["code"], "cooldown_active")
        self.assertEqual(response.data["error"]["details"]["remaining_seconds"], 1)
        self.clock.advance(seconds=1)  # exactly 300
        ok = self._preview(str(draft.id))
        self.assertEqual(ok.status_code, 200)
        self.clock.advance(seconds=1)  # 301 — still fine
        ok2 = self._preview(str(draft.id))
        self.assertEqual(ok2.status_code, 200)

    def test_expiry_creates_nothing_no_auto_send(self):
        draft = self._paused_draft()
        self.clock.advance(seconds=301)
        rows = self.service.list_own(author_id=str(self.student.pk))
        self.assertEqual(len(rows), 1)
        self.assertEqual(len(self.sender.sent), 0)  # no job, no message
        self.assertEqual(Draft.objects.get(pk=draft.id).status, "paused")

    def test_cancel_pause_clears_deadline(self):
        draft = self._paused_draft()
        cancelled = self.service.cancel_pause(author_id=str(self.student.pk),
                                              draft_id=str(draft.id))
        self.assertEqual(cancelled.status, "editing")
        self.assertIsNone(cancelled.pause_deadline_at)
        self.clock.advance(seconds=400)
        response = self._preview(str(draft.id))
        self.assertEqual(response.status_code, 400)  # pause_not_started

    def test_pause_not_started_preview_rejected(self):
        draft = self.service.create(author_id=str(self.student.pk),
                                    kind="text", body="chưa pause",
                                    recipient_id=str(self.caregiver.pk))
        response = self._preview(str(draft.id))
        self.assertEqual(response.status_code, 400)


class ConfirmSendTests(F06ApiBase):
    def test_full_flow_pause_preview_confirm(self):
        draft = self._paused_draft()
        self.clock.advance(seconds=300)
        preview = self._preview(str(draft.id))
        self.assertEqual(preview.status_code, 200)
        confirmed = self._confirm(str(draft.id), preview.data["preview_id"])
        self.assertEqual(confirmed.status_code, 200)
        self.assertEqual(confirmed.data["message_id"],
                         f"fake-msg-0001-{str(draft.id)[:8]}")
        self.assertEqual(len(self.sender.sent), 1)
        self.assertEqual(Draft.objects.get(pk=draft.id).status, "sent")

    def test_confirm_without_preview_rejected(self):
        draft = self._paused_draft()
        self.clock.advance(seconds=300)
        response = self._confirm(str(draft.id),
                                 "11111111-1111-1111-1111-111111111111")
        self.assertEqual(response.status_code, 404)

    def test_stale_revision_preview_rejected(self):
        draft = self._paused_draft()
        self.clock.advance(seconds=300)
        preview = self._preview(str(draft.id))
        self.service.edit(author_id=str(self.student.pk), draft_id=str(draft.id),
                          body="đổi lời sau preview", title="", card_id="",
                          card_version=None,
                          recipient_id=str(self.caregiver.pk))
        response = self._confirm(str(draft.id), preview.data["preview_id"])
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error"]["code"], "preview_stale")

    def test_recipient_changed_after_preview_rejected(self):
        draft = self._paused_draft()
        self.clock.advance(seconds=300)
        preview = self._preview(str(draft.id))
        draft.recipient_id = "11111111-1111-1111-1111-111111111111"
        draft.save(update_fields=["recipient_id"])
        response = self._confirm(str(draft.id), preview.data["preview_id"])
        self.assertEqual(response.status_code, 409)

    def test_double_confirm_blocked(self):
        draft = self._paused_draft()
        self.clock.advance(seconds=300)
        preview = self._preview(str(draft.id))
        self._confirm(str(draft.id), preview.data["preview_id"])
        again = self._confirm(str(draft.id), preview.data["preview_id"])
        self.assertEqual(again.status_code, 400)
        self.assertEqual(again.data["error"]["details"]["reason"],
                         "draft_already_sent")
        self.assertEqual(len(self.sender.sent), 1)

    def test_revoked_connection_fails_at_confirm_draft_untouched(self):
        draft = self._paused_draft()
        self.clock.advance(seconds=300)
        preview = self._preview(str(draft.id))
        from labgrants.models import TestConnection
        row = TestConnection.objects.get(pk=self.connection.pk)
        row.status = "revoked"
        row.save(update_fields=["status"])
        response = self._confirm(str(draft.id), preview.data["preview_id"])
        self.assertEqual(response.status_code, 403)
        self.assertEqual(Draft.objects.get(pk=draft.id).status, "paused")
        self.assertEqual(len(self.sender.sent), 0)

    def test_unwired_sender_fails_closed_503(self):
        registry._senders.pop("text")  # simulate unwired kind
        draft = self._paused_draft()
        self.clock.advance(seconds=300)
        preview = self._preview(str(draft.id))
        response = self._confirm(str(draft.id), preview.data["preview_id"])
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["error"]["details"]["reason"],
                         "sender_not_wired")

    def test_emotion_card_kind_uses_card_sender(self):
        draft = self.service.create(
            author_id=str(self.student.pk), kind="emotion_card",
            body="Thương bố mẹ", card_id="card-thank-01", card_version=3,
            recipient_id=str(self.caregiver.pk))
        self.service.start_pause(author_id=str(self.student.pk),
                                 draft_id=str(draft.id))
        self.clock.advance(seconds=300)
        preview = self._preview(str(draft.id))
        confirmed = self._confirm(str(draft.id), preview.data["preview_id"])
        self.assertEqual(confirmed.status_code, 200)
        self.assertEqual(len(self.card_sender.sent), 1)
        self.assertEqual(len(self.sender.sent), 0)  # text sender untouched

    def test_unauthenticated_401(self):
        response = self.client.get("/api/v1/drafts")
        self.assertEqual(response.status_code, 401)
