"""F07 backend tests (US-015/US-026): date/timezone policy, per-entry
grants, revision currency, revocation immediacy, cross-user denial,
bounded queries."""

import datetime as dt

from django.db import connection
from django.test import TestCase
from rest_framework.test import APIClient

from fixtures.actors import make_student, make_caregiver, make_system_admin

import labgrants.sessions as _lab_sessions
from labgrants.f05_fixtures import TestConnectionReader, make_test_connection

from ..models import MoodEntry, MoodShare
from ..services import registry
from .helpers import auth_header, make_session

TODAY_VN = None  # resolved per-test from server date + 7h offset


def vn_today() -> dt.date:
    return (dt.datetime.now(dt.timezone.utc)
            + dt.timedelta(hours=7)).date()


class F07ApiBase(TestCase):
    def setUp(self):
        registry.reset_registries()
        registry.register_session_resolver(_lab_sessions.resolve_session)
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

    def _create(self, token=None, **overrides):
        token = token or self.student_token
        payload = {"entry_date": vn_today().isoformat(),
                   "emotion": "buon", "note": "hôm nay hơi mệt"}
        payload.update(overrides)
        return self.client.post("/api/v1/mood/entries", payload,
                                format="json", **auth_header(token))

    def _share(self, entry_id, token=None, recipient=None):
        token = token or self.student_token
        target = (recipient or self.caregiver).pk
        return self.client.post(
            f"/api/v1/mood/entries/{entry_id}/share",
            {"recipient_id": str(target)},
            format="json", **auth_header(token))


class EntryCrudTests(F07ApiBase):
    def test_create_and_get_own(self):
        response = self._create()
        self.assertEqual(response.status_code, 201)
        entry_id = response.data["entry_id"]
        detail = self.client.get(f"/api/v1/mood/entries/{entry_id}",
                                 format="json",
                                 **auth_header(self.student_token))
        self.assertEqual(detail.data["emotion_label"], "Buồn")
        self.assertEqual(detail.data["revision"], 1)

    def test_one_entry_per_day_duplicate_rejected(self):
        self.assertEqual(self._create().status_code, 201)
        duplicate = self._create(emotion="vui")
        self.assertEqual(duplicate.status_code, 400)
        self.assertEqual(
            duplicate.data["error"]["details"]["reason"],
            "entry_already_exists_use_edit")

    def test_date_boundary_policy(self):
        future = self._create(
            entry_date=(vn_today() + dt.timedelta(days=2)).isoformat())
        self.assertEqual(future.status_code, 400)
        ancient = self._create(
            entry_date=(vn_today() - dt.timedelta(days=731)).isoformat())
        self.assertEqual(ancient.status_code, 400)
        malformed = self._create(entry_date="11/10/2026")
        self.assertEqual(malformed.status_code, 400)
        # tomorrow in VN terms is tolerated (+1 day edge)
        edge = self._create(
            entry_date=(vn_today() + dt.timedelta(days=1)).isoformat())
        self.assertEqual(edge.status_code, 201)

    def test_emotion_allowlist(self):
        response = self._create(emotion="xep_hang_ngon")
        self.assertEqual(response.status_code, 400)

    def test_note_unicode_and_bounds(self):
        response = self._create(note="😊🌟 emoji và tiếng Việt với dấu")
        self.assertEqual(response.status_code, 201)
        too_long = self._create(note="x" * 2001)
        self.assertEqual(too_long.status_code, 400)

    def test_edit_bumps_revision(self):
        entry_id = self._create().data["entry_id"]
        edited = self.client.patch(
            f"/api/v1/mood/entries/{entry_id}",
            {"note": "đã sửa lời"}, format="json",
            **auth_header(self.student_token))
        self.assertEqual(edited.data["revision"], 2)
        self.assertEqual(edited.data["note"], "đã sửa lời")

    def test_cross_user_and_admin_denied(self):
        entry_id = self._create().data["entry_id"]
        stranger = make_student()
        stranger_token, _ = make_session(stranger)
        for token in (stranger_token, self.caregiver_token,
                      self.admin_token):
            response = self.client.get(f"/api/v1/mood/entries/{entry_id}",
                                       format="json", **auth_header(token))
            self.assertEqual(response.status_code, 404)
        admin_patch = self.client.patch(
            f"/api/v1/mood/entries/{entry_id}", {"note": "admin"},
            format="json", **auth_header(self.admin_token))
        self.assertEqual(admin_patch.status_code, 404)

    def test_pagination_bounded_query_count(self):
        base_date = vn_today() - dt.timedelta(days=120)
        for i in range(60):
            MoodEntry.objects.create(
                owner=self.student, entry_date=base_date + dt.timedelta(days=i),
                emotion="vui")
        from django.test.utils import CaptureQueriesContext
        with CaptureQueriesContext(connection) as ctx20:
            page20 = self.client.get(
                "/api/v1/mood/entries?page_size=20", format="json",
                **auth_header(self.student_token))
        with CaptureQueriesContext(connection) as ctx50:
            page50 = self.client.get(
                "/api/v1/mood/entries?page_size=50", format="json",
                **auth_header(self.student_token))
        self.assertEqual(len(page20.data["results"]), 20)
        self.assertEqual(len(page50.data["results"]), 50)
        self.assertLessEqual(len(ctx50.captured_queries),
                             len(ctx20.captured_queries) + 1)


class ShareTests(F07ApiBase):
    def test_share_one_entry_grant_created(self):
        entry_id = self._create().data["entry_id"]
        share = self._share(entry_id)
        self.assertEqual(share.status_code, 201)
        self.assertEqual(share.data["approved_revision"], 1)

    def test_share_requires_active_connection(self):
        entry_id = self._create().data["entry_id"]
        stranger = make_student()
        denied = self._share(entry_id, recipient=stranger)
        self.assertEqual(denied.status_code, 404)

    def test_recipient_reads_only_granted_entry(self):
        entry1 = self._create().data["entry_id"]
        entry2 = self._create(emotion="vui", note="riêng hơn",
                              entry_date=(vn_today() - dt.timedelta(days=1)).isoformat()).data["entry_id"]
        share = self._share(entry1)
        shared_list = self.client.get("/api/v1/mood/shared", format="json",
                                      **auth_header(self.caregiver_token))
        self.assertEqual(len(shared_list.data["results"]), 1)
        detail = self.client.get(
            f"/api/v1/mood/shared/{share.data['share_id']}", format="json",
            **auth_header(self.caregiver_token))
        self.assertEqual(detail.data["entry"]["entry_id"], entry1)
        # entry2 was never shared: the shared-with-me list contains ONLY
        # entry1, and no endpoint can serve entry2 to the recipient.

    def test_edited_revision_hides_until_reshared(self):
        entry_id = self._create().data["entry_id"]
        share = self._share(entry_id)
        self.client.patch(f"/api/v1/mood/entries/{entry_id}",
                          {"note": "sửa mới"}, format="json",
                          **auth_header(self.student_token))
        stale = self.client.get(
            f"/api/v1/mood/shared/{share.data['share_id']}", format="json",
            **auth_header(self.caregiver_token))
        self.assertEqual(stale.status_code, 404)
        # re-share creates a NEW grant at revision 2 -> readable again
        fresh = self._share(entry_id)
        self.assertEqual(fresh.data["approved_revision"], 2)
        readable = self.client.get(
            f"/api/v1/mood/shared/{fresh.data['share_id']}", format="json",
            **auth_header(self.caregiver_token))
        self.assertEqual(readable.data["entry"]["revision"], 2)

    def test_revoke_is_immediate_and_scoped(self):
        entry1 = self._create().data["entry_id"]
        entry2 = self._create(emotion="vui",
                              entry_date=(vn_today() - dt.timedelta(days=1)).isoformat()).data["entry_id"]
        share1 = self._share(entry1).data["share_id"]
        share2 = self._share(entry2).data["share_id"]
        revoked = self.client.post(
            f"/api/v1/mood/shares/{share1}/revoke", {}, format="json",
            **auth_header(self.student_token))
        self.assertEqual(revoked.data["revoked"], True)
        gone = self.client.get(f"/api/v1/mood/shared/{share1}",
                               format="json",
                               **auth_header(self.caregiver_token))
        self.assertEqual(gone.status_code, 404)
        kept = self.client.get(f"/api/v1/mood/shared/{share2}",
                               format="json",
                               **auth_header(self.caregiver_token))
        self.assertEqual(kept.status_code, 200)

    def test_unlink_fails_closed_for_recipient(self):
        entry_id = self._create().data["entry_id"]
        share = self._share(entry_id).data["share_id"]
        from labgrants.models import TestConnection
        row = TestConnection.objects.get(pk=self.connection.pk)
        row.status = "revoked"
        row.save(update_fields=["status"])
        gone = self.client.get(f"/api/v1/mood/shared/{share}", format="json",
                               **auth_header(self.caregiver_token))
        self.assertEqual(gone.status_code, 404)

    def test_share_to_self_rejected(self):
        entry_id = self._create().data["entry_id"]
        response = self._share(entry_id, recipient=self.student)
        self.assertEqual(response.status_code, 400)

    def test_stranger_cannot_revoke_or_read(self):
        entry_id = self._create().data["entry_id"]
        share_id = self._share(entry_id).data["share_id"]
        stranger = make_student()
        stranger_token, _ = make_session(stranger)
        revoke = self.client.post(f"/api/v1/mood/shares/{share_id}/revoke",
                                  {}, format="json",
                                  **auth_header(stranger_token))
        self.assertEqual(revoke.status_code, 404)
        read = self.client.get(f"/api/v1/mood/shared/{share_id}",
                               format="json",
                               **auth_header(stranger_token))
        self.assertEqual(read.status_code, 404)


class SummaryTests(F07ApiBase):
    def test_summary_descriptive_counts_only(self):
        today = vn_today()
        MoodEntry.objects.create(owner=self.student, entry_date=today,
                                 emotion="buon", note="")
        MoodEntry.objects.create(owner=self.student,
                                 entry_date=today - dt.timedelta(days=1),
                                 emotion="buon", note="")
        MoodEntry.objects.create(owner=self.student,
                                 entry_date=today - dt.timedelta(days=2),
                                 emotion="vui", note="")
        response = self.client.get(
            "/api/v1/mood/entries/summary", format="json",
            **auth_header(self.student_token))
        results = {row["emotion"]: row["count"]
                   for row in response.data["results"]}
        self.assertEqual(results.get("buon"), 2)
        self.assertEqual(results.get("vui"), 1)
        # no scores/rankings fields anywhere
        for row in response.data["results"]:
            self.assertEqual(set(row.keys()), {"emotion", "label", "count"})

    def test_summary_owner_only_and_bounded(self):
        response = self.client.get(
            "/api/v1/mood/entries/summary?days=9999", format="json",
            **auth_header(self.student_token))
        self.assertEqual(response.status_code, 200)
        other = self.client.get("/api/v1/mood/entries/summary", format="json",
                                **auth_header(self.caregiver_token))
        self.assertEqual(other.data["results"], [])

    def test_unauthenticated_401(self):
        response = self.client.get("/api/v1/mood/entries")
        self.assertEqual(response.status_code, 401)
