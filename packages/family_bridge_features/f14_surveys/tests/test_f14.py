"""F14 backend tests (US-040/US-045): consent separation, typed response
validation, raw denial, k-suppression + complementary suppression, policy
gate, withdrawal effectiveness."""

from django.test import TestCase
from rest_framework.test import APIClient

from fixtures.actors import make_student, make_caregiver, make_system_admin

import labgrants.sessions as _lab_sessions
from labgrants.f14_fixtures import SyntheticPolicy, TestFormProvider

from ..models import ResearchConsent, SurveyResponse
from ..services import registry
from .helpers import auth_header, make_session

ANSWERS = {"mood_scale": 3, "share_comfort": "dễ", "hours_sleep": 7}


class F14ApiBase(TestCase):
    def setUp(self):
        registry.reset_registries()
        registry.register_session_resolver(_lab_sessions.resolve_session)
        self.provider = TestFormProvider()
        registry.register_form_provider(self.provider)
        self.client = APIClient()
        self.student = make_student()
        self.caregiver = make_caregiver()
        self.admin = make_system_admin()
        self.student_token, _ = make_session(self.student)
        self.caregiver_token, _ = make_session(self.caregiver)
        self.admin_token, _ = make_session(self.admin)

    def _consent(self, token=None, decision="grant"):
        token = token or self.student_token
        return self.client.post(
            "/api/v1/surveys/consent",
            {"purpose": "pre_post_study", "decision": decision},
            format="json", **auth_header(token))

    def _submit(self, token=None, **overrides):
        token = token or self.student_token
        payload = {"form_key": "wellbeing-pre", "form_revision": 1,
                   "phase": "pre", "answers": dict(ANSWERS)}
        payload.update(overrides)
        return self.client.post("/api/v1/surveys/responses", payload,
                                format="json", **auth_header(token))


class ConsentTests(F14ApiBase):
    def test_consent_explicit_not_automatic(self):
        status = self.client.get("/api/v1/surveys/consent", format="json",
                                 **auth_header(self.student_token))
        self.assertEqual(status.data["consents"], [])

    def test_grant_and_withdraw(self):
        granted = self._consent()
        self.assertEqual(granted.data["status"], "granted")
        withdrawn = self._consent(decision="withdraw")
        self.assertEqual(withdrawn.data["status"], "withdrawn")
        self.assertIsNotNone(withdrawn.data["withdrawn_at"])

    def test_invalid_purpose_decision(self):
        self.assertEqual(
            self._consent(decision="maybe").status_code, 400)


class ResponseTests(F14ApiBase):
    def test_submit_requires_active_consent(self):
        response = self._submit()
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["error"]["code"], "consent_required")

    def test_submit_ok_then_resubmission_rejected(self):
        self._consent()
        first = self._submit()
        self.assertEqual(first.status_code, 201)
        again = self._submit()
        self.assertEqual(again.status_code, 400)
        self.assertEqual(again.data["error"]["details"]["reason"],
                         "already_submitted")

    def test_unpublished_or_wrong_revision(self):
        self._consent()
        self.assertEqual(
            self._submit(form_key="draft-form").status_code, 404)
        self.assertEqual(
            self._submit(form_revision=9).status_code, 404)

    def test_phase_validation(self):
        self._consent()
        self.assertEqual(self._submit(phase="mid").status_code, 400)

    def test_answer_type_and_range_validation(self):
        self._consent()
        self.assertEqual(
            self._submit(answers={"mood_scale": 9,
                                  "share_comfort": "dễ"}).status_code, 400)
        self.assertEqual(
            self._submit(answers={"mood_scale": 3,
                                  "share_comfort": "không có"}).status_code,
            400)
        self.assertEqual(
            self._submit(answers={"mood_scale": 3, "share_comfort": "dễ",
                                  "extra_q": 1}).status_code, 400)

    def test_text_question_kind_never_published(self):
        # A provider form with a text question is rejected at the door:
        # no free-text answers without an approved protocol.
        forms = self.client.get("/api/v1/surveys/forms", format="json",
                                **auth_header(self.student_token))
        keys = [f["form_key"] for f in forms.data["results"]]
        self.assertNotIn("text-form", keys)
        self.assertIn("wellbeing-pre", keys)

    def test_withdrawn_consent_blocks_submission(self):
        self._consent()
        self._consent(decision="withdraw")
        response = self._submit()
        self.assertEqual(response.status_code, 403)

    def test_unauthenticated_401(self):
        response = self.client.get("/api/v1/surveys/forms")
        self.assertEqual(response.status_code, 401)


class ReportTests(F14ApiBase):
    def _seed(self, count, *, consent=True):
        for _ in range(count):
            user = make_student()
            if consent:
                ResearchConsent.objects.create(
                    participant=user, purpose="pre_post_study",
                    status="granted")
            SurveyResponse.objects.create(
                participant=user, form_key="wellbeing-pre", form_revision=1,
                phase="pre",
                answers={"mood_scale": 3, "share_comfort": "dễ"})

    def test_policy_unset_403(self):
        self.assertEqual(
            self.client.get(
                "/api/v1/surveys/report/wellbeing-pre?revision=1",
                format="json", **auth_header(self.student_token)).status_code,
            403)

    def test_aggregate_with_suppression_small_group(self):
        registry.register_policy_reader(SyntheticPolicy(minimum_group_size=5))
        self._seed(3)  # smaller than k=5
        response = self.client.get(
            "/api/v1/surveys/report/wellbeing-pre?revision=1&phase=pre",
            format="json", **auth_header(self.student_token))
        report = response.data
        self.assertEqual(report["minimum_group_size"], 5)
        # complementary suppression: the only group is suppressed entirely
        self.assertTrue(report["by_phase"]["pre"]["suppressed"])
        self.assertNotIn("questions", report["by_phase"]["pre"])

    def test_aggregate_publishes_when_group_large_enough(self):
        registry.register_policy_reader(SyntheticPolicy(minimum_group_size=3))
        self._seed(4)
        response = self.client.get(
            "/api/v1/surveys/report/wellbeing-pre?revision=1&phase=pre",
            format="json", **auth_header(self.student_token))
        pre = response.data["by_phase"]["pre"]
        self.assertFalse(pre["suppressed"])
        self.assertEqual(pre["count"], 4)
        self.assertEqual(pre["questions"][0]["mean"], 3.0)
        # NO raw answers / participant ids anywhere in the payload
        self.assertNotIn("answers", response.data)
        self.assertNotIn("participant", response.data)

    def test_withdrawal_takes_effect_immediately(self):
        registry.register_policy_reader(SyntheticPolicy(minimum_group_size=2))
        self._seed(3)
        # one participant withdraws -> only 2 remain (still >= k=2)
        withdrawn_user = SurveyResponse.objects.first().participant
        ResearchConsent.objects.filter(participant=withdrawn_user).update(
            status="withdrawn")
        response = self.client.get(
            "/api/v1/surveys/report/wellbeing-pre?revision=1&phase=pre",
            format="json", **auth_header(self.student_token))
        self.assertEqual(response.data["by_phase"]["pre"]["count"], 2)
        # now only 1 remains -> below k -> suppressed
        second = (SurveyResponse.objects.exclude(
            participant=withdrawn_user).first().participant)
        ResearchConsent.objects.filter(participant=second).update(
            status="withdrawn")
        response2 = self.client.get(
            "/api/v1/surveys/report/wellbeing-pre?revision=1&phase=pre",
            format="json", **auth_header(self.student_token))
        self.assertTrue(response2.data["by_phase"]["pre"]["suppressed"])

    def test_no_raw_export_endpoints(self):
        from ..urls import urlpatterns
        paths = [str(p.pattern) for p in urlpatterns]
        self.assertFalse(any("export" in p or "raw" in p for p in paths))

    def test_admin_has_no_bypass(self):
        # Same aggregate endpoint for everyone; no admin-only raw view.
        registry.register_policy_reader(SyntheticPolicy(minimum_group_size=5))
        self._seed(2)
        admin_view = self.client.get(
            "/api/v1/surveys/report/wellbeing-pre?revision=1&phase=pre",
            format="json", **auth_header(self.admin_token))
        user_view = self.client.get(
            "/api/v1/surveys/report/wellbeing-pre?revision=1&phase=pre",
            format="json", **auth_header(self.student_token))
        self.assertEqual(admin_view.data, user_view.data)
        self.assertTrue(admin_view.data["by_phase"]["pre"]["suppressed"])
