"""F07 regression tests — reproduce handover findings 6.1 (1)-(8) plus the
production wiring gaps, on the CURRENT baseline before any fix.

Each test names the finding it pins. These run on the SQLite harness; the
true concurrent-create race has a MySQL-gated twin (NOT_RUN on SQLite).
"""

import datetime as dt
from unittest import mock

from django.db import IntegrityError
from django.test import TestCase
from rest_framework.test import APIClient

import labgrants.sessions as _lab_sessions
from fixtures.actors import make_student, make_caregiver, make_system_admin
from labgrants.f05_fixtures import TestConnectionReader, make_test_connection

from ..models import MoodEntry, MoodShare
from ..services import registry
from ..services.mood import MoodShareService
from .helpers import auth_header, make_session
from .test_f07 import vn_today


class RegressionBase(TestCase):
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

    def _share(self, entry_id, token=None, recipient=None, extra=None):
        token = token or self.student_token
        target = (recipient or self.caregiver).pk
        payload = {"recipient_id": str(target)}
        if extra:
            payload.update(extra)
        return self.client.post(
            f"/api/v1/mood/entries/{entry_id}/share", payload,
            format="json", **auth_header(token))


class Finding1SharesEndpointWorks(RegressionBase):
    """Finding 6.1-(1): MoodEntrySharesView.get() used get_own(author_id=...),
    a kwarg the service never accepted -> TypeError -> 500 for the OWNER."""

    def test_owner_lists_entry_shares_200(self):
        entry_id = self._create().data["entry_id"]
        share = self._share(entry_id)
        self.assertEqual(share.status_code, 201)
        response = self.client.get(
            f"/api/v1/mood/entries/{entry_id}/shares", format="json",
            **auth_header(self.student_token))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        row = response.data["results"][0]
        self.assertEqual(row["share_id"], share.data["share_id"])
        self.assertEqual(row["recipient_id"], str(self.caregiver.pk))
        self.assertEqual(row["approved_revision"], 1)

    def test_non_owner_entry_shares_404(self):
        entry_id = self._create().data["entry_id"]
        response = self.client.get(
            f"/api/v1/mood/entries/{entry_id}/shares", format="json",
            **auth_header(self.caregiver_token))
        self.assertEqual(response.status_code, 404)


class Finding2ReadSharedFailsClosedWithoutReader(RegressionBase):
    """Finding 6.1-(2): read_shared() skipped the connection check when the
    reader port was missing -> sensitive note served with NO authorization.
    Fail closed: missing provider must NEVER yield content."""

    def test_missing_reader_denies_read(self):
        entry = MoodEntry.objects.create(owner=self.student,
                                         entry_date=vn_today(),
                                         emotion="buon", note="tâm sự riêng")
        share = MoodShare.objects.create(
            entry=entry, owner=self.student, recipient=self.caregiver,
            approved_revision=1, connection_id=str(self.connection.pk),
            connection_generation=1)
        # simulate the dependency being gone (registry reset on a backend
        # that never wired the reader) — keep the session resolver intact
        with mock.patch.object(registry, "get_connection_reader",
                               return_value=None):
            response = self.client.get(
                f"/api/v1/mood/shared/{share.pk}", format="json",
                **auth_header(self.caregiver_token))
        self.assertIn(response.status_code, (404, 503))
        self.assertNotIn("tâm sự riêng", str(response.content))


class Finding3GrantBoundToCurrentConnectionGeneration(RegressionBase):
    """Finding 6.1-(3): read only checked `active_connection_between(...) is
    not None`. Unlink -> reconnect (NEW connection id + generation) revived
    the old grant. The grant must bind the CURRENT connection identity."""

    def test_reconnect_new_generation_blocks_old_grant(self):
        entry_id = self._create().data["entry_id"]
        share_id = self._share(entry_id).data["share_id"]
        # unlink current connection (generation 1)
        from labgrants.models import TestConnection
        row = TestConnection.objects.get(pk=self.connection.pk)
        row.status = "revoked"
        row.save(update_fields=["status"])
        # same two people reconnect -> NEW connection row, generation 2
        make_test_connection(self.student, self.caregiver, generation=2)
        response = self.client.get(
            f"/api/v1/mood/shared/{share_id}", format="json",
            **auth_header(self.caregiver_token))
        self.assertEqual(response.status_code, 404)

    def test_same_generation_connection_still_readable(self):
        entry_id = self._create().data["entry_id"]
        share_id = self._share(entry_id).data["share_id"]
        response = self.client.get(
            f"/api/v1/mood/shared/{share_id}", format="json",
            **auth_header(self.caregiver_token))
        self.assertEqual(response.status_code, 200)


class Finding4ReshareSemantics(RegressionBase):
    """Finding 6.1-(4): share() get_or_create returned a REVOKED row as
    success, and after reconnect kept the DEAD connection binding."""

    def test_reshare_after_revoke_reactivates_grant(self):
        entry_id = self._create().data["entry_id"]
        share_id = self._share(entry_id).data["share_id"]
        revoked = self.client.post(
            f"/api/v1/mood/shares/{share_id}/revoke", {}, format="json",
            **auth_header(self.student_token))
        self.assertEqual(revoked.data["revoked"], True)
        # explicit re-share: owner confirms again -> usable grant, not the
        # revoked row reported as success
        reshare = self._share(entry_id)
        self.assertEqual(reshare.status_code, 201)
        self.assertEqual(reshare.data["share_id"], share_id)
        self.assertEqual(reshare.data["revoked"], False)
        readable = self.client.get(
            f"/api/v1/mood/shared/{share_id}", format="json",
            **auth_header(self.caregiver_token))
        self.assertEqual(readable.status_code, 200)

    def test_reshare_after_reconnect_binds_new_connection(self):
        entry_id = self._create().data["entry_id"]
        share_id = self._share(entry_id).data["share_id"]
        from labgrants.models import TestConnection
        old = TestConnection.objects.get(pk=self.connection.pk)
        old.status = "revoked"
        old.save(update_fields=["status"])
        new_conn = make_test_connection(self.student, self.caregiver,
                                        generation=2)
        reshare = self._share(entry_id)
        self.assertEqual(reshare.status_code, 201)
        stored = MoodShare.objects.get(pk=share_id)
        self.assertEqual(stored.connection_id, str(new_conn.pk))
        self.assertEqual(stored.connection_generation, 2)
        readable = self.client.get(
            f"/api/v1/mood/shared/{share_id}", format="json",
            **auth_header(self.caregiver_token))
        self.assertEqual(readable.status_code, 200)

    def test_revoked_grant_never_auto_revives_on_reconnect(self):
        entry_id = self._create().data["entry_id"]
        share_id = self._share(entry_id).data["share_id"]
        self.client.post(f"/api/v1/mood/shares/{share_id}/revoke", {},
                         format="json", **auth_header(self.student_token))
        from labgrants.models import TestConnection
        old = TestConnection.objects.get(pk=self.connection.pk)
        old.status = "revoked"
        old.save(update_fields=["status"])
        make_test_connection(self.student, self.caregiver, generation=2)
        # NO re-share call: connection becoming active again must NOT revive
        response = self.client.get(
            f"/api/v1/mood/shared/{share_id}", format="json",
            **auth_header(self.caregiver_token))
        self.assertEqual(response.status_code, 404)


class Finding5SharedListBoundedAndFresh(RegressionBase):
    """Finding 6.1-(5): /mood/shared leaked metadata after unlink and was
    unbounded (no pagination)."""

    def test_shared_list_hides_metadata_after_unlink(self):
        entry_id = self._create().data["entry_id"]
        self._share(entry_id)
        from labgrants.models import TestConnection
        row = TestConnection.objects.get(pk=self.connection.pk)
        row.status = "revoked"
        row.save(update_fields=["status"])
        response = self.client.get("/api/v1/mood/shared", format="json",
                                   **auth_header(self.caregiver_token))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"], [])

    def test_shared_list_pagination(self):
        for i in range(3):
            entry_id = self._create(
                entry_date=(vn_today() - dt.timedelta(days=i + 1)).isoformat(),
                emotion="vui").data["entry_id"]
            self._share(entry_id)
        page1 = self.client.get("/api/v1/mood/shared?page_size=2",
                                format="json",
                                **auth_header(self.caregiver_token))
        self.assertEqual(page1.status_code, 200)
        self.assertEqual(len(page1.data["results"]), 2)
        self.assertTrue(page1.data.get("next"))
        page2 = self.client.get(
            f"/api/v1/mood/shared?page_size=2&cursor={page1.data['next']}",
            format="json", **auth_header(self.caregiver_token))
        self.assertEqual(len(page2.data["results"]), 1)
        ids1 = {r["share_id"] for r in page1.data["results"]}
        ids2 = {r["share_id"] for r in page2.data["results"]}
        self.assertFalse(ids1 & ids2)


class Finding6StalePreviewBlocked(RegressionBase):
    """Finding 6.1-(6): share accepted only recipient_id and silently bound
    the CURRENT revision — a v1 preview could confirm a v2 the owner never
    saw. expected_revision pins the confirmed version."""

    def test_share_with_stale_expected_revision_rejected(self):
        entry_id = self._create().data["entry_id"]  # revision 1 previewed
        self.client.patch(f"/api/v1/mood/entries/{entry_id}",
                          {"note": "bản v2 chưa xem trước"}, format="json",
                          **auth_header(self.student_token))
        stale = self._share(entry_id, extra={"expected_revision": 1})
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(
            stale.data["error"]["details"].get("reason"), "stale_revision")
        # v2 must NOT be granted by the stale confirmation
        self.assertFalse(
            MoodShare.objects.filter(entry_id=entry_id).exists())
        # explicit confirmation of the version just previewed (v2) works
        fresh = self._share(entry_id, extra={"expected_revision": 2})
        self.assertEqual(fresh.status_code, 201)
        self.assertEqual(fresh.data["approved_revision"], 2)

    def test_share_expected_revision_must_be_positive_int(self):
        entry_id = self._create().data["entry_id"]
        bad = self._share(entry_id, extra={"expected_revision": "1"})
        self.assertEqual(bad.status_code, 400)


class Finding8CreateRaceBusinessError(RegressionBase):
    """Finding 6.1-(8): .exists() pre-check then insert — the loser of a
    real race hit an uncaught IntegrityError (500). Must be a clean 400."""

    def test_integrity_error_becomes_business_conflict(self):
        original_create = MoodEntry.objects.create

        def racing_create(*args, **kwargs):
            # Simulate the other device committing between .exists() and
            # INSERT: the UNIQUE constraint fires.
            if getattr(racing_create, "armed", False):
                racing_create.armed = False
                raise IntegrityError("UNIQUE constraint failed: "
                                     "f07_mood_moodentry.owner_id, "
                                     "f07_mood_moodentry.entry_date")
            return original_create(*args, **kwargs)

        with mock.patch.object(MoodEntry.objects, "create",
                               side_effect=racing_create):
            racing_create.armed = True
            response = self._create()
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["error"]["details"]["reason"],
            "entry_already_exists_use_edit")

    def test_sequential_duplicate_still_business_error(self):
        self.assertEqual(self._create().status_code, 201)
        duplicate = self._create(emotion="vui")
        self.assertEqual(duplicate.status_code, 400)
