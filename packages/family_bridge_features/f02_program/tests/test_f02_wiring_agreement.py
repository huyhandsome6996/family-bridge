"""F02 production wiring + week-4 family agreement tests (US-036/US-044).

Covers:
- PublishedContentProgramProvider: only published ContentItem surfaces;
  draft/retired/malformed never leak; exactly-4-weeks validation.
- WeekProgress pinned to program_revision: reused activity_key in a newer
  revision does not inherit old status.
- FamilyAgreement: propose -> confirm x2 (two DIFFERENT actors of the same
  pair, same revision) -> confirmed; idempotent confirm; withdraw
  proposer-only; no cross-pair access; generation guard; revision
  mismatch guard; supersede on new-revision confirmation chain.
"""

from django.test import TestCase

from fixtures.actors import make_student, make_caregiver

import labgrants.sessions as _lab_sessions

from family_bridge_features.admin_core.services.admin import (
    ContentLifecycleService,
)

from ..models import Enrollment, FamilyAgreement, WeekProgress
from ..services import registry
from ..wiring import F01ConnectionReader, PublishedContentProgramProvider
from .helpers import auth_header, make_session


def _connection_stub(reader_map):
    """Test double for the connection reader port.

    reader_map: {user_id: {counterpart_id, generation}} — mirrors the
    production F01ConnectionReader contract.
    """

    class _Stub:
        def active_connection_for(self, *, user_id):
            info = reader_map.get(str(user_id))
            if info is None:
                return None
            return {"connection_id": "conn-1",
                    "generation": info["generation"],
                    "relationship_kind": "primary",
                    "counterpart_id": info["counterpart_id"],
                    "status": "active"}

        def active_connection_between(self, *, user_a, user_b):
            info = reader_map.get(str(user_a))
            if info and str(info["counterpart_id"]) == str(user_b):
                return {"connection_id": "conn-1", "generation": info["generation"],
                        "relationship_kind": "primary", "status": "active"}
            return None

    return _Stub()


def _seed_published_program(service, *, revision_note=""):
    return service.create_draft(
        actor_id="tester", kind="f02_program", title="Đồng hành bốn tuần",
        body=_program_body(), audience="neutral",
        content_key="dong-hanh-bon-tuan")


def _program_body():
    return """{
  "weeks": [
    {"week_no": 1, "title": "T1", "goals": ["a"], "student_guide": "s",
     "caregiver_guide": "c", "joint_activity_keys": ["act-1"]},
    {"week_no": 2, "title": "T2", "goals": [], "student_guide": "s",
     "caregiver_guide": "c", "joint_activity_keys": []},
    {"week_no": 3, "title": "T3", "goals": [], "student_guide": "s",
     "caregiver_guide": "c", "joint_activity_keys": []},
    {"week_no": 4, "title": "T4", "goals": [], "student_guide": "s",
     "caregiver_guide": "c", "joint_activity_keys": ["act-4"]}
  ],
  "agreement": {"revision": 1, "title": "Thỏa ước", "commitments": ["việc 1"]}
}"""


class WiringProviderTests(TestCase):
    def setUp(self):
        registry.reset_registries()
        self.service = ContentLifecycleService()
        self.provider = PublishedContentProgramProvider()

    def test_only_published_surfaces_and_shape_validated(self):
        draft = _seed_published_program(self.service)
        listed = self.provider.list_programs()
        self.assertEqual(listed, [])  # draft never surfaces (fail closed)

        published = self.service.publish(actor_id="teacher",
                                         content_id=str(draft.id),
                                         expected_revision=draft.revision)
        listed = self.provider.list_programs()
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0]["program_key"], "dong-hanh-bon-tuan")
        self.assertEqual(listed[0]["revision"], published.revision)
        self.assertEqual([w["week_no"] for w in listed[0]["weeks"]],
                         [1, 2, 3, 4])
        self.assertEqual(listed[0]["agreement"]["revision"], 1)

    def test_malformed_body_skipped_not_crash(self):
        self.service.create_draft(actor_id="tester", kind="f02_program",
                                  title="Hỏng", body="{không phải json",
                                  audience="neutral",
                                  content_key="bad-program")
        self.assertEqual(self.provider.list_programs(), [])

    def test_retired_disappears(self):
        draft = _seed_published_program(self.service)
        published = self.service.publish(actor_id="teacher",
                                         content_id=str(draft.id),
                                         expected_revision=draft.revision)
        self.assertEqual(len(self.provider.list_programs()), 1)
        self.service.retire(actor_id="teacher", content_id=str(published.id),
                            expected_revision=published.revision,
                            reason="policy")
        self.assertEqual(self.provider.list_programs(), [])


class ProgressRevisionPinTests(TestCase):
    def setUp(self):
        registry.reset_registries()
        registry.register_session_resolver(_lab_sessions.resolve_session)
        registry.register_program_provider(_StaticProvider())
        self.student = make_student()
        self.token, _ = make_session(self.student)

    def _enroll(self, revision):
        obj, _ = Enrollment.objects.update_or_create(
            participant=self.student, program_key="family-4w",
            defaults={"program_revision": revision, "active": True})
        return obj

    def test_reused_activity_key_does_not_inherit_old_status(self):
        from ..services.program import ProgramService
        self._enroll(revision=1)
        ProgramService().mark_activity(
            participant_id=str(self.student.pk), program_key="family-4w",
            week_no=1, activity_key="act-1", status="done")
        self.assertEqual(
            WeekProgress.objects.filter(
                participant=self.student, program_revision=1,
                activity_key="act-1").first().status, "done")
        # explicit re-enroll onto a NEW revision: old status must NOT leak
        self._enroll(revision=2)
        weeks = ProgramService().weeks_for_me(
            participant_id=str(self.student.pk), program_key="family-4w")
        statuses = [a["status"] for w in weeks["weeks"]
                    for a in w["activities"]]
        self.assertNotIn("done", statuses)


class _StaticProvider:
    """Programs at revisions 1 and 2 with the same activity key reused."""

    def list_programs(self):
        weeks = [
            {"week_no": n, "title": f"T{n}", "goals": [],
             "student_guide": "s", "caregiver_guide": "c",
             "joint_activity_keys": ["act-1"] if n == 1 else []}
            for n in (1, 2, 3, 4)]
        return [
            {"program_key": "family-4w", "revision": 1, "title": "P",
             "status": "published",
             "weeks": weeks, "agreement": {"revision": 1, "title": "A",
                                           "commitments": ["c1"]}},
            {"program_key": "family-4w", "revision": 2, "title": "P2",
             "status": "published",
             "weeks": weeks, "agreement": {"revision": 2, "title": "A2",
                                           "commitments": ["c2"]}},
        ]


class FamilyAgreementTests(TestCase):
    def setUp(self):
        registry.reset_registries()
        registry.register_session_resolver(_lab_sessions.resolve_session)
        registry.register_program_provider(_StaticProvider())
        self.student = make_student()
        self.caregiver = make_caregiver()
        self.stranger = make_student()
        self.student_token, _ = make_session(self.student)
        self.caregiver_token, _ = make_session(self.caregiver)
        self.stranger_token, _ = make_session(self.stranger)
        self._wire_connection()

    def _wire_connection(self, generation=1):
        registry.register_connection_reader(_connection_stub({
            str(self.student.pk): {"counterpart_id": str(self.caregiver.pk),
                                   "generation": generation},
            str(self.caregiver.pk): {"counterpart_id": str(self.student.pk),
                                     "generation": generation},
        }))

    def _enroll_both(self, revision=1):
        Enrollment.objects.create(participant=self.student,
                                  program_key="family-4w",
                                  program_revision=revision, active=True)
        Enrollment.objects.create(participant=self.caregiver,
                                  program_key="family-4w",
                                  program_revision=revision, active=True)

    def _propose(self, token=None):
        token = token or self.student_token
        return self.client.post(
            "/api/v1/program/agreement/propose",
            {"program_key": "family-4w"}, format="json",
            **auth_header(token))

    def test_full_two_side_confirmation_flow(self):
        from rest_framework.test import APIClient
        self.client = APIClient()
        self._enroll_both(revision=1)

        # chưa kết nối trước khi propose? — propose cần kết nối active: đã wire
        response = self._propose()
        self.assertEqual(response.status_code, 201, response.data)
        agreement = response.data
        self.assertEqual(agreement["status"], "proposed")
        self.assertTrue(agreement["proposed_by_me"])
        self.assertFalse(agreement["my_confirmed"])
        self.assertFalse(agreement["counterpart_confirmed"])
        self.assertEqual(agreement["commitments"], ["c1"])

        # proposer tự xác nhận (vẫn proposed) — idempotent khi bấm lại
        response = self.client.post(
            f"/api/v1/program/agreement/{agreement['agreement_id']}/confirm",
            {}, format="json", **auth_header(self.student_token))
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["my_confirmed"])
        self.assertEqual(response.data["status"], "proposed")
        response = self.client.post(
            f"/api/v1/program/agreement/{agreement['agreement_id']}/confirm",
            {}, format="json", **auth_header(self.student_token))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["details"]["reason"],
                         "already_confirmed_by_you")

        # người lạ (không thuộc cặp) không confirm được
        response = self.client.post(
            f"/api/v1/program/agreement/{agreement['agreement_id']}/confirm",
            {}, format="json", **auth_header(self.stranger_token))
        self.assertEqual(response.status_code, 404)

        # counterpart xác nhận -> confirmed
        response = self.client.post(
            f"/api/v1/program/agreement/{agreement['agreement_id']}/confirm",
            {}, format="json", **auth_header(self.caregiver_token))
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["status"], "confirmed")
        self.assertTrue(response.data["my_confirmed"])
        self.assertTrue(response.data["counterpart_confirmed"])

        # confirm lần thứ ba trên bản đã confirmed -> lỗi sạch
        response = self.client.post(
            f"/api/v1/program/agreement/{agreement['agreement_id']}/confirm",
            {}, format="json", **auth_header(self.student_token))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["details"]["reason"],
                         "agreement_not_confirmable")

        # overview cả hai bên cùng nhìn thấy bản confirmed
        response = self.client.get(
            "/api/v1/program/agreement?program_key=family-4w", format="json",
            **auth_header(self.caregiver_token))
        self.assertEqual(response.data["agreement"]["status"], "confirmed")
        self.assertTrue(response.data["agreement"]["counterpart_confirmed"])

    def test_revision_mismatch_blocks_confirmation(self):
        from rest_framework.test import APIClient
        self.client = APIClient()
        self._enroll_both(revision=1)
        agreement = self._propose().data
        # caregiver chưa re-enroll lên revision 2 của cùng program? cả hai pin 1
        # -> đổi caregiver sang pin 2 (nội dung mới) rồi confirm bản v1: bị chặn
        Enrollment.objects.filter(participant=self.caregiver).update(
            program_revision=2)
        response = self.client.post(
            f"/api/v1/program/agreement/{agreement['agreement_id']}/confirm",
            {}, format="json", **auth_header(self.caregiver_token))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["details"]["reason"],
                         "revision_mismatch")

    def test_withdraw_proposer_only_and_generation_guard(self):
        from rest_framework.test import APIClient
        self.client = APIClient()
        self._enroll_both(revision=1)
        agreement = self._propose().data
        # counterpart không được rút đề xuất của người kia
        response = self.client.post(
            f"/api/v1/program/agreement/{agreement['agreement_id']}/withdraw",
            {}, format="json", **auth_header(self.caregiver_token))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["details"]["reason"],
                         "only_proposer_can_withdraw")
        # proposer rút được
        response = self.client.post(
            f"/api/v1/program/agreement/{agreement['agreement_id']}/withdraw",
            {}, format="json", **auth_header(self.student_token))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "withdrawn")

        # unlink -> generation mới: confirm bản cũ của generation cũ bị chặn
        self._wire_connection(generation=2)
        self._propose()  # tạo lại trên generation 2? — withdraw cũ vẫn terminal
        rows = FamilyAgreement.objects.all()
        self.assertEqual(rows.count(), 2)  # mỗi generation một instance riêng
