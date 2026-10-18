"""F07 integration tests — REAL counterparts, no lab doubles for the parts
under test: F01 InviteService as the connection reader, f01 Connection rows
including admin_provisioned (invite NULL), and the F15 grant-provider
registry. These pin the production wiring contract of apps.py."""

import datetime as dt

from django.test import TestCase

from fixtures.actors import make_student, make_caregiver, make_system_admin

import labgrants.sessions as _lab_sessions

from ..models import MoodEntry, MoodShare
from ..apps import wire_production_ports
from ..services import registry
from ..services import grant_provider
from ..services.mood import MoodShareService
from .helpers import auth_header, make_session
from .test_f07 import vn_today

from rest_framework.test import APIClient


class IntegrationBase(TestCase):
    def setUp(self):
        registry.reset_registries()
        registry.register_session_resolver(_lab_sessions.resolve_session)
        # REAL F01 reader + REAL F15 registrations (production wiring path)
        self.wiring = wire_production_ports()
        self.client = APIClient()
        self.student = make_student()
        self.caregiver = make_caregiver()
        self.admin = make_system_admin()
        self.student_token, _ = make_session(self.student)
        self.caregiver_token, _ = make_session(self.caregiver)
        self.admin_token, _ = make_session(self.admin)

    def _admin_pair(self, source="admin_provisioned"):
        """Canonical ACTIVE connection created the admin way (CAP-23):
        invite stays NULL, source records provenance, generation 1."""
        from family_bridge_features.f01_identity.models import Connection
        low, high = sorted([str(self.student.pk), str(self.caregiver.pk)])
        return Connection.objects.create(
            party_low_id=low, party_high_id=high,
            relationship_kind="primary", invite=None, source=source,
            source_admin=str(self.admin.pk), status="active", generation=1)

    def _create(self, token=None, **overrides):
        token = token or self.student_token
        payload = {"entry_date": vn_today().isoformat(),
                   "emotion": "lo", "note": "lo vì bài kiểm tra"}
        payload.update(overrides)
        return self.client.post("/api/v1/mood/entries", payload,
                                format="json", **auth_header(token))


class ProductionWiringTests(IntegrationBase):
    def test_wiring_registers_real_ports(self):
        self.assertTrue(self.wiring["connection_reader"])
        self.assertTrue(self.wiring["grant_provider"])
        self.assertTrue(self.wiring["deletion_hook"])
        reader = registry.get_connection_reader()
        from family_bridge_features.f01_identity.services.invites import (
            InviteService)
        self.assertIsInstance(reader, InviteService)
        from family_bridge_features.f15_privacy.services import registry as f15
        self.assertIn("mood_entry", f15.registered_item_types())
        self.assertIn("mood", f15.registered_categories())

    def test_admin_provisioned_pair_share_and_read(self):
        """F07-11: admin-provisioned active pair (invite NULL) shares like
        any canonical connection — no bilateral confirmation demanded."""
        connection = self._admin_pair()
        entry_id = self._create().data["entry_id"]
        share = self.client.post(
            f"/api/v1/mood/entries/{entry_id}/share",
            {"recipient_id": str(self.caregiver.pk), "expected_revision": 1},
            format="json", **auth_header(self.student_token))
        self.assertEqual(share.status_code, 201)
        detail = self.client.get(
            f"/api/v1/mood/shared/{share.data['share_id']}", format="json",
            **auth_header(self.caregiver_token))
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["entry"]["note"], "lo vì bài kiểm tra")

    def test_f15_provider_revoke_blocks_f07_read(self):
        """F07-21: revoking from the F15 machinery must cut the F07 read
        path immediately — one grant source, no second truth."""
        from family_bridge_features.f15_privacy.services import registry as f15
        self._admin_pair()
        entry_id = self._create().data["entry_id"]
        share_id = self.client.post(
            f"/api/v1/mood/entries/{entry_id}/share",
            {"recipient_id": str(self.caregiver.pk)}, format="json",
            **auth_header(self.student_token)).data["share_id"]
        readable = self.client.get(f"/api/v1/mood/shared/{share_id}",
                                   format="json",
                                   **auth_header(self.caregiver_token))
        self.assertEqual(readable.status_code, 200)
        outcome = f15.revoke_grant(owner_id=str(self.student.pk),
                                   item_type="mood_entry", item_id=entry_id,
                                   recipient_id=str(self.caregiver.pk))
        self.assertTrue(outcome["found"])
        self.assertTrue(outcome["revoked"])
        denied = self.client.get(f"/api/v1/mood/shared/{share_id}",
                                 format="json",
                                 **auth_header(self.caregiver_token))
        self.assertEqual(denied.status_code, 404)

    def test_f15_provider_can_view_true_only_when_current(self):
        self._admin_pair()
        entry = MoodEntry.objects.create(owner=self.student,
                                         entry_date=vn_today(),
                                         emotion="vui", note="ok")
        share = MoodShare.objects.create(
            entry=entry, owner=self.student, recipient=self.caregiver,
            approved_revision=1,
            connection_id="00000000-0000-0000-0000-000000000000",
            connection_generation=1)
        # grant bound to a DIFFERENT connection id than the current one
        self.assertFalse(grant_provider.can_view(
            owner_id=str(self.student.pk), item_id=str(entry.pk),
            recipient_id=str(self.caregiver.pk), revision=1))
        # fix the binding -> readable
        share.connection_id = self._current_connection_id()
        share.save(update_fields=["connection_id"])
        self.assertTrue(grant_provider.can_view(
            owner_id=str(self.student.pk), item_id=str(entry.pk),
            recipient_id=str(self.caregiver.pk), revision=1))
        # edit -> revision stale -> denied even with correct binding
        entry.revision = 2
        entry.save(update_fields=["revision"])
        self.assertFalse(grant_provider.can_view(
            owner_id=str(self.student.pk), item_id=str(entry.pk),
            recipient_id=str(self.caregiver.pk), revision=1))

    def _current_connection_id(self) -> str:
        from family_bridge_features.f01_identity.models import Connection
        low, high = sorted([str(self.student.pk), str(self.caregiver.pk)])
        row = Connection.objects.filter(party_low_id=low, party_high_id=high,
                                        status="active").first()
        return str(row.pk)

    def test_mood_deletion_hook_truthful_and_idempotent(self):
        from family_bridge_features.f07_mood.services.deletion import (
            apply_user_deletion)
        self._admin_pair()
        entry_id = self._create().data["entry_id"]
        self.client.post(
            f"/api/v1/mood/entries/{entry_id}/share",
            {"recipient_id": str(self.caregiver.pk)}, format="json",
            **auth_header(self.student_token))
        now = dt.datetime.now(dt.timezone.utc)
        first = apply_user_deletion(user_id=str(self.student.pk),
                                    requested_at=now)
        self.assertTrue(first["ok"])
        self.assertIn("entries deleted=1", first["detail"])
        self.assertFalse(MoodEntry.objects.filter(pk=entry_id).exists())
        # the received grant of the caregiver got revoked, not resurrected
        self.assertFalse(MoodShare.objects.filter(
            recipient_id=str(self.caregiver.pk),
            revoked_at__isnull=True).exists())
        again = apply_user_deletion(user_id=str(self.student.pk),
                                    requested_at=now)
        self.assertTrue(again["ok"])
        self.assertIn("entries deleted=0", again["detail"])

    def test_real_reader_list_and_summary_owner_scoped(self):
        """F07-09 (harness integration layer): with the REAL reader wired,
        other actors still get no window into the owner's data."""
        self._admin_pair()
        entry_id = self._create().data["entry_id"]
        for token in (self.caregiver_token, self.admin_token):
            history = self.client.get("/api/v1/mood/entries", format="json",
                                      **auth_header(token))
            self.assertEqual(history.data["results"], [])
            detail = self.client.get(f"/api/v1/mood/entries/{entry_id}",
                                     format="json", **auth_header(token))
            self.assertEqual(detail.status_code, 404)
        summary = self.client.get("/api/v1/mood/entries/summary", format="json",
                                  **auth_header(self.caregiver_token))
        self.assertEqual(summary.data["results"], [])


class ReshareUnlinkReconnectIntegration(IntegrationBase):
    """F07-19 through the REAL reader: unlink -> reconnect creates a NEW
    Connection row (generation 2); the old grant dies with the old binding
    and explicit re-share rebinds to the new connection."""

    def _pair_connection(self):
        from family_bridge_features.f01_identity.models import Connection
        low, high = sorted([str(self.student.pk), str(self.caregiver.pk)])
        return Connection.objects.filter(party_low_id=low,
                                         party_high_id=high).first()

    def test_full_cycle(self):
        self._admin_pair()
        entry_id = self._create().data["entry_id"]
        share_id = self.client.post(
            f"/api/v1/mood/entries/{entry_id}/share",
            {"recipient_id": str(self.caregiver.pk)}, format="json",
            **auth_header(self.student_token)).data["share_id"]

        conn = self._pair_connection()
        conn.status = "revoked"
        conn.save(update_fields=["status", "revoked_at"])
        denied = self.client.get(f"/api/v1/mood/shared/{share_id}",
                                 format="json",
                                 **auth_header(self.caregiver_token))
        self.assertEqual(denied.status_code, 404)

        # reconnect: new canonical row for the same two people
        from family_bridge_features.f01_identity.models import Connection
        low, high = sorted([str(self.student.pk), str(self.caregiver.pk)])
        Connection.objects.create(party_low_id=low, party_high_id=high,
                                  relationship_kind="primary", invite=None,
                                  source="admin_provisioned", status="active",
                                  generation=2)
        still_denied = self.client.get(f"/api/v1/mood/shared/{share_id}",
                                       format="json",
                                       **auth_header(self.caregiver_token))
        self.assertEqual(still_denied.status_code, 404)

        reshare = self.client.post(
            f"/api/v1/mood/entries/{entry_id}/share",
            {"recipient_id": str(self.caregiver.pk)}, format="json",
            **auth_header(self.student_token))
        self.assertEqual(reshare.status_code, 201)
        self.assertEqual(reshare.data["share_id"], share_id)
        self.assertEqual(reshare.data["revoked"], False)
        stored = MoodShare.objects.get(pk=share_id)
        self.assertEqual(stored.connection_generation, 2)
        self.assertEqual(stored.connection_id,
                         str(Connection.objects.filter(
                             party_low_id=low, party_high_id=high,
                             status="active").first().pk))
        readable = self.client.get(f"/api/v1/mood/shared/{share_id}",
                                   format="json",
                                   **auth_header(self.caregiver_token))
        self.assertEqual(readable.status_code, 200)
