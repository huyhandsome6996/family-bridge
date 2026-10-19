"""F02 regressions for the independent QA of 2026-10-19 (source c29469b).

Covers the two backend findings of that QA round, with repro steps copied
from the FINDINGS evidence:

R02 — swapping the pinned program revision while the agreement TEMPLATE
      keeps its revision used to strand the proposal: propose returned the
      old row pinned to the old program_revision, confirm answered 400
      revision_mismatch forever. Identity of a family-agreement INSTANCE
      now includes program_revision: two users who deliberately re-pin the
      same NEW program revision propose/confirm a NEW instance of the SAME
      template revision; history (old rows) stays intact.
R04 — confirmed_at used to be min(first, second) signature time; the
      agreement is only confirmed at the SECOND signature, so
      confirmed_at must be max(proposer, counterpart) for both actor
      orders with distinct timestamps.

These tests fail on c29469b3d57f2c2cc53fe686fe7ec8f917f2dec6 (verified
before the fix) and must stay green afterwards.
"""

import datetime as dt

from django.test import TestCase
from rest_framework.test import APIClient

from fixtures.actors import make_student, make_caregiver

import labgrants.sessions as _lab_sessions

from ..models import Enrollment, FamilyAgreement
from ..services import registry
from ..services.program import ProgramService
from .helpers import auth_header, make_session


def _connection_stub(reader_map):
    """Test double mirroring the production F01ConnectionReader contract."""

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
                return {"connection_id": "conn-1",
                        "generation": info["generation"],
                        "relationship_kind": "primary", "status": "active"}
            return None

    return _Stub()


class _TemplateKeepsRevisionProvider:
    """QA 19/10 shape: program rev1 + rev2 share the SAME agreement
    template revision (clone changed only week guides). Also exposes a
    third variant where the template revision moved (2)."""

    def list_programs(self):
        def weeks(note=""):
            return [
                {"week_no": n, "title": f"T{n}{note}", "goals": [],
                 "student_guide": f"s{note}", "caregiver_guide": "c",
                 "joint_activity_keys": []}
                for n in (1, 2, 3, 4)]

        return [
            {"program_key": "family-4w", "revision": 1, "title": "P1",
             "status": "published", "weeks": weeks("-v1"),
             "agreement": {"revision": 1, "title": "A",
                           "commitments": ["c1"]}},
            {"program_key": "family-4w", "revision": 2, "title": "P2",
             "status": "published", "weeks": weeks("-v2"),
             "agreement": {"revision": 1, "title": "A",
                           "commitments": ["c1"]}},
            {"program_key": "family-4w", "revision": 3, "title": "P3",
             "status": "published", "weeks": weeks("-v3"),
             "agreement": {"revision": 2, "title": "A2",
                           "commitments": ["c2"]}},
        ]


class QA20261019AgreementBase(TestCase):
    def setUp(self):
        registry.reset_registries()
        registry.register_session_resolver(_lab_sessions.resolve_session)
        registry.register_program_provider(
            _TemplateKeepsRevisionProvider())
        self.student = make_student()
        self.caregiver = make_caregiver()
        self.student_token, _ = make_session(self.student)
        self.caregiver_token, _ = make_session(self.caregiver)
        self._wire_connection(generation=1)
        self.client = APIClient()
        self.service = ProgramService()

    def _wire_connection(self, generation=1):
        registry.register_connection_reader(_connection_stub({
            str(self.student.pk): {
                "counterpart_id": str(self.caregiver.pk),
                "generation": generation},
            str(self.caregiver.pk): {
                "counterpart_id": str(self.student.pk),
                "generation": generation},
        }))

    def _enroll(self, user, revision):
        Enrollment.objects.update_or_create(
            participant=user, program_key="family-4w",
            defaults={"program_revision": revision, "active": True})

    def _enroll_both(self, revision):
        self._enroll(self.student, revision)
        self._enroll(self.caregiver, revision)

    def _propose(self, token=None):
        token = token or self.student_token
        return self.client.post(
            "/api/v1/program/agreement/propose",
            {"program_key": "family-4w"}, format="json",
            **auth_header(token))

    def _confirm(self, agreement_id, token):
        return self.client.post(
            f"/api/v1/program/agreement/{agreement_id}/confirm",
            {}, format="json", **auth_header(token))


class R02RepinProgramKeepsTemplateTests(QA20261019AgreementBase):
    def test_repin_both_users_unblocks_agreement_same_template(self):
        """Exact QA repro: enroll rev1, propose (pending), clone program to
        rev2 with the template untouched, both re-enroll rev2, propose
        again -> a NEW row pinned rev2 (not the stale row), then both
        confirm -> confirmed."""
        self._enroll_both(revision=1)
        first = self._propose()
        self.assertEqual(first.status_code, 201, first.data)
        old_id = first.data["agreement_id"]
        self.assertEqual(first.data["program_revision"], 1)

        # Both deliberately choose the new program revision (template keeps
        # agreement_revision=1 — the QA clone only changed week guides).
        self._enroll_both(revision=2)
        second = self._propose()
        self.assertEqual(second.status_code, 201, second.data)
        self.assertNotEqual(second.data["agreement_id"], old_id)
        self.assertEqual(second.data["program_revision"], 2)
        self.assertEqual(second.data["agreement_revision"], 1)
        self.assertEqual(second.data["status"], "proposed")

        # Confirm completes on the NEW pinned row — no revision_mismatch.
        self.assertEqual(
            self._confirm(second.data["agreement_id"],
                          self.student_token).status_code, 200)
        done = self._confirm(second.data["agreement_id"],
                             self.caregiver_token)
        self.assertEqual(done.status_code, 200, done.data)
        self.assertEqual(done.data["status"], "confirmed")
        self.assertEqual(done.data["program_revision"], 2)

        # History preserved: the old rev1-pinned row is superseded, never
        # deleted, and never revived.
        rows = list(FamilyAgreement.objects.order_by("created_at"))
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0].status, "superseded")
        self.assertEqual(rows[0].program_revision, 1)
        self.assertEqual(rows[1].status, "confirmed")

    def test_repeated_propose_after_repin_never_returns_stale_pin(self):
        self._enroll_both(revision=1)
        stale = self._propose().data
        self._enroll_both(revision=2)
        for _ in range(3):
            again = self._propose()
            self.assertEqual(again.status_code, 201, again.data)
            self.assertEqual(again.data["program_revision"], 2,
                             "repeated propose must not hand back the "
                             "old program_revision pin")
            self.assertEqual(again.data["agreement_id"],
                             again.data["agreement_id"])
            self.assertNotEqual(again.data["agreement_id"],
                                stale["agreement_id"])

    def test_only_one_side_repins_still_blocked_with_clear_reason(self):
        """One-sided re-pin: the OTHER side (still on rev1) must not be
        able to confirm the rev2-pinned row; their own rev1 re-propose is
        refused while the newer-pinned proposal is live."""
        self._enroll_both(revision=1)
        self._propose()
        self._enroll(self.student, revision=2)  # only the student moves
        second = self._propose()
        self.assertEqual(second.status_code, 201, second.data)
        self.assertEqual(second.data["program_revision"], 2)
        blocked = self._confirm(second.data["agreement_id"],
                                self.caregiver_token)
        self.assertEqual(blocked.status_code, 400)
        self.assertEqual(
            blocked.data["error"]["details"]["reason"], "revision_mismatch")
        # The rev1 side cannot push their old pin back into play while the
        # newer-pinned proposal is live.
        outdated = self._propose(self.caregiver_token)
        self.assertEqual(outdated.status_code, 400)
        self.assertEqual(
            outdated.data["error"]["details"]["reason"],
            "agreement_revision_outdated")

    def test_withdrawn_history_stays_and_repin_proposes_fresh(self):
        self._enroll_both(revision=1)
        first = self._propose().data
        withdrawn = self.client.post(
            f"/api/v1/program/agreement/{first['agreement_id']}/withdraw",
            {}, format="json", **auth_header(self.student_token))
        self.assertEqual(withdrawn.status_code, 200)
        self._enroll_both(revision=2)
        second = self._propose()
        self.assertEqual(second.status_code, 201, second.data)
        self.assertEqual(second.data["program_revision"], 2)
        rows = list(FamilyAgreement.objects.order_by("created_at"))
        self.assertEqual([r.status for r in rows],
                         ["withdrawn", "proposed"])

    def test_template_revision_move_still_creates_new_instance(self):
        """When the new program revision also carries a NEW agreement
        template revision, the instance must bind the new (program,
        agreement) revision pair."""
        self._enroll_both(revision=1)
        self._propose()
        self._enroll_both(revision=3)
        third = self._propose()
        self.assertEqual(third.status_code, 201, third.data)
        self.assertEqual(third.data["program_revision"], 3)
        self.assertEqual(third.data["agreement_revision"], 2)
        self.assertEqual(third.data["commitments"], ["c2"])

    def test_generation_after_reconnect_uses_new_instance_slot(self):
        """After unlink/reconnect (new generation) the pair proposes into a
        fresh instance of the same (program_revision, agreement_revision);
        the old generation row is history, never reused."""
        self._enroll_both(revision=1)
        first = self._propose().data
        self._confirm(first["agreement_id"], self.student_token)
        self._wire_connection(generation=2)
        again = self._propose()
        self.assertEqual(again.status_code, 201, again.data)
        self.assertNotEqual(again.data["agreement_id"],
                            first["agreement_id"])
        self.assertEqual(again.data["connection_generation"], 2)
        rows = FamilyAgreement.objects.all()
        self.assertEqual(rows.count(), 2)


class R04ConfirmedAtTests(QA20261019AgreementBase):
    def _confirmed_payload(self, first_token, second_token):
        self._enroll_both(revision=1)
        agreement = self._propose().data
        first = self._confirm(agreement["agreement_id"], first_token)
        self.assertEqual(first.status_code, 200, first.data)
        self.assertIsNone(first.data["confirmed_at"],
                          "one signature must not surface confirmed_at")
        first_time = first.data["updated_at"]
        second = self._confirm(agreement["agreement_id"], second_token)
        self.assertEqual(second.status_code, 200, second.data)
        return first_time, second.data

    def test_confirmed_at_is_second_signature_student_first(self):
        first_time, done = self._confirmed_payload(
            self.student_token, self.caregiver_token)
        self.assertEqual(done["status"], "confirmed")
        self.assertEqual(done["confirmed_at"], done["updated_at"])
        self.assertGreater(done["confirmed_at"], first_time)

    def test_confirmed_at_is_second_signature_caregiver_first(self):
        first_time, done = self._confirmed_payload(
            self.caregiver_token, self.student_token)
        self.assertEqual(done["status"], "confirmed")
        self.assertEqual(done["confirmed_at"], done["updated_at"])
        self.assertGreater(done["confirmed_at"], first_time)

    def test_confirmed_at_matches_max_signature_timestamp_in_db(self):
        self._enroll_both(revision=1)
        agreement = self._propose().data
        self._confirm(agreement["agreement_id"], self.student_token)
        self._confirm(agreement["agreement_id"], self.caregiver_token)
        row = FamilyAgreement.objects.get(pk=agreement["agreement_id"])
        expected = max(row.proposer_confirmed_at,
                       row.counterpart_confirmed_at)
        self.assertEqual(row.status, "confirmed")
        view = row.view(viewer_id=str(self.student.pk))
        self.assertEqual(
            dt.datetime.fromisoformat(view["confirmed_at"]), expected)
