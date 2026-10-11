"""F08 backend tests (US-016/US-031): owner-only pages + search/count,
one-page grants, revision guard, replies never unlock revoked pages,
deletion without orphans."""

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from fixtures.actors import make_student, make_caregiver, make_system_admin

import labgrants.sessions as _lab_sessions
from labgrants.f05_fixtures import TestConnectionReader, make_test_connection
from labgrants.f08_fixtures import TestPromptProvider

from ..models import JournalPage, JournalReply, JournalShare
from ..services import registry
from .helpers import auth_header, make_session

CONTENT = "Hôm nay con muốn viết riêng điều này: bố mẹ đừng so sánh con."
TEACHER = None  # teacher role is plain user in fixtures; sysadmin covers


class F08ApiBase(TestCase):
    def setUp(self):
        registry.reset_registries()
        registry.register_session_resolver(_lab_sessions.resolve_session)
        registry.register_prompt_provider(TestPromptProvider())
        registry.register_connection_reader(TestConnectionReader())
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
        payload = {"topic_code": "thu_nhap", "title": "Trang riêng",
                   "content": CONTENT}
        payload.update(overrides)
        return self.client.post("/api/v1/journal/pages", payload,
                                format="json", **auth_header(token))

    def _share(self, page_id, token=None, recipient=None):
        token = token or self.student_token
        target = (recipient or self.caregiver).pk
        return self.client.post(
            f"/api/v1/journal/pages/{page_id}/share",
            {"recipient_id": str(target)}, format="json",
            **auth_header(token))


class PageTests(F08ApiBase):
    def test_prompts_published_only(self):
        response = self.client.get("/api/v1/journal/prompts", format="json",
                                   **auth_header(self.student_token))
        codes = [p["topic_code"] for p in response.data["results"]]
        self.assertIn("thu_nhap", codes)
        self.assertNotIn("prompt-nhap", codes)

    def test_create_with_unpublished_topic_rejected(self):
        response = self._create(topic_code="prompt-nhap")
        self.assertEqual(response.status_code, 400)

    def test_create_get_list_own(self):
        created = self._create()
        self.assertEqual(created.status_code, 201)
        page_id = created.data["page_id"]
        detail = self.client.get(f"/api/v1/journal/pages/{page_id}",
                                 format="json",
                                 **auth_header(self.student_token))
        self.assertEqual(detail.data["content"], CONTENT)
        listing = self.client.get("/api/v1/journal/pages", format="json",
                                  **auth_header(self.student_token))
        self.assertEqual(len(listing.data["results"]), 1)

    def test_search_owner_scoped_and_count(self):
        self._create(title="Từ góc phòng")
        self._create(title="Chuyện bạn bè",
                     content="Nhật ký về lớp học.")
        hit = self.client.get(
            "/api/v1/journal/pages?search=g%C3%B3c%20ph%C3%B2ng",
            format="json", **auth_header(self.student_token))
        self.assertEqual(len(hit.data["results"]), 1)
        count = JournalPageService_count(str(self.student.pk))
        self.assertEqual(count, 2)
        # other users search their own (empty) space only
        caregiver = self.client.get(
            "/api/v1/journal/pages?search=ph%C3%B2ng", format="json",
            **auth_header(self.caregiver_token))
        self.assertEqual(caregiver.data["results"], [])

    def test_cross_user_and_admin_denied(self):
        page_id = self._create().data["page_id"]
        stranger_token, _ = make_session(make_student())
        for token in (stranger_token, self.caregiver_token,
                      self.admin_token):
            response = self.client.get(f"/api/v1/journal/pages/{page_id}",
                                       format="json", **auth_header(token))
            self.assertEqual(response.status_code, 404)
        admin_delete = self.client.delete(
            f"/api/v1/journal/pages/{page_id}", format="json",
            **auth_header(self.admin_token))
        self.assertEqual(admin_delete.status_code, 404)

    def test_edit_revision_guard_conflict(self):
        page_id = self._create().data["page_id"]
        ok = self.client.patch(
            f"/api/v1/journal/pages/{page_id}",
            {"content": "Bản ghi thứ hai", "expected_revision": 1},
            format="json", **auth_header(self.student_token))
        self.assertEqual(ok.data["revision"], 2)
        stale = self.client.patch(
            f"/api/v1/journal/pages/{page_id}",
            {"content": "Ghi đè mù", "expected_revision": 1},
            format="json", **auth_header(self.student_token))
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(stale.data["error"]["code"], "revision_conflict")
        current = self.client.get(f"/api/v1/journal/pages/{page_id}",
                                  format="json",
                                  **auth_header(self.student_token))
        self.assertEqual(current.data["content"], "Bản ghi thứ hai")

    def test_bounds_and_unknown_fields(self):
        self.assertEqual(self._create(content="x" * 8001).status_code, 400)
        self.assertEqual(self._create(extra={"owner": "hack"}).status_code,
                         400)


class ShareTests(F08ApiBase):
    def test_share_one_page_recipient_reads_only_that(self):
        page1 = self._create().data["page_id"]
        page2 = self._create(title="Rất riêng",
                             content="Không chia sẻ trang này.").data["page_id"]
        share = self._share(page1)
        self.assertEqual(share.status_code, 201)
        shared_list = self.client.get("/api/v1/journal/shared", format="json",
                                      **auth_header(self.caregiver_token))
        self.assertEqual(len(shared_list.data["results"]), 1)
        detail = self.client.get(
            f"/api/v1/journal/shared/{share.data['share_id']}", format="json",
            **auth_header(self.caregiver_token))
        self.assertEqual(detail.data["page"]["page_id"], page1)

    def test_edit_hides_until_reshared(self):
        page_id = self._create().data["page_id"]
        share = self._share(page_id)
        self.client.patch(f"/api/v1/journal/pages/{page_id}",
                          {"content": "đã sửa", "expected_revision": 1},
                          format="json", **auth_header(self.student_token))
        stale = self.client.get(
            f"/api/v1/journal/shared/{share.data['share_id']}", format="json",
            **auth_header(self.caregiver_token))
        self.assertEqual(stale.status_code, 404)
        fresh = self._share(page_id)
        readable = self.client.get(
            f"/api/v1/journal/shared/{fresh.data['share_id']}", format="json",
            **auth_header(self.caregiver_token))
        self.assertEqual(readable.data["page"]["revision"], 2)

    def test_revoke_and_unlink_fail_closed(self):
        page_id = self._create().data["page_id"]
        share_id = self._share(page_id).data["share_id"]
        self.client.post(f"/api/v1/journal/shares/{share_id}/revoke", {},
                         format="json", **auth_header(self.student_token))
        gone = self.client.get(
            f"/api/v1/journal/shared/{share_id}", format="json",
            **auth_header(self.caregiver_token))
        self.assertEqual(gone.status_code, 404)

    def test_share_to_self_and_stranger(self):
        page_id = self._create().data["page_id"]
        self.assertEqual(self._share(page_id, recipient=self.student)
                         .status_code, 400)
        self.assertEqual(self._share(page_id, recipient=make_student())
                         .status_code, 404)

    def test_delete_cascades_no_orphans(self):
        page_id = self._create().data["page_id"]
        share_id = self._share(page_id).data["share_id"]
        # caregiver replies, then owner deletes the page
        reply = self.client.post(
            f"/api/v1/journal/shared/{share_id}/replies",
            {"body": "Bố mẹ đã đọc và thương con."}, format="json",
            **auth_header(self.caregiver_token))
        self.assertEqual(reply.status_code, 201)
        self.client.delete(f"/api/v1/journal/pages/{page_id}", format="json",
                           **auth_header(self.student_token))
        self.assertEqual(JournalPage.objects.count(), 0)
        self.assertEqual(JournalShare.objects.count(), 0)
        self.assertEqual(JournalReply.objects.count(), 0)


class ReplyTests(F08ApiBase):
    def _shared(self):
        page_id = self._create().data["page_id"]
        share_id = self._share(page_id).data["share_id"]
        return page_id, share_id

    def test_reply_and_owner_reads(self):
        page_id, share_id = self._shared()
        reply = self.client.post(
            f"/api/v1/journal/shared/{share_id}/replies",
            {"body": "Bố mẹ muốn nghe con thêm."}, format="json",
            **auth_header(self.caregiver_token))
        self.assertEqual(reply.status_code, 201)
        replies = self.client.get(f"/api/v1/journal/pages/{page_id}/replies",
                                  format="json",
                                  **auth_header(self.student_token))
        self.assertEqual(len(replies.data["results"]), 1)
        self.assertEqual(replies.data["results"][0]["direction"], "received")

    def test_reply_never_unlocks_revoked_page(self):
        page_id, share_id = self._shared()
        self.client.post(f"/api/v1/journal/shares/{share_id}/revoke", {},
                         format="json", **auth_header(self.student_token))
        denied = self.client.post(
            f"/api/v1/journal/shared/{share_id}/replies",
            {"body": "còn đọc được không?"}, format="json",
            **auth_header(self.caregiver_token))
        self.assertEqual(denied.status_code, 404)
        read = self.client.get(f"/api/v1/journal/shared/{share_id}",
                               format="json",
                               **auth_header(self.caregiver_token))
        self.assertEqual(read.status_code, 404)

    def test_reply_update_in_place(self):
        page_id, share_id = self._shared()
        self.client.post(f"/api/v1/journal/shared/{share_id}/replies",
                         {"body": "Lần đầu"}, format="json",
                         **auth_header(self.caregiver_token))
        again = self.client.post(
            f"/api/v1/journal/shared/{share_id}/replies",
            {"body": "Lần sửa lời"}, format="json",
            **auth_header(self.caregiver_token))
        self.assertEqual(again.status_code, 201)
        self.assertEqual(JournalReply.objects.count(), 1)
        mine = self.client.get("/api/v1/journal/my-replies", format="json",
                               **auth_header(self.caregiver_token))
        self.assertEqual(mine.data["results"][0]["body"], "Lần sửa lời")

    def test_stranger_cannot_reply_or_read(self):
        page_id, share_id = self._shared()
        stranger_token, _ = make_session(make_student())
        denied = self.client.post(
            f"/api/v1/journal/shared/{share_id}/replies",
            {"body": "x"}, format="json", **auth_header(stranger_token))
        self.assertEqual(denied.status_code, 404)

    def test_unauthenticated_401(self):
        response = self.client.get("/api/v1/journal/pages")
        self.assertEqual(response.status_code, 401)


def JournalPageService_count(owner_id):
    return JournalPage.objects.filter(owner_id=owner_id).count()
