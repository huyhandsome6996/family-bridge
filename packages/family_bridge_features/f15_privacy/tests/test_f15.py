"""F15 tests: access policy deny-by-default, deletion workflow truthfulness,
ledger append-only, restore replay, API permissions incl. no-admin-bypass."""

import datetime as dt
import uuid

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from family_bridge_core.timeutils import UTC
from fixtures.actors import make_student, make_caregiver, make_system_admin

from labgrants.models import GrantRow
from labgrants.providers import mood_entry_provider

from ..models import DeletionLedgerEvent, DeletionRequest, PrivacyCase
from ..services import ports as privacy_ports
from ..services import registry as grant_registry
from ..services.deletion import DeletionService
from .helpers import auth_header, make_session
from ..services.sessions import register_session_resolver
import labgrants.sessions as _lab_sessions


class _AllowAllAuthorizer:
    """TEST-ONLY synthetic handler authorization (DEC-14/18 open in prod)."""

    def authorize(self, *, actor_id, action, request_id):
        return True


def _register_providers():
    register_session_resolver(_lab_sessions.resolve_session)
    grant_registry.register_grant_provider("mood_entry",
                                           "labgrants.providers.mood_entry_provider")
    grant_registry.register_grant_provider("journal_page",
                                           "labgrants.providers.journal_page_provider")
    grant_registry.register_deletion_hook("mood",
                                          "labgrants.providers.MoodDeletionHook")
    grant_registry.register_deletion_hook("journal",
                                          "labgrants.providers.JournalDeletionHook")


class F15TestCase(TestCase):
    def setUp(self):
        super().setUp()
        grant_registry.reset_registries()
        privacy_ports.reset_ports()
        self._register_providers()
        self.owner = make_student()
        self.recipient = make_caregiver()
        self.stranger = make_student()

    def _register_providers(self):
        register_session_resolver(_lab_sessions.resolve_session)
        grant_registry.register_grant_provider("mood_entry",
                                               "labgrants.providers.mood_entry_provider")
        grant_registry.register_grant_provider("journal_page",
                                               "labgrants.providers.journal_page_provider")
        grant_registry.register_deletion_hook("mood",
                                              "labgrants.providers.MoodDeletionHook")
        grant_registry.register_deletion_hook("journal",
                                              "labgrants.providers.JournalDeletionHook")


class AccessPolicyTests(F15TestCase):
    def _grant(self, **overrides):
        defaults = dict(item_type="mood_entry", item_id=uuid.uuid4(),
                        owner_id=str(self.owner.pk),
                        recipient_id=str(self.recipient.pk),
                        approved_revision=1, connection_generation=1)
        defaults.update(overrides)
        return GrantRow.objects.create(**defaults)

    def test_deny_by_default_when_no_grant(self):
        item_id = uuid.uuid4()
        self.assertFalse(grant_registry.can_view_item(
            owner_id=str(self.owner.pk), item_type="mood_entry",
            item_id=str(item_id), recipient_id=str(self.recipient.pk),
            revision=1))

    def test_deny_when_provider_not_registered(self):
        GrantRow.objects.create(item_type="mood_entry", item_id=uuid.uuid4(),
                                owner_id=str(self.owner.pk),
                                recipient_id=str(self.recipient.pk),
                                approved_revision=1)
        self.assertFalse(grant_registry.can_view_item(
            owner_id=str(self.owner.pk), item_type="unknown_kind",
            item_id=str(uuid.uuid4()), recipient_id=str(self.recipient.pk),
            revision=1))

    def test_grant_right_revision_allows_view(self):
        grant = self._grant()
        self.assertTrue(grant_registry.can_view_item(
            owner_id=str(self.owner.pk), item_type="mood_entry",
            item_id=str(grant.item_id), recipient_id=str(self.recipient.pk),
            revision=1))

    def test_stale_revision_denied_no_body_leak(self):
        grant = self._grant(approved_revision=1)
        self.assertFalse(grant_registry.can_view_item(
            owner_id=str(self.owner.pk), item_type="mood_entry",
            item_id=str(grant.item_id), recipient_id=str(self.recipient.pk),
            revision=2))

    def test_revoked_grant_denied(self):
        grant = self._grant()
        mood_entry_provider.revoke_grant(owner_id=str(self.owner.pk),
                                         item_id=str(grant.item_id),
                                         recipient_id=str(self.recipient.pk))
        self.assertFalse(grant_registry.can_view_item(
            owner_id=str(self.owner.pk), item_type="mood_entry",
            item_id=str(grant.item_id), recipient_id=str(self.recipient.pk),
            revision=1))

    def test_other_recipient_denied(self):
        grant = self._grant()
        self.assertFalse(grant_registry.can_view_item(
            owner_id=str(self.owner.pk), item_type="mood_entry",
            item_id=str(grant.item_id), recipient_id=str(self.stranger.pk),
            revision=1))

    def test_disconnected_connection_denies_via_reader(self):
        class DeadReader:
            def active_connection_between(self, *, user_a, user_b):
                return None
        grant = self._grant()
        self.assertFalse(grant_registry.can_view_item(
            owner_id=str(self.owner.pk), item_type="mood_entry",
            item_id=str(grant.item_id), recipient_id=str(self.recipient.pk),
            revision=1, connection_reader=DeadReader()))

    def test_revoke_unknown_type_fails_closed(self):
        from family_bridge_core.errors import ModuleUnavailable
        with self.assertRaises(ModuleUnavailable):
            grant_registry.revoke_grant(owner_id=str(self.owner.pk),
                                        item_type="messages",
                                        item_id=str(uuid.uuid4()))

    def test_ledger_append_only(self):
        event = DeletionLedgerEvent.objects.create(
            target_user_id=str(self.owner.pk), actor_ref="test",
            event_type=DeletionLedgerEvent.EVENT_GRANT_REVOKED,
            payload={"item_type": "mood_entry", "item_id": str(uuid.uuid4())})
        event.event_type = DeletionLedgerEvent.EVENT_DELETION_APPLIED
        with self.assertRaises(ValueError):
            event.save()


class DeletionWorkflowTests(F15TestCase):
    def test_request_receipt_shown_once_hash_stored(self):
        service = DeletionService()
        result = service.request_deletion(user=self.owner,
                                          categories=["mood", "journal"])
        self.assertFalse(result["duplicate"])
        self.assertIn("receipt", result)
        row = DeletionRequest.objects.get(pk=result["request_id"])
        self.assertNotEqual(row.receipt_hash, result["receipt"])
        self.assertEqual(row.status, DeletionRequest.STATUS_REQUESTED)
        self.assertIn(DeletionLedgerEvent.EVENT_DELETION_REQUESTED,
                      list(DeletionLedgerEvent.objects.values_list(
                          "event_type", flat=True)))

    def test_duplicate_open_request_idempotent_no_receipt(self):
        service = DeletionService()
        first = service.request_deletion(user=self.owner, categories=["mood"])
        second = service.request_deletion(user=self.owner, categories=["mood"])
        self.assertTrue(second["duplicate"])
        self.assertNotIn("receipt", second)
        self.assertEqual(DeletionRequest.objects.filter(user=self.owner).count(), 1)
        self.assertEqual(first["request_id"], second["request_id"])

    def test_invalid_categories_rejected(self):
        service = DeletionService()
        with self.assertRaises(Exception):
            service.request_deletion(user=self.owner, categories=["everything"])
        with self.assertRaises(Exception):
            service.request_deletion(user=self.owner, categories=[])

    def test_cancel_only_while_requested(self):
        service = DeletionService()
        result = service.request_deletion(user=self.owner, categories=["mood"])
        cancelled = service.cancel_request(user=self.owner,
                                           request_id=result["request_id"])
        self.assertEqual(cancelled.status, DeletionRequest.STATUS_CANCELLED)
        with self.assertRaises(Exception):
            service.cancel_request(user=self.owner,
                                   request_id=result["request_id"])

    def test_processing_truthful_completed_vs_failed(self):
        service = DeletionService()
        # All hooks ok -> completed
        ok_request = service.request_deletion(user=self.owner,
                                              categories=["mood", "journal"])
        service.verify_request(request_id=ok_request["request_id"],
                               verifier_ref="test-verifier",
                               authorizer=_AllowAllAuthorizer())
        done = service.process_request(request_id=ok_request["request_id"])
        self.assertEqual(done.status, DeletionRequest.STATUS_COMPLETED)
        # Hook failing -> failed_needs_action, NOT completed
        grant_registry.register_deletion_hook("ai",
                                              "labgrants.providers.FailingHook")
        fail_request = service.request_deletion(user=self.owner,
                                                categories=["mood", "ai"])
        service.verify_request(request_id=fail_request["request_id"],
                               verifier_ref="test-verifier",
                               authorizer=_AllowAllAuthorizer())
        failed = service.process_request(request_id=fail_request["request_id"])
        self.assertEqual(failed.status, DeletionRequest.STATUS_FAILED)
        self.assertFalse(failed.failure_detail["ai"]["ok"])
        self.assertTrue(failed.failure_detail["mood"]["ok"])
        self.assertIn(DeletionLedgerEvent.EVENT_DELETION_FAILED,
                      list(DeletionLedgerEvent.objects.values_list(
                          "event_type", flat=True)))

    def test_deletion_hooks_remove_grants(self):
        service = DeletionService()
        grant = GrantRow.objects.create(
            item_type="mood_entry", item_id=uuid.uuid4(),
            owner_id=str(self.owner.pk), recipient_id=str(self.recipient.pk),
            approved_revision=1)
        result = service.request_deletion(user=self.owner, categories=["mood"])
        service.verify_request(request_id=result["request_id"],
                               verifier_ref="test-verifier",
                               authorizer=_AllowAllAuthorizer())
        service.process_request(request_id=result["request_id"])
        self.assertFalse(GrantRow.objects.filter(pk=grant.pk).exists())

    def test_restore_replay_revives_nothing(self):
        service = DeletionService()
        grant = GrantRow.objects.create(
            item_type="journal_page", item_id=uuid.uuid4(),
            owner_id=str(self.owner.pk), recipient_id=str(self.recipient.pk),
            approved_revision=3)
        # Owner revokes via provider -> ledger event written.
        grant_registry.revoke_grant(owner_id=str(self.owner.pk),
                                    item_type="journal_page",
                                    item_id=str(grant.item_id),
                                    recipient_id=str(self.recipient.pk))
        # Simulate "backup restored": the row is back, unrevoked.
        GrantRow.objects.filter(pk=grant.pk).update(revoked_at=None)
        summary = DeletionService.replay_ledger_for_restore(
            target_user_id=str(self.owner.pk))
        grant.refresh_from_db()
        self.assertIsNotNone(grant.revoked_at, "restore replay must re-revoke")
        self.assertGreaterEqual(summary["applied"], 1)


class PrivacyApiTests(F15TestCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.owner_token, _ = make_session(self.owner)
        self.stranger_token, _ = make_session(self.stranger)
        self.admin = make_system_admin()
        self.admin_token, _ = make_session(self.admin)

    def _grant(self):
        return GrantRow.objects.create(
            item_type="mood_entry", item_id=uuid.uuid4(),
            owner_id=str(self.owner.pk), recipient_id=str(self.recipient.pk),
            approved_revision=2)

    def test_overview_lists_shared_by_me_owner_only(self):
        grant = self._grant()
        response = self.client.get("/api/v1/privacy/overview", format="json",
                                   **auth_header(self.owner_token))
        self.assertEqual(response.status_code, 200)
        items = response.data["shared_by_me"]
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["approved_revision"], 2)

    def test_revoke_grant_via_api_writes_ledger(self):
        grant = self._grant()
        response = self.client.post(
            f"/api/v1/privacy/grants/mood_entry/{grant.item_id}/revoke",
            {"recipient_id": str(self.recipient.pk)}, format="json",
            **auth_header(self.owner_token))
        self.assertEqual(response.status_code, 200)
        grant.refresh_from_db()
        self.assertIsNotNone(grant.revoked_at)
        self.assertTrue(DeletionLedgerEvent.objects.filter(
            event_type=DeletionLedgerEvent.EVENT_GRANT_REVOKED).exists())

    def test_revoke_by_stranger_404(self):
        grant = self._grant()
        response = self.client.post(
            f"/api/v1/privacy/grants/mood_entry/{grant.item_id}/revoke",
            {"recipient_id": str(self.recipient.pk)}, format="json",
            **auth_header(self.stranger_token))
        self.assertEqual(response.status_code, 404)
        grant.refresh_from_db()
        self.assertIsNone(grant.revoked_at)

    def test_deletion_detail_owner_only_no_admin_bypass(self):
        service = DeletionService()
        result = service.request_deletion(user=self.owner, categories=["mood"])
        owner_view = self.client.get(
            f"/api/v1/privacy/deletion-requests/{result['request_id']}",
            format="json", **auth_header(self.owner_token))
        self.assertEqual(owner_view.status_code, 200)
        admin_view = self.client.get(
            f"/api/v1/privacy/deletion-requests/{result['request_id']}",
            format="json", **auth_header(self.admin_token))
        self.assertEqual(admin_view.status_code, 404,
                         "is_staff/superuser must not bypass owner ACL")
        stranger_view = self.client.get(
            f"/api/v1/privacy/deletion-requests/{result['request_id']}",
            format="json", **auth_header(self.stranger_token))
        self.assertEqual(stranger_view.status_code, 404)

    def test_mass_assignment_on_deletion_request(self):
        response = self.client.post("/api/v1/privacy/deletion-requests",
                                    {"categories": ["mood"],
                                     "status": "completed",
                                     "completed_at": "2020-01-01"},
                                    format="json", **auth_header(self.owner_token))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["code"], "input_invalid")

    def test_consent_withdraw_fail_closed_without_port(self):
        from ..services.consent import ProductionConsentWriter

        privacy_ports.reset_ports()  # simulate the unwired branch
        try:
            response = self.client.post(
                "/api/v1/privacy/consents/research/withdraw", {}, format="json",
                **auth_header(self.owner_token))
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.data["error"]["code"],
                             "module_unavailable")
        finally:
            privacy_ports.register_consent_writer(ProductionConsentWriter())

    def test_consent_withdraw_wired_answers_200_decisively(self):
        from family_bridge_features.f01_identity.models import ConsentRecord
        from family_bridge_features.f01_identity.services.identity import record_consent
        from ..services.consent import ProductionConsentWriter

        privacy_ports.register_consent_writer(ProductionConsentWriter())
        record_consent(user=self.owner, purpose="research",
                       policy_version="research-v1", decision="accepted")
        response = self.client.post(
            "/api/v1/privacy/consents/research/withdraw", {}, format="json",
            **auth_header(self.owner_token))
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["withdrawn"])
        latest = ConsentRecord.latest_active(self.owner.pk, "research")
        self.assertIsNotNone(latest, "withdrawal history is preserved")
        self.assertIsNotNone(latest.withdrawn_at)
        from family_bridge_features.f01_identity.services.identity import has_active_consent
        self.assertFalse(has_active_consent(self.owner.pk, "research"))
        self.assertTrue(DeletionLedgerEvent.objects.filter(
            event_type=DeletionLedgerEvent.EVENT_CONSENT_WITHDRAWN).exists())
