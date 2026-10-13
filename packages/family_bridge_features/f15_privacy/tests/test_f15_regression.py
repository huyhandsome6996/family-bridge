"""F15 regression tests for the independent-review findings R01–R12 (PR #27).

These mirror the reviewer's independent acceptance suite (14 cases): each
test reproduces a finding on the OLD code and pins the FIXED behavior. They
run inside the feature-lab harness on the production composition (real F01
sessions, real F07/F08/F14 tables) — synthetic data only, isolated DB.
"""

import datetime as dt
import uuid
from unittest.mock import patch

from django.utils import timezone
from rest_framework.test import APIClient

from ..models import DeletionLedgerEvent, DeletionRequest
from ..services import ports
from ..services.deletion import DeletionService
from ..services.revocation import revoke_connection_with_privacy
from .test_f15_wiring import F15WiringTestCase


class _RegressionBase(F15WiringTestCase):
    """Reviewer-suite helpers on top of the real-wiring base."""

    def setUp(self):
        super().setUp()
        self.other_party = self._make_user("f15-other-party")

    def client_for(self, user):
        client = APIClient()
        client.credentials(**self._auth(self._make_session(user)))
        return client


class ConsentWithdrawalRegressionTests(_RegressionBase):
    """R01/R02: withdrawal is purpose-scoped and atomic with the ledger."""

    def test_withdraw_does_not_reactivate_earlier_consent_version(self):
        from family_bridge_features.f01_identity.services.identity import (
            has_active_consent, record_consent,
        )

        record_consent(user=self.owner, purpose="ai_processing",
                       policy_version="v1", decision="accepted",
                       now=timezone.now() - dt.timedelta(minutes=1))
        record_consent(user=self.owner, purpose="ai_processing",
                       policy_version="v2", decision="accepted",
                       now=timezone.now())
        r = self.client_for(self.owner).post(
            "/api/v1/privacy/consents/ai_processing/withdraw", {},
            format="json")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data["withdrawn"])
        self.assertFalse(
            has_active_consent(self.owner.pk, "ai_processing"),
            "older acceptance must not revive after withdrawing latest")

    def test_explicit_accept_after_withdrawal_is_honored(self):
        from family_bridge_features.f01_identity.services.identity import (
            has_active_consent, record_consent,
        )

        record_consent(user=self.owner, purpose="ai_processing",
                       policy_version="v1", decision="accepted")
        record_consent(user=self.owner, purpose="ai_processing",
                       policy_version="v2", decision="accepted")
        self.client_for(self.owner).post(
            "/api/v1/privacy/consents/ai_processing/withdraw", {},
            format="json")
        self.assertFalse(has_active_consent(self.owner.pk, "ai_processing"))
        # A NEW explicit accept after the withdrawal is the user's decision:
        # it stays active (WF-17) — the withdrawal must not act as a ban.
        record_consent(user=self.owner, purpose="ai_processing",
                       policy_version="v3", decision="accepted")
        self.assertTrue(has_active_consent(self.owner.pk, "ai_processing"))

    def test_consent_and_ledger_are_atomic(self):
        from family_bridge_features.f01_identity.services.identity import (
            has_active_consent, record_consent,
        )

        record_consent(user=self.owner, purpose="ai_processing",
                       policy_version="v1", decision="accepted")
        with patch("family_bridge_features.f15_privacy.api."
                   "DeletionLedgerEvent.objects.create",
                   side_effect=RuntimeError("synthetic ledger outage")):
            with self.assertRaises(RuntimeError):
                self.client_for(self.owner).post(
                    "/api/v1/privacy/consents/ai_processing/withdraw", {},
                    format="json")
        self.assertTrue(
            has_active_consent(self.owner.pk, "ai_processing"),
            "failed ledger append must roll back consent withdrawal")


class RevocationAndReplayRegressionTests(_RegressionBase):
    """R05/R08: revocation scope is complete, replayed exactly, fail-closed."""

    def test_restore_connection_revokes_connection_row(self):
        from family_bridge_features.f01_identity.models import Connection

        connection = self._make_connection(user_a=self.owner,
                                           user_b=self.recipient)
        revoke_connection_with_privacy(actor=self.owner,
                                       connection_id=str(connection.pk))
        Connection.objects.filter(pk=connection.pk).update(
            status="active", revoked_at=None)
        result = DeletionService.replay_ledger_for_restore(
            target_user_id=str(self.owner.pk))
        connection.refresh_from_db()
        self.assertFalse(result["incomplete"])
        self.assertEqual(
            connection.status, "revoked",
            "replay must undo restored active connection, not only grants")

    def test_replay_truncated_grant_refs_cannot_report_complete(self):
        DeletionLedgerEvent.objects.create(
            target_user_id=str(self.owner.pk), actor_ref="synthetic",
            event_type=DeletionLedgerEvent.EVENT_CONNECTION_REVOKED,
            payload={"connection_id": "synthetic-id", "generation": 1,
                     "grant_refs": [], "grant_refs_truncated": True})
        result = DeletionService.replay_ledger_for_restore(
            target_user_id=str(self.owner.pk))
        self.assertTrue(result["incomplete"],
                        "truncated references are incomplete evidence")

    def test_disconnect_many_grants_fits_ledger_payload_bound(self):
        connection = self._make_connection(user_a=self.owner,
                                           user_b=self.recipient)
        for _ in range(40):
            entry = self._make_mood_entry(owner=self.owner)
            self._make_mood_share(owner=self.owner, recipient=self.recipient,
                                  entry=entry, connection=connection)
        revoke_connection_with_privacy(actor=self.owner,
                                       connection_id=str(connection.pk))
        connection.refresh_from_db()
        self.assertEqual(connection.status, "revoked",
                         "a normal 40-item relationship must be unlinkable")

    def test_disconnect_50_grants_fits_ledger_payload_bound(self):
        connection = self._make_connection(user_a=self.owner,
                                           user_b=self.recipient)
        for _ in range(50):
            entry = self._make_mood_entry(owner=self.owner)
            self._make_mood_share(owner=self.owner, recipient=self.recipient,
                                  entry=entry, connection=connection)
        revoke_connection_with_privacy(actor=self.owner,
                                       connection_id=str(connection.pk))
        connection.refresh_from_db()
        self.assertEqual(connection.status, "revoked")

    def test_reconnect_grants_of_other_connection_not_touched_by_replay(self):
        """R05/R08: replay re-revokes EXACTLY the revoked connection's
        generation — a NEW connection's grants (reconnect) stay untouched."""
        connection = self._make_connection(user_a=self.owner,
                                           user_b=self.recipient)
        entry = self._make_mood_entry(owner=self.owner)
        old_share = self._make_mood_share(owner=self.owner,
                                          recipient=self.recipient,
                                          entry=entry, connection=connection)
        revoke_connection_with_privacy(actor=self.owner,
                                       connection_id=str(connection.pk))
        # Reconnect: NEW connection row at generation 2 with its own grant.
        connection2 = self._make_connection(user_a=self.owner,
                                            user_b=self.recipient,
                                            generation=2)
        entry2 = self._make_mood_entry(owner=self.owner)
        new_share = self._make_mood_share(owner=self.owner,
                                          recipient=self.recipient,
                                          entry=entry2, connection=connection2,
                                          generation=2)
        # Simulate backup restore of BOTH grant rows (unrevoked).
        from family_bridge_features.f07_mood.models import MoodShare

        MoodShare.objects.update(revoked_at=None)
        DeletionService.replay_ledger_for_restore(
            target_user_id=str(self.owner.pk))
        old_share.refresh_from_db()
        new_share.refresh_from_db()
        self.assertIsNotNone(old_share.revoked_at,
                             "the revoked connection's grant must re-die")
        self.assertIsNone(new_share.revoked_at,
                          "the NEW connection's grant must survive replay")

    def test_restore_watermark_must_not_skip_out_of_order_events(self):
        now = timezone.now()
        DeletionLedgerEvent.objects.create(
            target_user_id=str(self.owner.pk), actor_ref="synthetic",
            event_type="deletion_requested", occurred_at=now, payload={})
        DeletionLedgerEvent.objects.create(
            target_user_id=str(self.owner.pk), actor_ref="synthetic",
            event_type="deletion_requested",
            occurred_at=now - dt.timedelta(minutes=1), payload={})
        first = DeletionService.replay_ledger_for_restore(
            target_user_id=str(self.owner.pk), max_events=1)
        second = DeletionService.replay_ledger_for_restore(
            target_user_id=str(self.owner.pk), max_events=1,
            after_seq=first["next_after_seq"])
        self.assertEqual(first["events_total"] + second["events_total"], 2,
                         "time order combined with seq watermark must not "
                         "drop unapplied events")


class DeletionWorkflowRegressionTests(_RegressionBase):
    """R04/R06/R07/R09/R12: workflow recovery, scope, wiring, pagination."""

    def test_overview_reaches_all_125_grants(self):
        connection = self._make_connection(user_a=self.owner,
                                           user_b=self.recipient)
        for _ in range(125):
            entry = self._make_mood_entry(owner=self.owner)
            self._make_mood_share(owner=self.owner, recipient=self.recipient,
                                  entry=entry, connection=connection)
        client = self.client_for(self.owner)
        seen = set()
        cursor = None
        for _ in range(10):
            query = {"limit": 20}
            if cursor:
                query["cursor"] = cursor
            r = client.get("/api/v1/privacy/overview", query)
            self.assertEqual(r.status_code, 200)
            seen.update(g["share_id"] for g in r.data["shared_by_me"])
            if not r.data["has_more"]:
                break
            cursor = r.data["next_cursor"]
        self.assertEqual(len(seen), 125,
                         "pagination must not silently cap a domain at 100")

    def test_handler_actor_reaches_service_verification(self):
        owner_r = DeletionService().request_deletion(user=self.owner,
                                                     categories=["mood"])
        handler_id = str(self.stranger.pk)
        calls = []

        class ExactActorAuthorizer:
            def authorize(self, *, actor_id, action, request_id):
                calls.append(actor_id)
                return actor_id == handler_id

        ports.register_handler_authorizer(ExactActorAuthorizer())
        r = self.client_for(self.stranger).post(
            "/api/v1/privacy/deletion-requests/"
            + owner_r["request_id"] + "/verify", {}, format="json")
        self.assertEqual(r.status_code, 200,
                         "authorized handler must not be re-authorized as "
                         "empty actor")
        self.assertEqual(calls, [handler_id, handler_id])

    def test_processing_can_recover_worker_crash(self):
        entry = self._make_mood_entry(owner=self.owner)
        service = DeletionService()
        req = service.request_deletion(user=self.owner, categories=["mood"])

        class SyntheticAuthorizer:
            def authorize(self, **kwargs):
                return True

        service.verify_request(request_id=req["request_id"],
                               verifier_ref="synthetic",
                               authorizer=SyntheticAuthorizer())
        with patch.object(service, "_finish_processing",
                          side_effect=RuntimeError(
                              "synthetic worker interruption")):
            with self.assertRaises(RuntimeError):
                service.process_request(request_id=req["request_id"])
        row = DeletionRequest.objects.get(pk=req["request_id"])
        self.assertEqual(row.status, "processing")
        resumed = service.process_request(request_id=req["request_id"])
        self.assertEqual(resumed.status, "completed",
                         "processing interruption must have a guarded "
                         "recovery path")
        self.assertTrue(
            DeletionRequest.objects.filter(
                pk=req["request_id"],
                status="completed").exists())
        self.assertFalse(
            DeletionRequest.objects.filter(
                pk=req["request_id"], status="processing").exists(),
            "request must not stay stuck in processing after recovery")

    def test_restore_preserves_original_deletion_cutoff(self):
        from family_bridge_features.f08_journal.models import JournalPage

        old_at = timezone.now() - dt.timedelta(minutes=5)
        cutoff = timezone.now() - dt.timedelta(minutes=3)
        newer_at = timezone.now() - dt.timedelta(minutes=1)
        old = JournalPage.objects.create(owner=self.owner,
                                         title="synthetic-old",
                                         content="synthetic")
        new = JournalPage.objects.create(owner=self.owner,
                                         title="synthetic-new",
                                         content="synthetic")
        JournalPage.objects.filter(pk=old.pk).update(created_at=old_at)
        JournalPage.objects.filter(pk=new.pk).update(created_at=newer_at)

        class FrozenClock:
            def now(self):
                return cutoff

        class SyntheticAuthorizer:
            def authorize(self, **kwargs):
                return True

        service = DeletionService(clock=FrozenClock())
        req = service.request_deletion(user=self.owner, categories=["journal"])
        service.verify_request(request_id=req["request_id"],
                               verifier_ref="synthetic",
                               authorizer=SyntheticAuthorizer())
        done = service.process_request(request_id=req["request_id"])
        self.assertEqual(done.status, "completed")
        self.assertTrue(JournalPage.objects.filter(pk=new.pk).exists(),
                        "new page outside frozen scope initially survives")
        replay = DeletionService.replay_ledger_for_restore(
            target_user_id=str(self.owner.pk))
        self.assertFalse(replay["incomplete"])
        self.assertTrue(JournalPage.objects.filter(pk=new.pk).exists(),
                        "restore must reuse cutoff, not ledger event time")

    def test_domain_revoke_also_appends_ledger(self):
        from family_bridge_features.f07_mood.services.mood import (
            MoodShareService,
        )

        connection = self._make_connection(user_a=self.owner,
                                           user_b=self.recipient)
        entry = self._make_mood_entry(owner=self.owner)
        share = self._make_mood_share(owner=self.owner,
                                      recipient=self.recipient,
                                      entry=entry, connection=connection)
        MoodShareService().revoke(owner_id=str(self.owner.pk),
                                  share_id=str(share.pk))
        self.assertTrue(DeletionLedgerEvent.objects.filter(
            event_type="grant_revoked",
            target_user_id=str(self.owner.pk)).exists(),
            "all revoke entry points require durable events")

    def test_deletion_cursor_invalid_uuid_is_input_error(self):
        r = self.client_for(self.owner).get(
            "/api/v1/privacy/deletion-requests/list",
            {"cursor": timezone.now().isoformat() + "|not-a-uuid"})
        self.assertEqual(r.status_code, 400,
                         "malformed cursor must not crash API")

    def test_connections_deletion_does_not_delete_later_session(self):
        from family_bridge_features.f01_identity.models import (
            Session, hash_token,
        )
        from ..services.deletion_hooks import ConnectionsDeletionHook

        cutoff = timezone.now() - dt.timedelta(minutes=1)
        token = self._make_session(self.owner)
        ConnectionsDeletionHook().apply_user_deletion(
            user_id=str(self.owner.pk), requested_at=cutoff)
        self.assertTrue(
            Session.objects.filter(token_hash=hash_token(token)).exists(),
            "identity hook must obey approved cutoff")

    def test_connections_deletion_keeps_consent_and_provider_identity(self):
        """R04: the connections category no longer resets the identity
        surface (sessions/provider identities/consents are account policy,
        DEC-12/23 open)."""
        from family_bridge_features.f01_identity.models import (
            ConsentRecord, ProviderIdentity,
        )

        cutoff = timezone.now() - dt.timedelta(minutes=1)
        ProviderIdentity.objects.create(user=self.owner, provider="zalo",
                                        app_id="app", provider_subject="s1")
        ConsentRecord.objects.create(user=self.owner, purpose="service",
                                     policy_version="v1",
                                     decision="accepted")
        from ..services.deletion_hooks import ConnectionsDeletionHook

        ConnectionsDeletionHook().apply_user_deletion(
            user_id=str(self.owner.pk), requested_at=cutoff)
        self.assertTrue(ProviderIdentity.objects.filter(
            user=self.owner, provider_subject="s1").exists())
        self.assertTrue(ConsentRecord.objects.filter(
            user=self.owner, purpose="service").exists())

    def test_real_f01_revoke_endpoint_appends_ledger(self):
        """R10: the ACTUAL F01 revoke endpoint uses the privacy adapter
        (grants die + 2 per-party connection_revoked events)."""
        from family_bridge_features.f01_identity.models import (
            Connection, ConnectionInvite,
        )

        invite = ConnectionInvite.objects.create(
            inviter=self.owner, code_hash=uuid.uuid4().hex,
            relationship_kind="primary",
            expires_at=timezone.now() + dt.timedelta(hours=1))
        low, high = sorted([str(self.owner.pk), str(self.other_party.pk)])
        c = Connection.objects.create(party_low_id=low, party_high_id=high,
                                      invite=invite, status="active",
                                      relationship_kind="primary")
        r = self.client_for(self.owner).post(
            "/api/v1/connections/" + str(c.pk) + "/revoke", {},
            format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(DeletionLedgerEvent.objects.filter(
            event_type="connection_revoked").count(), 2,
            "actual endpoint must use privacy adapter")

    def test_f07_session_fallback_accepts_real_f01_session(self):
        """R10: F07 auth falls back to the real F01 SessionService when no
        lab resolver is registered."""
        from family_bridge_features.f07_mood.services import registry as f07_registry

        f07_registry.reset_registries()  # no resolver registered at all
        try:
            r = self.client_for(self.owner).get("/api/v1/mood/entries")
            self.assertEqual(r.status_code, 200,
                             "F07 must use the same real session substrate")
        finally:
            f07_registry.reset_registries()

    def test_f08_session_fallback_accepts_real_f01_session(self):
        from family_bridge_features.f08_journal.services import (
            registry as f08_registry,
        )

        f08_registry.reset_registries()
        try:
            r = self.client_for(self.owner).get("/api/v1/journal/pages")
            self.assertEqual(r.status_code, 200,
                             "F08 must use the same real session substrate")
        finally:
            f08_registry.reset_registries()
