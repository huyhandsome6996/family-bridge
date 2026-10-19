"""Regression tests for F02 BUG-F02-01: F01ConnectionReader relationship_kind filtering.

Invariants:
- Admin-provisioned pairs have invite=None and source="admin_provisioned".
- F02 only operates on PRIMARY family connections (relationship_kind="primary").
- Primary connection wins over backup even when backup has a larger UUID.
- Backup-only connection returns None (not eligible for family agreement).
- Week-4 agreement binds to the primary counterpart only; backup supporter cannot confirm.
"""

import uuid
from django.test import TestCase
from rest_framework.test import APIClient

import labgrants.sessions as _lab_sessions
from fixtures.actors import make_student, make_caregiver
from family_bridge_features.f01_identity.models import (
    Connection, CONNECTION_ACTIVE, RELATIONSHIP_PRIMARY, RELATIONSHIP_BACKUP,
)
from family_bridge_features.f02_program.models import Enrollment
from family_bridge_features.f02_program.services import registry
from family_bridge_features.f02_program.wiring import F01ConnectionReader
from .helpers import auth_header, make_session
from .test_f02_wiring_agreement import _StaticProvider


PRIMARY_UUID = uuid.UUID("00000000-0000-4000-8000-000000000001")
BACKUP_UUID = uuid.UUID("ffffffff-ffff-4fff-8fff-fffffffffffe")


def _make_connection(*, id_uuid, user_a, user_b, kind, invite=None,
                     source="admin_provisioned", status=CONNECTION_ACTIVE,
                     generation=1):
    low_user, high_user = (user_a, user_b) if str(user_a.pk) < str(user_b.pk) else (user_b, user_a)
    return Connection.objects.create(
        id=id_uuid,
        party_low=low_user,
        party_high=high_user,
        invite=invite,
        source=source,
        relationship_kind=kind,
        status=status,
        generation=generation,
    )


class CurrentConnectionsRegressionTests(TestCase):
    def setUp(self):
        registry.reset_registries()
        registry.register_session_resolver(_lab_sessions.resolve_session)
        registry.register_program_provider(_StaticProvider())
        self.reader = F01ConnectionReader()
        registry.register_connection_reader(self.reader)
        self.client = APIClient()

        self.student = make_student()
        self.caregiver = make_caregiver()
        self.backup_supporter = make_caregiver()

        self.student_token, _ = make_session(self.student)
        self.caregiver_token, _ = make_session(self.caregiver)
        self.backup_token, _ = make_session(self.backup_supporter)

    def test_d01_admin_pair_without_invite_is_usable(self):
        """Case 1 (D01): admin pair without invite is usable."""
        _make_connection(
            id_uuid=PRIMARY_UUID,
            user_a=self.student,
            user_b=self.caregiver,
            kind=RELATIONSHIP_PRIMARY,
            invite=None,
            source="admin_provisioned",
        )

        for_student = self.reader.active_connection_for(user_id=str(self.student.pk))
        self.assertIsNotNone(for_student)
        self.assertEqual(for_student["connection_id"], str(PRIMARY_UUID))
        self.assertEqual(for_student["relationship_kind"], "primary")
        self.assertEqual(for_student["counterpart_id"], str(self.caregiver.pk))
        self.assertEqual(for_student["status"], "active")
        self.assertEqual(for_student["generation"], 1)

        between = self.reader.active_connection_between(
            user_a=str(self.student.pk), user_b=str(self.caregiver.pk)
        )
        self.assertIsNotNone(between)
        self.assertEqual(between["connection_id"], str(PRIMARY_UUID))
        self.assertEqual(between["relationship_kind"], "primary")
        self.assertEqual(between["status"], "active")
        self.assertEqual(between["generation"], 1)

    def test_d02_primary_wins_over_backup_with_larger_uuid(self):
        """Case 2 (D02): primary wins over backup with larger UUID."""
        _make_connection(
            id_uuid=PRIMARY_UUID,
            user_a=self.student,
            user_b=self.caregiver,
            kind=RELATIONSHIP_PRIMARY,
            invite=None,
            source="admin_provisioned",
        )
        _make_connection(
            id_uuid=BACKUP_UUID,
            user_a=self.student,
            user_b=self.backup_supporter,
            kind=RELATIONSHIP_BACKUP,
            invite=None,
            source="admin_provisioned",
        )

        for_student = self.reader.active_connection_for(user_id=str(self.student.pk))
        self.assertIsNotNone(for_student)
        self.assertEqual(for_student["relationship_kind"], "primary")
        self.assertEqual(for_student["counterpart_id"], str(self.caregiver.pk))
        self.assertEqual(for_student["connection_id"], str(PRIMARY_UUID))

        between_primary = self.reader.active_connection_between(
            user_a=str(self.student.pk), user_b=str(self.caregiver.pk)
        )
        self.assertIsNotNone(between_primary)
        self.assertEqual(between_primary["relationship_kind"], "primary")

        between_backup = self.reader.active_connection_between(
            user_a=str(self.student.pk), user_b=str(self.backup_supporter.pk)
        )
        self.assertIsNone(between_backup)

    def test_d02_primary_wins_over_backup_reverse_direction_caregiver_side(self):
        """Case 3 (D02 reverse direction): queried from caregiver side."""
        _make_connection(
            id_uuid=PRIMARY_UUID,
            user_a=self.student,
            user_b=self.caregiver,
            kind=RELATIONSHIP_PRIMARY,
            invite=None,
            source="admin_provisioned",
        )
        _make_connection(
            id_uuid=BACKUP_UUID,
            user_a=self.student,
            user_b=self.backup_supporter,
            kind=RELATIONSHIP_BACKUP,
            invite=None,
            source="admin_provisioned",
        )

        for_caregiver = self.reader.active_connection_for(user_id=str(self.caregiver.pk))
        self.assertIsNotNone(for_caregiver)
        self.assertEqual(for_caregiver["relationship_kind"], "primary")
        self.assertEqual(for_caregiver["counterpart_id"], str(self.student.pk))
        self.assertEqual(for_caregiver["connection_id"], str(PRIMARY_UUID))

        between = self.reader.active_connection_between(
            user_a=str(self.caregiver.pk), user_b=str(self.student.pk)
        )
        self.assertIsNotNone(between)
        self.assertEqual(between["relationship_kind"], "primary")

    def test_d03_backup_only_is_not_a_family_agreement_pair(self):
        """Case 4 (D03): backup-only -> None."""
        _make_connection(
            id_uuid=BACKUP_UUID,
            user_a=self.student,
            user_b=self.backup_supporter,
            kind=RELATIONSHIP_BACKUP,
            invite=None,
            source="admin_provisioned",
        )

        for_student = self.reader.active_connection_for(user_id=str(self.student.pk))
        self.assertIsNone(for_student)

        between = self.reader.active_connection_between(
            user_a=str(self.student.pk), user_b=str(self.backup_supporter.pk)
        )
        self.assertIsNone(between)

    def test_api_agreement_binds_to_primary_and_backup_cannot_confirm(self):
        """API level test: with primary+backup present, propose and confirm of the
        week-4 agreement binds to the primary counterpart only; backup user cannot
        confirm for the pair.
        """
        _make_connection(
            id_uuid=PRIMARY_UUID,
            user_a=self.student,
            user_b=self.caregiver,
            kind=RELATIONSHIP_PRIMARY,
            invite=None,
            source="admin_provisioned",
        )
        _make_connection(
            id_uuid=BACKUP_UUID,
            user_a=self.student,
            user_b=self.backup_supporter,
            kind=RELATIONSHIP_BACKUP,
            invite=None,
            source="admin_provisioned",
        )

        Enrollment.objects.create(participant=self.student, program_key="family-4w",
                                  program_revision=1, active=True)
        Enrollment.objects.create(participant=self.caregiver, program_key="family-4w",
                                  program_revision=1, active=True)
        Enrollment.objects.create(participant=self.backup_supporter, program_key="family-4w",
                                  program_revision=1, active=True)

        # Student proposes week-4 agreement
        resp_propose = self.client.post(
            "/api/v1/program/agreement/propose",
            {"program_key": "family-4w"}, format="json",
            **auth_header(self.student_token)
        )
        self.assertEqual(resp_propose.status_code, 201, resp_propose.data)
        agreement_id = resp_propose.data["agreement_id"]

        # Backup supporter tries to confirm -> MUST FAIL with 404 (not counterpart of this agreement)
        resp_backup_confirm = self.client.post(
            f"/api/v1/program/agreement/{agreement_id}/confirm",
            {}, format="json",
            **auth_header(self.backup_token)
        )
        self.assertEqual(resp_backup_confirm.status_code, 404, resp_backup_confirm.data)

        # Primary caregiver confirms -> SUCCESS 200
        resp_caregiver_confirm = self.client.post(
            f"/api/v1/program/agreement/{agreement_id}/confirm",
            {}, format="json",
            **auth_header(self.caregiver_token)
        )
        self.assertEqual(resp_caregiver_confirm.status_code, 200, resp_caregiver_confirm.data)
        self.assertTrue(resp_caregiver_confirm.data["my_confirmed"])
