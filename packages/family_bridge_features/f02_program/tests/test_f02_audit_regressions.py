"""F02 audit regressions (R1–R4, kiểm thử 2026-10-16) — port assertions từ
probe audit độc lập vào suite repo (không phụ thuộc snapshot máy audit):

R1 — Contract weeks: response dùng `activities:[{activity_key,status}]`;
    UI/adapter không được dựa vào field `joint_activity_keys` trong response.
    Lời mời F09 dùng đúng revision PUBLISHED từ content reader (không
    hardcode 1): revision khác → content_not_published; cùng revision →
    pending hai chiều, invitee-only accept, không duplicate invite.
R2 — Thỏa ước: đề xuất revision mới KHÔNG làm mất bản confirmed đang áp
    dụng; chỉ supersede bản PENDING cũ theo state machine; bản confirmed
    chỉ nhường chỗ khi revision mới đủ HAI xác nhận. Overview phân biệt
    effective (confirmed) và pending. Re-propose revision đã superseded
    dưới một bản confirmed còn hiệu lực bị từ chối.
R3 — Enrollment pin revision cũ vẫn đọc được dù catalog đã tràn cửa sổ
    (exact lookup (program_key, revision) bounded riêng); re-enroll tường
    minh mới đổi pin; retired/invalid vẫn fail-closed.

SQLite synthetic; không thay thế kiểm chứng MySQL/TiDB (NOT_RUN).
"""

from django.test import TestCase

from fixtures.actors import make_student, make_caregiver

import labgrants.sessions as _lab_sessions

from family_bridge_features.admin_core.services.admin import (
    ContentLifecycleService,
)
from family_bridge_features.f09_activities.models import SharedActivityInvite
from family_bridge_features.f09_activities.services import registry as f09_registry
from family_bridge_features.f09_activities.services.activities import (
    ActivityService,
)
from family_bridge_features.admin_core.models import ContentItem
from family_bridge_features.f02_program.models import (
    Enrollment, FamilyAgreement,
)
from family_bridge_features.f02_program.services import registry
from family_bridge_features.f02_program.services.program import ProgramService
from family_bridge_features.f02_program.wiring import (
    PublishedContentProgramProvider,
)
from .test_f02_wiring_agreement import (
    _StaticProvider, _connection_stub, _program_body,
)


def _f09_reader_stub():
    """Content reader với act-1 CHỈ published ở revision 3 — bắt buộc lời
    mời phải dùng đúng revision nguồn thật (không thể hardcode 1)."""

    class _Reader:
        def list_published(self, *, kind=None, audience=None, limit=50):
            return [{
                "content_key": "act-1", "kind": "activity", "revision": 3,
                "title": "Trò chuyện 5 phút", "audience": "joint",
                "status": "published", "body": "nghe nhau 5 phút",
                "minutes": 5,
            }]

    return _Reader()


class _PairTestBase(TestCase):
    """Cặp HS/PH đã kết nối (generation 1) + provider tĩnh rev 1/2."""

    def setUp(self):
        registry.reset_registries()
        registry.register_session_resolver(_lab_sessions.resolve_session)
        registry.register_program_provider(_StaticProvider())
        self.student = make_student()
        self.caregiver = make_caregiver()
        registry.register_connection_reader(_connection_stub({
            str(self.student.pk): {
                "counterpart_id": str(self.caregiver.pk), "generation": 1},
            str(self.caregiver.pk): {
                "counterpart_id": str(self.student.pk), "generation": 1},
        }))
        self.service = ProgramService()

    def tearDown(self):
        registry.reset_registries()

    def _enroll(self, user, revision):
        Enrollment.objects.create(participant=user, program_key="family-4w",
                                  program_revision=revision, active=True)

    def _enroll_both(self, revision):
        self._enroll(self.student, revision)
        self._enroll(self.caregiver, revision)

    def _propose(self, user):
        return self.service.propose_family_agreement(
            participant_id=str(user.pk), program_key="family-4w")

    def _confirm(self, user, agreement_id):
        return self.service.confirm_family_agreement(
            participant_id=str(user.pk), agreement_id=agreement_id)


class R1ContractTests(_PairTestBase):
    def test_weeks_response_uses_activities_contract(self):
        """Response weeks CHỈ mang `activities` — không có field ma
        `joint_activity_keys` trong từng tuần (điều UI cũ đã đọc sai)."""
        self._enroll(self.student, 1)
        payload = self.service.weeks_for_me(
            participant_id=str(self.student.pk), program_key="family-4w")
        week1 = payload["weeks"][0]
        self.assertNotIn("joint_activity_keys", week1)
        self.assertEqual(
            week1["activities"], [{"activity_key": "act-1", "status": "none"}])
        # Progress hiển thị đúng theo status riêng của từng người.
        self.service.mark_activity(
            participant_id=str(self.student.pk), program_key="family-4w",
            week_no=1, activity_key="act-1", status="done")
        payload = self.service.weeks_for_me(
            participant_id=str(self.student.pk), program_key="family-4w")
        self.assertEqual(payload["weeks"][0]["activities"][0]["status"],
                         "done")

    def test_invite_needs_published_revision_and_is_two_sided(self):
        """Lời mời phải dùng revision PUBLISHED thật (act-1 chỉ có rev 3):
        hardcode revision khác → content_not_published; đúng revision →
        pending hai chiều, invitee-only accept, không duplicate invite."""
        f09_registry.reset_registries()
        f09_registry.register_content_reader(_f09_reader_stub())
        f09_registry.register_connection_reader(registry.get_connection_reader())
        try:
            self._enroll_both(1)
            service = ActivityService()
            with self.assertRaises(Exception) as ctx:
                service.invite(inviter_id=str(self.student.pk),
                               invitee_id=str(self.caregiver.pk),
                               content_key="act-1", content_revision=1)
            self.assertIn("content_not_published",
                          str(getattr(ctx.exception, "details", "")))
            invite = service.invite(inviter_id=str(self.student.pk),
                                    invitee_id=str(self.caregiver.pk),
                                    content_key="act-1", content_revision=3)
            self.assertEqual(invite.status, "pending")
            # cùng (key, revision, inviter, invitee) pending → không tạo row mới
            again = service.invite(inviter_id=str(self.student.pk),
                                   invitee_id=str(self.caregiver.pk),
                                   content_key="act-1", content_revision=3)
            self.assertEqual(again.pk, invite.pk)
            self.assertEqual(
                SharedActivityInvite.objects.filter(
                    content_key="act-1").count(), 1)
            # inviter KHÔNG tự accept hộ invitee
            with self.assertRaises(Exception):
                service.respond(invitee_id=str(self.student.pk),
                                invite_id=str(invite.pk), decision="accept")
            # invitee accept hai chiều
            accepted = service.respond(invitee_id=str(self.caregiver.pk),
                                       invite_id=str(invite.pk),
                                       decision="accept")
            self.assertEqual(accepted.status, "accepted")
        finally:
            f09_registry.reset_registries()


class R2AgreementPreservationTests(_PairTestBase):
    def test_confirmed_survives_new_proposal_until_both_confirm(self):
        """Audit probe (port): v1 confirmed → propose v2 chưa ai ký → v1 vẫn
        confirmed (không supersede sớm)."""
        self._enroll_both(1)
        old = self._propose(self.student)
        self._confirm(self.student, old["agreement_id"])
        self._confirm(self.caregiver, old["agreement_id"])
        self.assertEqual(
            FamilyAgreement.objects.get(pk=old["agreement_id"]).status,
            "confirmed")
        Enrollment.objects.filter(participant=self.student).update(
            program_revision=2)
        self._propose(self.student)
        self.assertEqual(
            FamilyAgreement.objects.get(pk=old["agreement_id"]).status,
            "confirmed",
            "bản confirmed phải còn hiệu lực khi bản mới chưa đủ chữ ký")

    def test_withdraw_pending_keeps_confirmed_in_force(self):
        """Rút đề xuất v2 thì v1 vẫn confirmed; mixed revisions (v2 chỉ một
        người ký) không làm mất v1."""
        self._enroll_both(1)
        old = self._propose(self.student)
        self._confirm(self.student, old["agreement_id"])
        self._confirm(self.caregiver, old["agreement_id"])
        Enrollment.objects.filter(participant=self.student).update(
            program_revision=2)
        new = self._propose(self.student)
        # HS (proposer) ký trước; PH vẫn pin rev 1 → confirm v2 bị chặn đúng
        # revision_mismatch, không tự đổi enrollment hộ ai.
        with self.assertRaises(Exception) as ctx:
            self._confirm(self.caregiver, new["agreement_id"])
        self.assertIn("revision_mismatch",
                      str(getattr(ctx.exception, "details", "")))
        self._confirm(self.student, new["agreement_id"])
        self.assertEqual(
            FamilyAgreement.objects.get(pk=old["agreement_id"]).status,
            "confirmed")
        withdrawn = self.service.withdraw_family_agreement(
            participant_id=str(self.student.pk),
            agreement_id=new["agreement_id"])
        self.assertEqual(withdrawn["status"], "withdrawn")
        self.assertEqual(
            FamilyAgreement.objects.get(pk=old["agreement_id"]).status,
            "confirmed", "rút v2 thì v1 vẫn là bản đang hiệu lực")

    def test_supersede_confirmed_only_when_new_revision_fully_confirmed(self):
        """Cả hai xác nhận v2 → v1 mới superseded; không ký hộ: PH phải tự
        confirm (một mình HS ký chưa đủ)."""
        self._enroll_both(1)
        old = self._propose(self.student)
        self._confirm(self.student, old["agreement_id"])
        self._confirm(self.caregiver, old["agreement_id"])
        Enrollment.objects.all().update(program_revision=2)
        new = self._propose(self.student)
        self._confirm(self.student, new["agreement_id"])
        self.assertEqual(
            FamilyAgreement.objects.get(pk=old["agreement_id"]).status,
            "confirmed", "một bên ký chưa đủ để thay bản confirmed")
        self._confirm(self.caregiver, new["agreement_id"])
        self.assertEqual(
            FamilyAgreement.objects.get(pk=old["agreement_id"]).status,
            "superseded")
        self.assertEqual(
            FamilyAgreement.objects.get(pk=new["agreement_id"]).status,
            "confirmed")

    def test_overview_separates_effective_and_pending(self):
        """Overview phải phân biệt bản confirmed đang hiệu lực và đề xuất
        đang chờ — không trả duy nhất row mới nhất làm mất bản hiện hành."""
        self._enroll_both(1)
        old = self._propose(self.student)
        self._confirm(self.student, old["agreement_id"])
        self._confirm(self.caregiver, old["agreement_id"])
        Enrollment.objects.filter(participant=self.student).update(
            program_revision=2)
        new = self._propose(self.student)
        for user in (self.student, self.caregiver):
            overview = self.service.agreement_overview(
                participant_id=str(user.pk), program_key="family-4w")
            self.assertEqual(overview["effective_agreement"]["agreement_id"],
                             old["agreement_id"])
            self.assertEqual(
                overview["effective_agreement"]["status"], "confirmed")
            self.assertEqual(overview["pending_proposal"]["agreement_id"],
                             new["agreement_id"])
            self.assertEqual(overview["pending_proposal"]["status"],
                             "proposed")
            self.assertEqual(overview["agreement"]["agreement_id"],
                             old["agreement_id"],
                             "agreement (authoritative) = bản confirmed")

    def test_repropose_old_revision_under_live_confirmed_rejected(self):
        """v2 confirmed (v1 superseded) → re-propose v1 bị từ chối, không
        hồi sinh bản cũ dưới một bản confirmed còn hiệu lực."""
        self._enroll_both(1)
        v1 = self._propose(self.student)
        self._confirm(self.student, v1["agreement_id"])
        self._confirm(self.caregiver, v1["agreement_id"])
        Enrollment.objects.all().update(program_revision=2)
        v2 = self._propose(self.student)
        self._confirm(self.student, v2["agreement_id"])
        self._confirm(self.caregiver, v2["agreement_id"])
        Enrollment.objects.all().update(program_revision=1)
        with self.assertRaises(Exception) as ctx:
            self._propose(self.student)
        self.assertIn("agreement_revision_outdated",
                      str(getattr(ctx.exception, "details", "")))

    def test_new_propose_supersedes_pending_old_revision(self):
        """State machine: Proposed -> Superseded khi tạo đề xuất thay thế —
        chỉ áp dụng cho bản PENDING cũ (confirmed không bị đụng)."""
        self._enroll_both(1)
        pending = self._propose(self.student)
        self.assertEqual(pending["status"], "proposed")
        Enrollment.objects.all().update(program_revision=2)
        self._propose(self.student)
        self.assertEqual(
            FamilyAgreement.objects.get(
                pk=pending["agreement_id"]).status,
            "superseded",
            "đề xuất PENDING cũ nhường chỗ cho đề xuất mới")


class R3PinnedRevisionLookupTests(TestCase):
    def setUp(self):
        registry.reset_registries()
        registry.register_session_resolver(_lab_sessions.resolve_session)
        self.student = make_student()
        self.service = ProgramService()
        self.lifecycle = ContentLifecycleService()
        self._publish_programs(25)

    def tearDown(self):
        registry.reset_registries()

    def _publish_programs(self, count):
        for index in range(count):
            draft = self.lifecycle.create_draft(
                actor_id="audit:synthetic", kind="f02_program",
                title=f"Synthetic program {index}", body=_program_body(),
                audience="neutral",
                content_key="family-4w" if index == 0
                else f"audit-program-{index}")
            self.lifecycle.publish(actor_id="audit:synthetic",
                                   content_id=str(draft.id),
                                   expected_revision=1)

    def _wire_provider(self):
        registry.register_program_provider(PublishedContentProgramProvider())

    def test_pinned_revision_readable_beyond_catalog_window(self):
        """Audit probe (port, tăng lên 25 > 20): chương trình ĐẦU vẫn
        published nhưng tràn khỏi cả catalog service (10) lẫn provider
        (20) — exact lookup phải đọc đúng pin."""
        Enrollment.objects.create(participant=self.student,
                                  program_key="family-4w",
                                  program_revision=1, active=True)
        self._wire_provider()
        # sanity: catalog window thật sự không còn chứa family-4w rev 1
        catalog = self.service.catalog()
        self.assertLessEqual(len(catalog), 10)
        self.assertFalse(
            any(p["program_key"] == "family-4w" and p["revision"] == 1
                for p in catalog),
            "tiền đề audit: pin đã rơi khỏi cửa sổ catalog")
        payload = self.service.weeks_for_me(
            participant_id=str(self.student.pk), program_key="family-4w")
        self.assertEqual(payload["pinned_revision"], 1)
        self.assertEqual(payload["weeks"][0]["activities"][0]["activity_key"],
                         "act-1")

    def test_provider_list_stays_bounded(self):
        """Exact lookup KHÔNG bỏ giới hạn: provider list vẫn bounded 20,
        service catalog vẫn bounded 10, không quét toàn lịch sử."""
        self._wire_provider()
        self.assertLessEqual(
            len(PublishedContentProgramProvider().list_programs()), 20)
        self.assertLessEqual(len(self.service.catalog()), 10)

    def test_explicit_reenroll_repins_without_migrating_progress(self):
        """Re-enroll tường minh mới đổi pin; tiến độ rev cũ không tự dính
        vào rev mới (kể cả khi activity_key được dùng lại)."""
        Enrollment.objects.create(participant=self.student,
                                  program_key="family-4w",
                                  program_revision=1, active=True)
        self._wire_provider()
        self.service.mark_activity(
            participant_id=str(self.student.pk), program_key="family-4w",
            week_no=1, activity_key="act-1", status="done")
        # publish rev 2 của family-4w (clone_draft = revision+1, đúng B16
        # lifecycle) rồi re-enroll tường minh
        published = ContentItem.objects.get(content_key="family-4w",
                                            revision=1)
        clone = self.lifecycle.clone_draft(actor_id="audit:synthetic",
                                           content_id=str(published.id))
        self.assertEqual(clone.revision, 2)
        self.lifecycle.publish(actor_id="audit:synthetic",
                               content_id=str(clone.id), expected_revision=2)
        self.service.enroll(participant_id=str(self.student.pk),
                            program_key="family-4w", program_revision=2)
        enrollment = Enrollment.objects.get(participant=self.student,
                                            program_key="family-4w")
        self.assertEqual(enrollment.program_revision, 2)
        payload = self.service.weeks_for_me(
            participant_id=str(self.student.pk), program_key="family-4w")
        statuses = [a["status"] for week in payload["weeks"]
                    for a in week["activities"]]
        self.assertNotIn("done", statuses,
                         "tiến độ rev 1 không được kế thừa sang rev 2")

    def test_retired_content_fails_closed(self):
        """Retired → pin không đọc được nữa, fail-closed giữ nguyên (honest
        NotFound, không fake nội dung)."""
        Enrollment.objects.create(participant=self.student,
                                  program_key="family-4w",
                                  program_revision=1, active=True)
        self._wire_provider()
        item = ContentItem.objects.get(content_key="family-4w", revision=1)
        self.lifecycle.retire(actor_id="audit:synthetic",
                              content_id=str(item.id),
                              expected_revision=1, reason="audit")
        with self.assertRaises(Exception) as ctx:
            self.service.weeks_for_me(
                participant_id=str(self.student.pk),
                program_key="family-4w")
        self.assertIn("program_not_published",
                      str(getattr(ctx.exception, "details", "")))
