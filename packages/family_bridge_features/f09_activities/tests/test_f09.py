"""F09 backend tests (US-037): published/audience catalog, private
progress, two-sided invite ownership, retirement pinning."""

from django.test import TestCase
from rest_framework.test import APIClient

from fixtures.actors import make_student, make_caregiver

import labgrants.sessions as _lab_sessions
from labgrants.f05_fixtures import TestConnectionReader, make_test_connection
from labgrants.f09_fixtures import TestContentReader

from ..models import ActivityProgress, SharedActivityInvite
from ..services import registry
from .helpers import auth_header, make_session


class F09ApiBase(TestCase):
    def setUp(self):
        registry.reset_registries()
        registry.register_session_resolver(_lab_sessions.resolve_session)
        registry.register_content_reader(TestContentReader())
        registry.register_connection_reader(TestConnectionReader())
        self.client = APIClient()
        self.student = make_student()
        self.caregiver = make_caregiver()
        self.stranger = make_student()
        self.connection = make_test_connection(self.student, self.caregiver)
        self.student_token, _ = make_session(self.student)
        self.caregiver_token, _ = make_session(self.caregiver)
        self.stranger_token, _ = make_session(self.stranger)

    def _progress(self, token=None, **overrides):
        token = token or self.student_token
        payload = {"content_key": "act-chat-5", "content_revision": 1,
                   "status": "done"}
        payload.update(overrides)
        return self.client.post("/api/v1/activities/progress", payload,
                                format="json", **auth_header(token))

    def _invite(self, token=None, **overrides):
        token = token or self.student_token
        payload = {"content_key": "act-meal", "content_revision": 2,
                   "invitee_id": str(self.caregiver.pk)}
        payload.update(overrides)
        return self.client.post("/api/v1/activities/invites", payload,
                                format="json", **auth_header(token))


class CatalogTests(F09ApiBase):
    def test_published_only_and_filters(self):
        response = self.client.get("/api/v1/activities/catalog",
                                   format="json",
                                   **auth_header(self.student_token))
        keys = [row["content_key"] for row in response.data["results"]]
        self.assertIn("act-chat-5", keys)
        self.assertNotIn("act-retired", keys)
        self.assertNotIn("lesson-draft", keys)

    def test_kind_and_audience_filter(self):
        lessons = self.client.get(
            "/api/v1/activities/catalog?kind=micro_lesson", format="json",
            **auth_header(self.student_token))
        for row in lessons.data["results"]:
            self.assertEqual(row["kind"], "micro_lesson")
        student_feed = self.client.get(
            "/api/v1/activities/catalog?audience=student", format="json",
            **auth_header(self.student_token))
        for row in student_feed.data["results"]:
            self.assertIn(row["audience"], ("student", "neutral", "joint"))

    def test_unauthenticated_401(self):
        response = self.client.get("/api/v1/activities/catalog")
        self.assertEqual(response.status_code, 401)


class ProgressTests(F09ApiBase):
    def test_mark_own_progress_private(self):
        response = self._progress()
        self.assertEqual(response.status_code, 201)
        listing = self.client.get("/api/v1/activities/progress",
                                  format="json",
                                  **auth_header(self.student_token))
        self.assertEqual(len(listing.data["results"]), 1)
        stranger = self.client.get("/api/v1/activities/progress",
                                   format="json",
                                   **auth_header(self.stranger_token))
        self.assertEqual(stranger.data["results"], [])

    def test_retired_content_blocked(self):
        response = self._progress(content_key="act-retired",
                                  content_revision=3)
        self.assertEqual(response.status_code, 404)

    def test_invalid_status_and_revision(self):
        self.assertEqual(self._progress(status="super").status_code, 400)
        self.assertEqual(
            self._progress(content_revision=99).status_code, 404)


class InviteTests(F09ApiBase):
    def test_invite_requires_connection(self):
        response = self._invite(invitee_id=self.stranger.pk)
        self.assertEqual(response.status_code, 404)

    def test_two_sided_responses_independent(self):
        invite_id = self._invite().data["invite_id"]
        # inviter CANNOT tick for the invitee
        forged = self.client.post(
            f"/api/v1/activities/invites/{invite_id}/respond",
            {"decision": "accept"}, format="json",
            **auth_header(self.student_token))
        self.assertEqual(forged.status_code, 404)
        accepted = self.client.post(
            f"/api/v1/activities/invites/{invite_id}/respond",
            {"decision": "accept"}, format="json",
            **auth_header(self.caregiver_token))
        self.assertEqual(accepted.data["status"], "accepted")
        # each side records OWN response
        self.client.post(
            f"/api/v1/activities/invites/{invite_id}/my-response",
            {"response_status": "done"}, format="json",
            **auth_header(self.student_token))
        my = self.client.post(
            f"/api/v1/activities/invites/{invite_id}/my-response",
            {"response_status": "skipped"}, format="json",
            **auth_header(self.caregiver_token))
        self.assertEqual(my.data["invitee_response"], "skipped")
        self.assertEqual(my.data["inviter_response"], "done")

    def test_invitee_response_requires_accept(self):
        invite_id = self._invite().data["invite_id"]
        early = self.client.post(
            f"/api/v1/activities/invites/{invite_id}/my-response",
            {"response_status": "done"}, format="json",
            **auth_header(self.caregiver_token))
        self.assertEqual(early.status_code, 400)

    def test_cancel_pending_only(self):
        invite_id = self._invite().data["invite_id"]
        cancelled = self.client.post(
            f"/api/v1/activities/invites/{invite_id}/cancel", {},
            format="json", **auth_header(self.student_token))
        self.assertEqual(cancelled.data["status"], "cancelled")
        late = self.client.post(
            f"/api/v1/activities/invites/{invite_id}/respond",
            {"decision": "accept"}, format="json",
            **auth_header(self.caregiver_token))
        self.assertEqual(late.data["status"], "cancelled")

    def test_retired_content_invite_blocked(self):
        response = self._invite(content_key="act-retired",
                                content_revision=3)
        self.assertEqual(response.status_code, 404)

    def test_stranger_cannot_see_invites(self):
        self._invite()
        stranger = self.client.get("/api/v1/activities/invites",
                                   format="json",
                                   **auth_header(self.stranger_token))
        self.assertEqual(stranger.data["results"], [])

    def test_no_reminder_endpoints(self):
        from ..urls import urlpatterns
        paths = [str(p.pattern) for p in urlpatterns]
        self.assertFalse(any("remind" in p or "schedule" in p
                             for p in paths))

    def test_invite_same_revision_idempotent_different_revision_conflicts(self):
        """R1 regression:
        1. Inviting same content_key and revision returns the invite idempotently.
        2. Inviting same content_key with a DIFFERENT revision raises RevisionConflict (409)
           and does NOT silently return success or overwrite the existing invite.
        """
        class MultiRevContentReader(TestContentReader):
            def list_published(self, *, kind=None, audience=None, limit=50):
                items = super().list_published(kind=kind, audience=audience, limit=limit)
                items.append({
                    "content_key": "act-meal", "kind": "activity", "revision": 3,
                    "title": "Bữa cơm không điện thoại v3", "audience": "joint",
                    "status": "published", "body": "Bữa ăn không điện thoại v3.",
                    "minutes": 30,
                })
                return items

        registry.register_content_reader(MultiRevContentReader())

        # First invite at revision 2 -> created (201)
        res1 = self._invite(content_key="act-meal", content_revision=2)
        self.assertEqual(res1.status_code, 201)
        invite_id = res1.data["invite_id"]

        # Second invite at same revision 2 -> returns existing invite idempotently
        res2 = self._invite(content_key="act-meal", content_revision=2)
        self.assertEqual(res2.status_code, 201)
        self.assertEqual(res2.data["invite_id"], invite_id)

        # Third invite at revision 3 -> fails with 409 revision_conflict
        res3 = self._invite(content_key="act-meal", content_revision=3)
        self.assertEqual(res3.status_code, 409)
        self.assertEqual(res3.data["error"]["code"], "revision_conflict")
        self.assertEqual(res3.data["error"]["details"]["reason"], "pending_invite_revision_mismatch")

        # Verify DB: exactly 1 pending invite, still at revision 2
        invites = SharedActivityInvite.objects.filter(
            content_key="act-meal", inviter_id=self.student.pk,
            invitee_id=self.caregiver.pk, status="pending"
        )
        self.assertEqual(invites.count(), 1)
        self.assertEqual(invites.first().content_revision, 2)

    def test_direct_database_unique_constraint_and_lifecycle(self):
        """Direct DB tests:
        1. Cannot insert two pending invites for same key & pair (violates uniq_f09_open_invite).
        2. Changing status to accepted sets active_marker to NULL, allowing new pending invite.
        3. Multiple accepted/cancelled invites can coexist (NULL active_marker).
        """
        from django.db import IntegrityError
        inv1 = SharedActivityInvite.objects.create(
            content_key="act-meal", content_revision=2,
            inviter=self.student, invitee=self.caregiver,
            status="pending",
        )
        from django.db import transaction
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                SharedActivityInvite.objects.create(
                    content_key="act-meal", content_revision=3,
                    inviter=self.student, invitee=self.caregiver,
                    status="pending",
                )

        # Transition inv1 to accepted -> active_marker becomes NULL
        inv1.status = "accepted"
        inv1.save()

        # Now creating a new pending invite succeeds
        inv2 = SharedActivityInvite.objects.create(
            content_key="act-meal", content_revision=3,
            inviter=self.student, invitee=self.caregiver,
            status="pending",
        )
        self.assertNotEqual(inv1.id, inv2.id)

        # Cancelling inv2 also sets active_marker to NULL
        inv2.status = "cancelled"
        inv2.save()

        # Both past invites coexist
        self.assertEqual(SharedActivityInvite.objects.filter(
            content_key="act-meal", inviter=self.student, invitee=self.caregiver
        ).count(), 2)
