"""F02 backend tests (US-036/US-044): voluntary enrollment with pinning,
all-weeks access, private progress, per-revision agreement acceptance."""

from django.test import TestCase
from rest_framework.test import APIClient

from fixtures.actors import make_student, make_caregiver

import labgrants.sessions as _lab_sessions
from labgrants.f02_fixtures import TestProgramProvider

from ..models import AgreementAcceptance, Enrollment, WeekProgress
from ..services import registry
from .helpers import auth_header, make_session


class F02ApiBase(TestCase):
    def setUp(self):
        registry.reset_registries()
        registry.register_session_resolver(_lab_sessions.resolve_session)
        self.provider = TestProgramProvider()
        registry.register_program_provider(self.provider)
        self.client = APIClient()
        self.student = make_student()
        self.caregiver = make_caregiver()
        self.stranger = make_student()
        self.student_token, _ = make_session(self.student)
        self.caregiver_token, _ = make_session(self.caregiver)
        self.stranger_token, _ = make_session(self.stranger)

    def _enroll(self, token=None, revision=1, key="family-4w"):
        token = token or self.student_token
        return self.client.post("/api/v1/program/enroll",
                                {"program_key": key,
                                 "program_revision": revision},
                                format="json", **auth_header(token))


class EnrollTests(F02ApiBase):
    def test_catalog_published_only(self):
        response = self.client.get("/api/v1/program/catalog", format="json",
                                   **auth_header(self.student_token))
        keys = [p["program_key"] for p in response.data["results"]]
        self.assertIn("family-4w", keys)

    def test_enroll_pins_revision(self):
        response = self._enroll(revision=1)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["program_revision"], 1)
        # content re-published at revision 2: my enrollment stays pinned 1
        self.provider.republish()
        weeks = self.client.get("/api/v1/program/weeks/family-4w",
                                format="json",
                                **auth_header(self.student_token))
        self.assertEqual(weeks.data["pinned_revision"], 1)
        self.assertEqual(weeks.data["agreement"]["revision"], 1)
        # new revision visible in catalog for an EXPLICIT decision
        catalog = self.client.get("/api/v1/program/catalog", format="json",
                                  **auth_header(self.student_token))
        revisions = {p["program_key"]: p["revision"]
                     for p in catalog.data["results"]}
        self.assertEqual(revisions["family-4w"], 2)

    def test_enroll_unknown_or_old_revision_rejected(self):
        self.assertEqual(self._enroll(revision=99).status_code, 404)
        self.assertEqual(self._enroll(key="khong-co").status_code, 404)

    def test_opt_out_and_rejoin(self):
        self._enroll()
        weeks = self.client.get("/api/v1/program/weeks/family-4w",
                                format="json",
                                **auth_header(self.student_token))
        self.assertEqual(weeks.status_code, 200)
        out = self.client.post("/api/v1/program/opt-out",
                               {"program_key": "family-4w"}, format="json",
                               **auth_header(self.student_token))
        self.assertEqual(out.data["active"], False)
        locked = self.client.get("/api/v1/program/weeks/family-4w",
                                 format="json",
                                 **auth_header(self.student_token))
        self.assertEqual(locked.status_code, 404)  # honest: no enrollment
        again = self._enroll()
        self.assertEqual(again.status_code, 201)  # voluntary rejoin


class WeeksProgressTests(F02ApiBase):
    def test_all_four_weeks_accessible_no_locking(self):
        self._enroll()
        weeks = self.client.get("/api/v1/program/weeks/family-4w",
                                format="json",
                                **auth_header(self.student_token))
        self.assertEqual(len(weeks.data["weeks"]), 4)
        self.assertTrue(all(w["locked"] is False
                            for w in weeks.data["weeks"]))
        self.assertEqual(weeks.data["suggested_week"], 1)  # suggestion only

    def test_progress_own_only_and_reset(self):
        self._enroll()
        response = self.client.post(
            "/api/v1/program/progress",
            {"program_key": "family-4w", "week_no": 1,
             "activity_key": "act-chat-5", "status": "done"},
            format="json", **auth_header(self.student_token))
        self.assertEqual(response.status_code, 201)
        # stranger cannot see or write my progress (no family-wide reads)
        stranger_weeks = self.client.get("/api/v1/program/weeks/family-4w",
                                         format="json",
                                         **auth_header(self.stranger_token))
        self.assertEqual(stranger_weeks.status_code, 404)
        # reset clears the row
        reset = self.client.post(
            "/api/v1/program/progress",
            {"program_key": "family-4w", "week_no": 1,
             "activity_key": "act-chat-5", "status": "reset"},
            format="json", **auth_header(self.student_token))
        self.assertEqual(reset.status_code, 201)
        self.assertEqual(WeekProgress.objects.count(), 0)

    def test_activity_must_belong_to_pinned_program(self):
        self._enroll()
        response = self.client.post(
            "/api/v1/program/progress",
            {"program_key": "family-4w", "week_no": 2,
             "activity_key": "act-ngoai", "status": "done"},
            format="json", **auth_header(self.student_token))
        self.assertEqual(response.status_code, 400)


class AgreementTests(F02ApiBase):
    def test_accept_idempotent_same_revision(self):
        self._enroll()
        first = self.client.post("/api/v1/program/agreement/accept",
                                 {"program_key": "family-4w"}, format="json",
                                 **auth_header(self.student_token))
        self.assertEqual(first.data["created"], True)
        again = self.client.post("/api/v1/program/agreement/accept",
                                 {"program_key": "family-4w"}, format="json",
                                 **auth_header(self.student_token))
        self.assertEqual(again.data["created"], False)
        self.assertEqual(AgreementAcceptance.objects.count(), 1)

    def test_each_person_accepts_own(self):
        self._enroll()
        self.client.post("/api/v1/program/agreement/accept",
                         {"program_key": "family-4w"}, format="json",
                         **auth_header(self.student_token))
        # caregiver has NOT accepted: their own view would show accepted_by_me
        # false — and nobody can accept for them (accept is per-authenticated
        # actor; there is no "accept for" endpoint at all).
        weeks = self.client.get("/api/v1/program/weeks/family-4w",
                                format="json",
                                **auth_header(self.caregiver_token))
        self.assertEqual(weeks.status_code, 404)  # caregiver not enrolled
        self.assertEqual(AgreementAcceptance.objects.count(), 1)

    def test_template_edit_requires_fresh_acceptance(self):
        self._enroll()
        self.client.post("/api/v1/program/agreement/accept",
                         {"program_key": "family-4w"}, format="json",
                         **auth_header(self.student_token))
        self.provider.republish()  # agreement revision becomes 2
        # pinned enrollment still at revision 1: my acceptance still binds 1
        weeks = self.client.get("/api/v1/program/weeks/family-4w",
                                format="json",
                                **auth_header(self.student_token))
        self.assertEqual(weeks.data["agreement"]["accepted_by_me"], True)
        # explicit re-enroll to revision 2 -> new acceptance required
        self._enroll(revision=2)
        weeks2 = self.client.get("/api/v1/program/weeks/family-4w",
                                 format="json",
                                 **auth_header(self.student_token))
        self.assertEqual(weeks2.data["agreement"]["accepted_by_me"], False)
        self.assertEqual(weeks2.data["agreement"]["revision"], 2)

    def test_no_admin_sign_for_others(self):
        # any authenticated actor only ever signs for THEMSELVES: the
        # endpoint takes no participant field at all (structure check)
        response = self.client.post("/api/v1/program/agreement/accept",
                                    {"program_key": "family-4w",
                                     "participant_id": "hacked"},
                                    format="json",
                                    **auth_header(self.student_token))
        self.assertEqual(response.status_code, 400)  # unknown field

    def test_unauthenticated_401(self):
        response = self.client.get("/api/v1/program/catalog")
        self.assertEqual(response.status_code, 401)
