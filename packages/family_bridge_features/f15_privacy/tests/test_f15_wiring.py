"""F15 production-wiring integration tests (K8 checklist).

These tests boot the REAL app configuration/URLs with NO lab resolver, NO
labgrants providers and NO fake ports: sessions come from F01's real
SessionService (synthetic users/sessions created through F01 models on the
test DB — that is the documented synthetic-actor evidence, NOT a provider
bypass), grants are the production adapters over F07/F08 tables, and every
port is the production composition from services.wiring.
"""

import datetime as dt
import uuid

from django.test import TestCase
from rest_framework.test import APIClient

from family_bridge_core.timeutils import UTC

from ..models import DeletionLedgerEvent, DeletionRequest
from ..services import adapters as f15_adapters
from ..services import ports as privacy_ports
from ..services import registry as grant_registry
from ..services import sessions as f15_sessions
from ..services.deletion import DeletionService
from ..services.revocation import revoke_connection_with_privacy
from ..services.wiring import configure_production_wiring


def _allow_all_authorizer():
    from ..services.verification import AdminCapabilityAuthorizer  # noqa: F401

    class AllowAll:
        def authorize(self, *, actor_id, action, request_id):
            return True

    return AllowAll()


class F15WiringTestCase(TestCase):
    """Boots the real wiring; NO test fixtures registered as production."""

    def setUp(self):
        super().setUp()
        grant_registry.reset_registries()
        privacy_ports.reset_ports()
        f15_sessions.reset_resolver()
        configure_production_wiring(force=True)
        self.owner = self._make_user("f15-owner")
        self.recipient = self._make_user("f15-recipient")
        self.stranger = self._make_user("f15-stranger")

    def tearDown(self):
        privacy_ports.reset_ports()
        f15_sessions.reset_resolver()
        grant_registry.reset_registries()
        super().tearDown()

    # -- helpers -----------------------------------------------------------------
    @staticmethod
    def _make_user(name: str):
        from labusers.models import User

        return User.objects.create(username=name)

    def _make_session(self, user) -> str:
        from family_bridge_features.f01_identity.models import Session, hash_token

        raw = "wired-" + uuid.uuid4().hex
        Session.objects.create(
            user=user, token_hash=hash_token(raw),
            expires_at=dt.datetime.now(tz=UTC) + dt.timedelta(hours=1))
        return raw

    def _make_connection(self, *, user_a, user_b, generation: int = 1,
                         status: str = "active"):
        from family_bridge_features.f01_identity.models import (
            CONNECTION_ACTIVE, Connection, ConnectionInvite,
        )

        invite = ConnectionInvite.objects.create(
            inviter=user_a, code_hash=uuid.uuid4().hex,
            relationship_kind="primary",
            expires_at=dt.datetime.now(tz=UTC) + dt.timedelta(hours=1))
        low, high = sorted([str(user_a.pk), str(user_b.pk)])
        return Connection.objects.create(
            party_low_id=low, party_high_id=high, invite=invite,
            relationship_kind="primary",
            status=status if status == CONNECTION_ACTIVE else status,
            generation=generation)

    def _make_mood_entry(self, *, owner, revision: int = 1):
        from family_bridge_features.f07_mood.models import MoodEntry

        entry = MoodEntry.objects.create(
            owner=owner, entry_date=dt.date(2026, 10, 13) + dt.timedelta(
                days=MoodEntry.objects.filter(owner=owner).count()),
            emotion="ok", note="synthetic")
        if revision != 1:
            MoodEntry.objects.filter(pk=entry.pk).update(revision=revision)
            entry.refresh_from_db()
        return entry

    def _make_mood_share(self, *, owner, recipient, entry, generation: int = 1,
                         connection=None, approved_revision: int = None,
                         revoked: bool = False):
        from family_bridge_features.f07_mood.models import MoodShare

        return MoodShare.objects.create(
            entry=entry, owner=owner, recipient=recipient,
            approved_revision=approved_revision or entry.revision,
            connection_id=str(connection.id) if connection else "",
            connection_generation=generation,
            revoked_at=dt.datetime.now(tz=UTC) if revoked else None)

    def _auth(self, raw_token: str) -> dict:
        return {"HTTP_AUTHORIZATION": f"Bearer {raw_token}"}


class SessionWiringTests(F15WiringTestCase):
    """K8-1: real F01 sessions authenticate the REAL F15 app; bad sessions
    are denied. No lab resolver, no make_session anywhere in this class."""

    def test_real_session_authenticates_and_overview_works(self):
        token = self._make_session(self.owner)
        client = APIClient()
        response = client.get("/api/v1/privacy/overview", **self._auth(token))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["shared_by_me"], [])
        self.assertEqual(response.data["connections"], [])
        self.assertFalse(response.data["has_more"])

    def test_expired_session_denied(self):
        from family_bridge_features.f01_identity.models import Session, hash_token

        raw = "wired-expired-" + uuid.uuid4().hex
        Session.objects.create(
            user=self.owner, token_hash=hash_token(raw),
            expires_at=dt.datetime.now(tz=UTC) - dt.timedelta(minutes=5))
        client = APIClient()
        response = client.get("/api/v1/privacy/overview", **self._auth(raw))
        self.assertEqual(response.status_code, 401)

    def test_revoked_session_denied(self):
        from family_bridge_features.f01_identity.models import Session, hash_token

        raw = "wired-revoked-" + uuid.uuid4().hex
        session = Session.objects.create(
            user=self.owner, token_hash=hash_token(raw),
            expires_at=dt.datetime.now(tz=UTC) + dt.timedelta(hours=1))
        session.revoke()
        client = APIClient()
        response = client.get("/api/v1/privacy/overview", **self._auth(raw))
        self.assertEqual(response.status_code, 401)

    def test_unknown_token_denied_401_with_challenge(self):
        client = APIClient()
        response = client.get("/api/v1/privacy/overview",
                              **self._auth("not-a-real-token"))
        self.assertEqual(response.status_code, 401)


class GrantAdapterWiringTests(F15WiringTestCase):
    """K8-2: production adapters over the real F07 table; per-item scope;
    stale revision; reader availability; reconnect (new generation) denies."""

    def _share_with_connection(self, *, generation: int = 1):
        entry = self._make_mood_entry(owner=self.owner)
        connection = self._make_connection(user_a=self.owner,
                                           user_b=self.recipient,
                                           generation=generation)
        share = self._make_mood_share(owner=self.owner, recipient=self.recipient,
                                      entry=entry, connection=connection,
                                      generation=generation)
        return entry, connection, share

    def test_share_x_does_not_unlock_y(self):
        entry_x, connection, share_x = self._share_with_connection()
        entry_y = self._make_mood_entry(owner=self.owner)
        self.assertTrue(grant_registry.can_view_item(
            owner_id=str(self.owner.pk), item_type="mood_entry",
            item_id=str(entry_x.pk), recipient_id=str(self.recipient.pk),
            revision=entry_x.revision))
        self.assertFalse(grant_registry.can_view_item(
            owner_id=str(self.owner.pk), item_type="mood_entry",
            item_id=str(entry_y.pk), recipient_id=str(self.recipient.pk),
            revision=entry_y.revision))

    def test_recipient_reads_valid_scope_stranger_denied(self):
        entry, connection, share = self._share_with_connection()
        self.assertTrue(grant_registry.can_view_item(
            owner_id=str(self.owner.pk), item_type="mood_entry",
            item_id=str(entry.pk), recipient_id=str(self.recipient.pk),
            revision=entry.revision))
        self.assertFalse(grant_registry.can_view_item(
            owner_id=str(self.owner.pk), item_type="mood_entry",
            item_id=str(entry.pk), recipient_id=str(self.stranger.pk),
            revision=entry.revision))

    def test_stale_revision_denied(self):
        entry, connection, share = self._share_with_connection()
        self.assertFalse(grant_registry.can_view_item(
            owner_id=str(self.owner.pk), item_type="mood_entry",
            item_id=str(entry.pk), recipient_id=str(self.recipient.pk),
            revision=entry.revision + 1))

    def test_same_pair_new_generation_denies_old_grant(self):
        """Unlink + reconnect creates a NEW generation: the old grant must
        NOT revive (FL-05/WF-04 terminal semantics)."""
        entry, connection, share = self._share_with_connection(generation=1)
        self.assertTrue(grant_registry.can_view_item(
            owner_id=str(self.owner.pk), item_type="mood_entry",
            item_id=str(entry.pk), recipient_id=str(self.recipient.pk),
            revision=entry.revision))
        # Unlink, then reconnect: new connection row for the same pair,
        # generation 2 (generation increments; old grants stay bound to g1).
        connection.status = "revoked"
        connection.save(update_fields=["status"])
        self._make_connection(user_a=self.owner, user_b=self.recipient,
                              generation=2)
        self.assertFalse(
            grant_registry.can_view_item(
                owner_id=str(self.owner.pk), item_type="mood_entry",
                item_id=str(entry.pk), recipient_id=str(self.recipient.pk),
                revision=entry.revision),
            "old grant must stay revoked after reconnect (new generation)")

    def test_reader_missing_fails_closed(self):
        entry, connection, share = self._share_with_connection()
        privacy_ports.reset_ports()  # no reader wired at all
        self.assertFalse(grant_registry.can_view_item(
            owner_id=str(self.owner.pk), item_type="mood_entry",
            item_id=str(entry.pk), recipient_id=str(self.recipient.pk),
            revision=entry.revision))
        configure_production_wiring(force=True)

    def test_journal_page_provider_wired(self):
        from family_bridge_features.f08_journal.models import JournalPage, JournalShare

        page = JournalPage.objects.create(
            owner=self.owner, topic_code="feelings", title="synthetic",
            content="synthetic")
        connection = self._make_connection(user_a=self.owner,
                                           user_b=self.recipient)
        JournalShare.objects.create(
            page=page, owner=self.owner, recipient=self.recipient,
            approved_revision=page.revision, connection_id=str(connection.id),
            connection_generation=connection.generation)
        self.assertTrue(grant_registry.can_view_item(
            owner_id=str(self.owner.pk), item_type="journal_page",
            item_id=str(page.pk), recipient_id=str(self.recipient.pk),
            revision=page.revision))

    def test_overview_lists_grants_with_cursor_no_loss(self):
        connection = self._make_connection(user_a=self.owner,
                                           user_b=self.recipient)
        for _ in range(7):
            entry = self._make_mood_entry(owner=self.owner)
            self._make_mood_share(owner=self.owner, recipient=self.recipient,
                                  entry=entry, connection=connection)
        client = APIClient()
        token = self._make_session(self.owner)
        seen = []
        cursor = ""
        for _ in range(5):  # bound the loop defensively
            path = "/api/v1/privacy/overview?limit=3" + (f"&cursor={cursor}" if cursor else "")
            response = client.get(path, **self._auth(token))
            self.assertEqual(response.status_code, 200)
            seen.extend(response.data["shared_by_me"])
            if not response.data["has_more"]:
                break
            self.assertIsNotNone(response.data["next_cursor"])
            from urllib.parse import quote
            cursor = quote(response.data["next_cursor"], safe="")
        self.assertEqual(len(seen), 7, "cursor pagination must not lose grants")
        self.assertTrue(all(item["recipient_id"] == str(self.recipient.pk)
                            for item in seen))

    def test_overview_connections_from_reader(self):
        connection = self._make_connection(user_a=self.owner,
                                           user_b=self.recipient)
        token = self._make_session(self.owner)
        client = APIClient()
        response = client.get("/api/v1/privacy/overview", **self._auth(token))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["connections"]), 1)
        row = response.data["connections"][0]
        self.assertEqual(row["connection_id"], str(connection.id))
        self.assertEqual(row["generation"], connection.generation)
        self.assertEqual(row["other_party_id"], str(self.recipient.pk))


class RevokeWiringTests(F15WiringTestCase):
    """K8-4: revoke via the F15 API writes the ledger atomically; owner-only;
    expected_revision stale -> 409; idempotent repeat."""

    def _grant(self):
        entry = self._make_mood_entry(owner=self.owner)
        connection = self._make_connection(user_a=self.owner,
                                           user_b=self.recipient)
        return entry, self._make_mood_share(
            owner=self.owner, recipient=self.recipient, entry=entry,
            connection=connection)

    def test_revoke_via_api_blocks_new_reads_and_writes_ledger(self):
        entry, share = self._grant()
        token = self._make_session(self.owner)
        client = APIClient()
        response = client.post(
            f"/api/v1/privacy/grants/mood_entry/{entry.pk}/revoke",
            {"recipient_id": str(self.recipient.pk)}, format="json",
            **self._auth(token))
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["revoked"])
        self.assertFalse(grant_registry.can_view_item(
            owner_id=str(self.owner.pk), item_type="mood_entry",
            item_id=str(entry.pk), recipient_id=str(self.recipient.pk),
            revision=entry.revision))
        self.assertTrue(DeletionLedgerEvent.objects.filter(
            event_type=DeletionLedgerEvent.EVENT_GRANT_REVOKED).exists())

    def test_revoke_by_stranger_404_no_ledger(self):
        entry, share = self._grant()
        token = self._make_session(self.stranger)
        client = APIClient()
        response = client.post(
            f"/api/v1/privacy/grants/mood_entry/{entry.pk}/revoke",
            {"recipient_id": str(self.recipient.pk)}, format="json",
            **self._auth(token))
        self.assertEqual(response.status_code, 404)
        share.refresh_from_db()
        self.assertIsNone(share.revoked_at)
        self.assertEqual(DeletionLedgerEvent.objects.filter(
            event_type=DeletionLedgerEvent.EVENT_GRANT_REVOKED).count(), 0)

    def test_expected_revision_stale_409(self):
        entry, share = self._grant()
        token = self._make_session(self.owner)
        client = APIClient()
        response = client.post(
            f"/api/v1/privacy/grants/mood_entry/{entry.pk}/revoke",
            {"recipient_id": str(self.recipient.pk), "expected_revision": 99},
            format="json", **self._auth(token))
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error"]["code"], "revision_conflict")
        share.refresh_from_db()
        self.assertIsNone(share.revoked_at)

    def test_revoke_idempotent_second_call_reports_not_revoked(self):
        entry, share = self._grant()
        token = self._make_session(self.owner)
        client = APIClient()
        path = f"/api/v1/privacy/grants/mood_entry/{entry.pk}/revoke"
        body = {"recipient_id": str(self.recipient.pk)}
        first = client.post(path, body, format="json", **self._auth(token))
        second = client.post(path, body, format="json", **self._auth(token))
        self.assertEqual(first.status_code, 200)
        self.assertTrue(first.data["revoked"])
        self.assertEqual(second.status_code, 200)
        self.assertFalse(second.data["revoked"], "second call must not lie")
        self.assertEqual(DeletionLedgerEvent.objects.filter(
            event_type=DeletionLedgerEvent.EVENT_GRANT_REVOKED).count(), 1,
            "one grant_revoked event per actual transition")


class ConnectionRevocationWiringTests(F15WiringTestCase):
    """K8-5: F01 connection revoke kills dependent grants in the same
    transaction, writes ONE ledger event per party, and reconnect does not
    revive anything."""

    def test_connection_revoke_kills_grants_both_directions(self):
        from family_bridge_features.f08_journal.models import JournalPage, JournalShare

        connection = self._make_connection(user_a=self.owner,
                                           user_b=self.recipient)
        entry = self._make_mood_entry(owner=self.owner)
        self._make_mood_share(owner=self.owner, recipient=self.recipient,
                              entry=entry, connection=connection)
        page = JournalPage.objects.create(owner=self.recipient,
                                          topic_code="feelings",
                                          title="synthetic", content="synthetic")
        JournalShare.objects.create(
            page=page, owner=self.recipient, recipient=self.owner,
            approved_revision=page.revision, connection_id=str(connection.id),
            connection_generation=connection.generation)

        summary = revoke_connection_with_privacy(actor=self.owner,
                                                 connection_id=str(connection.id))
        self.assertEqual(summary["grants_revoked"], 2)
        connection.refresh_from_db()
        self.assertEqual(connection.status, "revoked")
        share = entry.shares.get()
        self.assertIsNotNone(share.revoked_at)
        # One event per party (2), payload carries the grant refs.
        events = DeletionLedgerEvent.objects.filter(
            event_type=DeletionLedgerEvent.EVENT_CONNECTION_REVOKED)
        self.assertEqual(events.count(), 2)
        targets = set(events.values_list("target_user_id", flat=True))
        self.assertEqual(targets, {str(self.owner.pk), str(self.recipient.pk)})

    def test_reconnect_after_unlink_does_not_revive(self):
        connection = self._make_connection(user_a=self.owner,
                                           user_b=self.recipient)
        entry = self._make_mood_entry(owner=self.owner)
        self._make_mood_share(owner=self.owner, recipient=self.recipient,
                              entry=entry, connection=connection)
        revoke_connection_with_privacy(actor=self.owner,
                                       connection_id=str(connection.id))
        # Reconnect: new connection row, generation 2.
        self._make_connection(user_a=self.owner, user_b=self.recipient,
                              generation=2)
        self.assertFalse(grant_registry.can_view_item(
            owner_id=str(self.owner.pk), item_type="mood_entry",
            item_id=str(entry.pk), recipient_id=str(self.recipient.pk),
            revision=entry.revision))

    def test_revoke_twice_is_idempotent_no_event_spam(self):
        connection = self._make_connection(user_a=self.owner,
                                           user_b=self.recipient)
        revoke_connection_with_privacy(actor=self.owner,
                                       connection_id=str(connection.id))
        revoke_connection_with_privacy(actor=self.owner,
                                       connection_id=str(connection.id))
        self.assertEqual(DeletionLedgerEvent.objects.filter(
            event_type=DeletionLedgerEvent.EVENT_CONNECTION_REVOKED).count(), 2)

    def test_stranger_cannot_revoke_foreign_connection(self):
        from family_bridge_core.errors import NotFound

        connection = self._make_connection(user_a=self.owner,
                                           user_b=self.recipient)
        with self.assertRaises(NotFound):
            revoke_connection_with_privacy(actor=self.stranger,
                                           connection_id=str(connection.id))
        connection.refresh_from_db()
        self.assertEqual(connection.status, "active")


class ConsentWiringTests(F15WiringTestCase):
    """K4/K8-6: withdrawing consent CHANGES real downstream behaviour:
    F01 store + F14 research store, survey submission blocked."""

    def _grant_research_consent(self, user):
        from family_bridge_features.f01_identity.services.identity import record_consent

        record_consent(user=user, purpose="research",
                       policy_version="research-v1", decision="accepted")
        from family_bridge_features.f14_surveys.services.surveys import SurveyService

        SurveyService().set_consent(participant_id=str(user.pk),
                                    purpose="pre_post_study", decision="grant")

    def test_withdraw_research_via_api_200_and_stores_change(self):
        from family_bridge_features.f01_identity.services.identity import (
            has_active_consent,
        )
        from family_bridge_features.f14_surveys.models import (
            CONSENT_WITHDRAWN, ResearchConsent,
        )
        from family_bridge_features.f14_surveys.services.surveys import (
            SurveyService,
        )

        self._grant_research_consent(self.owner)
        self.assertTrue(has_active_consent(self.owner.pk, "research"))
        token = self._make_session(self.owner)
        client = APIClient()
        response = client.post("/api/v1/privacy/consents/research/withdraw",
                               {}, format="json", **self._auth(token))
        self.assertEqual(response.status_code, 200,
                         "wired port must answer 200 decisively")
        self.assertTrue(response.data["withdrawn"])
        self.assertFalse(has_active_consent(self.owner.pk, "research"),
                         "F01 store must change")
        f14 = ResearchConsent.objects.get(participant_id=str(self.owner.pk),
                                          purpose="pre_post_study")
        self.assertEqual(f14.status, CONSENT_WITHDRAWN, "F14 store must change")
        from family_bridge_features.f14_surveys.services.surveys import ConsentRequired
        with self.assertRaises(ConsentRequired):
            SurveyService().submit(
                participant_id=str(self.owner.pk), form_key="pre",
                form_revision=1, phase="pre", answers={})
        self.assertTrue(DeletionLedgerEvent.objects.filter(
            event_type=DeletionLedgerEvent.EVENT_CONSENT_WITHDRAWN,
            payload__purpose="research").exists())

    def test_withdraw_ai_purpose_blocks_active_consent(self):
        from family_bridge_features.f01_identity.services.identity import (
            record_consent, has_active_consent,
        )

        record_consent(user=self.owner, purpose="ai_processing",
                       policy_version="ai-v1", decision="accepted")
        token = self._make_session(self.owner)
        client = APIClient()
        response = client.post(
            "/api/v1/privacy/consents/ai_processing/withdraw", {},
            format="json", **self._auth(token))
        self.assertEqual(response.status_code, 200)
        self.assertFalse(has_active_consent(self.owner.pk, "ai_processing"))

    def test_withdraw_without_active_consent_records_declined(self):
        from family_bridge_features.f01_identity.models import ConsentRecord

        token = self._make_session(self.owner)
        client = APIClient()
        response = client.post("/api/v1/privacy/consents/service/withdraw",
                               {}, format="json", **self._auth(token))
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["withdrawn"])
        self.assertTrue(ConsentRecord.objects.filter(
            user=self.owner, purpose="service", decision="declined").exists(),
            "withdrawal of nothing must still record the explicit decision")

    def test_consent_unwired_fail_closed_503(self):
        # Simulate the unwired branch explicitly (restore wiring afterwards).
        from ..services.consent import ProductionConsentWriter

        privacy_ports.reset_ports()
        try:
            token = self._make_session(self.owner)
            client = APIClient()
            response = client.post("/api/v1/privacy/consents/research/withdraw",
                                   {}, format="json", **self._auth(token))
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.data["error"]["code"],
                             "module_unavailable")
        finally:
            privacy_ports.register_consent_writer(ProductionConsentWriter())

    def test_withdrawing_research_does_not_lock_help(self):
        from family_bridge_features.f13_help.services.directory import (
            HelpDirectoryService,
        )

        self._grant_research_consent(self.owner)
        client = APIClient()
        token = self._make_session(self.owner)
        client.post("/api/v1/privacy/consents/research/withdraw", {},
                    format="json", **self._auth(token))
        # F13 help directory stays usable regardless of consent state (DEC-08).
        directory = HelpDirectoryService().directory()
        self.assertIsInstance(directory, dict)


class _FlakyHook:
    """Simulates a transient domain failure, then performs the REAL journal
    deletion (with cutoff filtering) on retry."""
    calls = 0

    def apply_user_deletion(self, *, user_id, requested_at):
        _FlakyHook.calls += 1
        if _FlakyHook.calls == 1:
            return {"ok": False, "detail": "simulated transient failure"}
        from family_bridge_features.f08_journal.models import JournalPage

        deleted, _ = JournalPage.objects.filter(
            owner_id=str(user_id), created_at__lte=requested_at).delete()
        return {"ok": True, "detail": f"journal pages removed: {deleted}",
                "counts": {"deleted": deleted}}


class _AllowAllPort:
    def authorize(self, *, actor_id, action, request_id):
        return True


class _DenyAllPort:
    def authorize(self, *, actor_id, action, request_id):
        return False


class DeletionWorkflowWiringTests(F15WiringTestCase):
    """K5: gated handler workflow, duplicate guards, owner list recovery,
    cutoff snapshot + retry semantics on REAL domain tables."""

    def setUp(self):
        super().setUp()
        _FlakyHook.calls = 0

    def _journal_pages(self, owner, count=1):
        from family_bridge_features.f08_journal.models import JournalPage

        return [JournalPage.objects.create(
            owner=owner, topic_code="feelings", title=f"p{i}",
            content="synthetic") for i in range(count)]

    def test_handler_endpoints_fail_closed_without_authorizer(self):
        # Simulate "chưa cấu hình authorizer" một cách tường minh: trong môi
        # trường cài admin_core, wiring đã đăng ký authorizer production →
        # endpoint phải 404 cho actor thường; CONTRACT fail-closed 503 chỉ
        # áp dụng khi KHÔNG có authorizer nào — test này khẳng định đúng
        # nhánh đó bằng cách gỡ authorizer khỏi port (test-only) rồi trả lại.
        from ..services.verification import AdminCapabilityAuthorizer

        privacy_ports.reset_ports()
        try:
            service = DeletionService()
            result = service.request_deletion(user=self.owner,
                                              categories=["journal"])
            token = self._make_session(self.owner)
            client = APIClient()
            rid = result["request_id"]
            self.assertEqual(
                client.post(f"/api/v1/privacy/deletion-requests/{rid}/verify",
                            {}, format="json", **self._auth(token)).status_code,
                503)
            self.assertEqual(
                client.post(f"/api/v1/privacy/deletion-requests/{rid}/process",
                            {}, format="json", **self._auth(token)).status_code,
                503)
            row = DeletionRequest.objects.get(pk=rid)
            self.assertEqual(row.status, DeletionRequest.STATUS_REQUESTED)
        finally:
            privacy_ports.register_handler_authorizer(AdminCapabilityAuthorizer())

    def test_handler_endpoints_deny_actor_without_capability(self):
        from ..services.verification import AdminCapabilityAuthorizer

        privacy_ports.register_handler_authorizer(_DenyAllPort())
        service = DeletionService()
        result = service.request_deletion(user=self.owner, categories=["journal"])
        token = self._make_session(self.stranger)  # any non-owner actor
        client = APIClient()
        rid = result["request_id"]
        response = client.post(f"/api/v1/privacy/deletion-requests/{rid}/verify",
                               {}, format="json", **self._auth(token))
        self.assertEqual(response.status_code, 404,
                         "unauthorized handlers must not learn the request exists")
        # The OWNER also cannot verify their own request (not a handler).
        owner_response = client.post(
            f"/api/v1/privacy/deletion-requests/{rid}/verify", {}, format="json",
            **self._auth(self._make_session(self.owner)))
        self.assertEqual(owner_response.status_code, 404)

    def test_verify_then_process_completes_with_real_hooks(self):
        privacy_ports.register_handler_authorizer(_AllowAllPort())
        self._journal_pages(self.owner, 2)
        service = DeletionService()
        result = service.request_deletion(user=self.owner, categories=["journal"])
        token = self._make_session(self.owner)
        client = APIClient()
        rid = result["request_id"]
        verified = client.post(f"/api/v1/privacy/deletion-requests/{rid}/verify",
                               {"verifier_ref": "synthetic-handler"},
                               format="json", **self._auth(token))
        self.assertEqual(verified.status_code, 200)
        self.assertEqual(verified.data["status"], DeletionRequest.STATUS_VERIFIED)
        processed = client.post(f"/api/v1/privacy/deletion-requests/{rid}/process",
                                {}, format="json", **self._auth(token))
        self.assertEqual(processed.status_code, 200)
        self.assertEqual(processed.data["status"], DeletionRequest.STATUS_COMPLETED)
        self.assertEqual(processed.data["failure_detail"]["journal"]["ok"], True)

    def test_owner_only_detail_and_list_include_revision(self):
        service = DeletionService()
        result = service.request_deletion(user=self.owner, categories=["journal"])
        rid = result["request_id"]
        token = self._make_session(self.owner)
        client = APIClient()
        detail = client.get(f"/api/v1/privacy/deletion-requests/{rid}",
                            format="json", **self._auth(token))
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["revision"], 1)
        listing = client.get("/api/v1/privacy/deletion-requests/list",
                             format="json", **self._auth(token))
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(len(listing.data["results"]), 1)
        self.assertEqual(listing.data["results"][0]["request_id"], rid)
        # Other actors get an empty list, never someone else's requests.
        stranger_listing = client.get("/api/v1/privacy/deletion-requests/list",
                                      format="json",
                                      **self._auth(self._make_session(self.stranger)))
        self.assertEqual(stranger_listing.data["results"], [])

    def test_duplicate_request_reports_scope_mismatch(self):
        service = DeletionService()
        first = service.request_deletion(user=self.owner, categories=["mood"])
        second = service.request_deletion(user=self.owner,
                                          categories=["mood", "journal"])
        self.assertTrue(second["duplicate"])
        self.assertFalse(second["covers_requested_categories"],
                         "different intent must be flagged, never merged")
        self.assertEqual(first["request_id"], second["request_id"])

    def test_retry_after_hook_failure_keeps_cutoff_scope(self):
        """Hook fails -> failed_needs_action; items created AFTER the request
        cutoff survive a retry (scope never widens, K5)."""
        grant_registry.register_deletion_hook(
            "journal",
            "family_bridge_features.f15_privacy.tests.test_f15_wiring._FlakyHook")
        pages = self._journal_pages(self.owner, 2)
        service = DeletionService(clock=self._fixed_clock())
        result = service.request_deletion(user=self.owner, categories=["journal"])
        service.verify_request(request_id=result["request_id"],
                               verifier_ref="synthetic",
                               authorizer=_AllowAllPort())
        first = service.process_request(request_id=result["request_id"])
        self.assertEqual(first.status, DeletionRequest.STATUS_FAILED)
        # A NEW page created after the cutoff (out of the requested scope):
        new_page = self._journal_pages(self.owner, 1)[0]
        second = service.process_request(request_id=result["request_id"])
        self.assertEqual(second.status, DeletionRequest.STATUS_COMPLETED,
                         "retry re-runs only the failed category")
        from family_bridge_features.f08_journal.models import JournalPage
        self.assertFalse(JournalPage.objects.filter(
            pk__in=[p.pk for p in pages]).exists())
        self.assertTrue(JournalPage.objects.filter(pk=new_page.pk).exists(),
                        "item created after cutoff must survive the retry")

    def _fixed_clock(self):
        from ..services.deletion import DeletionService as _DS

        class Clock:
            def now(self):
                import datetime as _dt
                return _dt.datetime.now(tz=UTC)

        return Clock()


class RestoreReplayWiringTests(F15WiringTestCase):
    """K6: replay is fail-closed, idempotent, re-applies grant/connection/
    consent events, and never appends new domain events."""

    def test_replay_re_revokes_restored_grant(self):
        entry = self._make_mood_entry(owner=self.owner)
        connection = self._make_connection(user_a=self.owner,
                                           user_b=self.recipient)
        self._make_mood_share(owner=self.owner, recipient=self.recipient,
                              entry=entry, connection=connection)
        token = self._make_session(self.owner)
        client = APIClient()
        client.post(f"/api/v1/privacy/grants/mood_entry/{entry.pk}/revoke",
                    {"recipient_id": str(self.recipient.pk)}, format="json",
                    **self._auth(token))
        # Simulate backup restore: grant row comes back unrevoked.
        from family_bridge_features.f07_mood.models import MoodShare

        MoodShare.objects.update(revoked_at=None)
        summary = DeletionService.replay_ledger_for_restore(
            target_user_id=str(self.owner.pk))
        share = MoodShare.objects.get(entry_id=entry.pk)
        self.assertIsNotNone(share.revoked_at, "replay must re-revoke")
        self.assertFalse(summary["incomplete"])

    def test_replay_re_applies_connection_revocation_both_directions(self):
        from family_bridge_features.f08_journal.models import JournalPage, JournalShare

        connection = self._make_connection(user_a=self.owner,
                                           user_b=self.recipient)
        entry = self._make_mood_entry(owner=self.owner)
        self._make_mood_share(owner=self.owner, recipient=self.recipient,
                              entry=entry, connection=connection)
        page = JournalPage.objects.create(owner=self.recipient,
                                          topic_code="feelings",
                                          title="p", content="x")
        JournalShare.objects.create(
            page=page, owner=self.recipient, recipient=self.owner,
            approved_revision=page.revision, connection_id=str(connection.id),
            connection_generation=connection.generation)
        revoke_connection_with_privacy(actor=self.owner,
                                       connection_id=str(connection.id))
        # Backup restore revives BOTH grants.
        from family_bridge_features.f07_mood.models import MoodShare

        MoodShare.objects.update(revoked_at=None)
        JournalShare.objects.update(revoked_at=None)
        for target in {str(self.owner.pk), str(self.recipient.pk)}:
            summary = DeletionService.replay_ledger_for_restore(
                target_user_id=target)
            self.assertFalse(summary["incomplete"])
        self.assertIsNotNone(MoodShare.objects.get(entry_id=entry.pk).revoked_at)
        self.assertIsNotNone(JournalShare.objects.get(page_id=page.pk).revoked_at)

    def test_replay_re_withdraws_consent(self):
        from family_bridge_features.f01_identity.services.identity import (
            record_consent, has_active_consent,
        )

        record_consent(user=self.owner, purpose="research",
                       policy_version="research-v1", decision="accepted")
        token = self._make_session(self.owner)
        client = APIClient()
        client.post("/api/v1/privacy/consents/research/withdraw", {},
                    format="json", **self._auth(token))
        # "Restore" the consent row back to accepted:
        from family_bridge_features.f01_identity.models import ConsentRecord

        ConsentRecord.objects.update(withdrawn_at=None)
        summary = DeletionService.replay_ledger_for_restore(
            target_user_id=str(self.owner.pk))
        self.assertFalse(has_active_consent(self.owner.pk, "research"),
                         "replay must re-withdraw consent from the ledger")
        self.assertFalse(summary["incomplete"])

    def test_replay_missing_provider_is_incomplete_fail_closed(self):
        token = self._make_session(self.owner)
        client = APIClient()
        # Revoke on an item_type with NO provider: API answers 503; craft the
        # ledger event directly to exercise the replay failure path.
        DeletionLedgerEvent.objects.create(
            target_user_id=str(self.owner.pk), actor_ref="test",
            event_type=DeletionLedgerEvent.EVENT_GRANT_REVOKED,
            payload={"item_type": "messages", "item_id": str(uuid.uuid4()),
                     "recipient_id": str(self.recipient.pk)})
        summary = DeletionService.replay_ledger_for_restore(
            target_user_id=str(self.owner.pk))
        self.assertTrue(summary["incomplete"],
                        "missing provider must fail the replay, not skip silently")
        self.assertTrue(any(f["reason"] == "provider_missing"
                            for f in summary["failures"]))

    def test_replay_truncation_reports_incomplete(self):
        for i in range(3):
            DeletionLedgerEvent.objects.create(
                target_user_id=str(self.owner.pk), actor_ref="test",
                event_type=DeletionLedgerEvent.EVENT_DELETION_REQUESTED,
                payload={"request_id": str(uuid.uuid4())})
        summary = DeletionService.replay_ledger_for_restore(
            target_user_id=str(self.owner.pk), max_events=2)
        self.assertTrue(summary["truncated"])
        self.assertTrue(summary["incomplete"])
        self.assertIsNotNone(summary["next_after_seq"])

    def test_replay_is_idempotent_no_event_explosion(self):
        entry = self._make_mood_entry(owner=self.owner)
        connection = self._make_connection(user_a=self.owner,
                                           user_b=self.recipient)
        self._make_mood_share(owner=self.owner, recipient=self.recipient,
                              entry=entry, connection=connection)
        revoke_connection_with_privacy(actor=self.owner,
                                       connection_id=str(connection.id))
        first = DeletionService.replay_ledger_for_restore(
            target_user_id=str(self.owner.pk))
        count_after_first = DeletionLedgerEvent.objects.count()
        second = DeletionService.replay_ledger_for_restore(
            target_user_id=str(self.owner.pk))
        self.assertEqual(DeletionLedgerEvent.objects.count(),
                         count_after_first,
                         "replay must never append new domain events")
        self.assertFalse(second["incomplete"])


# ===========================================================================
# P1-1 (QA-1) — quyền sở hữu slot registry theo THỨ TỰ BOOT production
# ===========================================================================
class ProductionBootOrderSlotOwnershipTests(TestCase):
    """F15 CHỦ slot khi có mặt trong build; f07 chỉ giữ fallback per-item.

    Boot production thật chạy f07_mood.ready() TRƯỚC f15_privacy.ready()
    (thứ tự INSTALLED_APPS). Lỗi cũ: f07 đăng ký mood_entry vô điều kiện →
    guard all-or-nothing của F15 thấy registry khác rỗng → bỏ qua CẢ khối →
    journal_page không bao giờ được đăng ký và mood_entry rơi vào provider
    F07 (không cursor, không expected_revision). Test này mô phỏng ĐÚNG thứ
    tự boot đó: registry chỉ được reset ĐÚNG 1 LẦN ở đầu (tương đương một
    process mới), KHÔNG reset giữa hai bước ready — đúng kịch bản từng nuốt
    khối F15."""

    def test_full_boot_registers_both_item_types_through_f15_wrapper(self):
        from django.apps import apps

        # Build dưới test dùng INSTALLED_APPS thật, đầy đủ f07 + f08 + f15.
        self.assertTrue(apps.is_installed(
            "family_bridge_features.f07_mood"))
        self.assertTrue(apps.is_installed(
            "family_bridge_features.f08_journal"))
        self.assertTrue(apps.is_installed(
            "family_bridge_features.f15_privacy"))

        grant_registry.reset_registries()  # đúng 1 lần: trạng thái process mới
        try:
            # Thứ tự boot production: f07 chạy TRƯỚC, f15 chạy SAU — không
            # reset registry ở giữa (đây chính là kịch bản lỗi cũ).
            from family_bridge_features.f07_mood.apps import (
                wire_production_ports,
            )
            f07_report = wire_production_ports()
            configure_production_wiring(force=True)

            item_types = grant_registry.registered_item_types()
            self.assertIn("mood_entry", item_types)
            self.assertIn("journal_page", item_types)

            # mood_entry phải đi qua revocation wrapper của F15 (adapter trên
            # bảng MoodShare: revoke nhận expected_revision, list nhận cursor)
            # — KHÔNG phải provider F07 không tham số như trạng thái lỗi.
            mood_provider = grant_registry.get_grant_provider("mood_entry")
            self.assertIs(mood_provider, f15_adapters.mood_entry_provider)
            self.assertTrue(grant_registry.provider_accepts(
                mood_provider, "revoke_grant", "expected_revision"))
            self.assertTrue(grant_registry.provider_accepts(
                mood_provider, "list_grants", "after_created_at"))
            self.assertIs(grant_registry.get_grant_provider("journal_page"),
                          f15_adapters.journal_page_provider)

            # Hook "mood" là hook hợp nhất của F15 (cutoff + revoke
            # received-grants), không phải bản F07 đăng ký trước boot.
            hook = grant_registry.get_deletion_hook("mood")
            self.assertIsNotNone(hook)
            from ..services.deletion_hooks import MoodDeletionHook
            instance = hook() if isinstance(hook, type) else hook
            self.assertIsInstance(instance, MoodDeletionHook)

            # Report của f07 trung thực về TRẠNG THÁI slot (đã được wire bởi
            # chủ sở hữu F15), không giả "tôi đã đăng ký" khi chỉ là fallback.
            self.assertTrue(f07_report["connection_reader"])
            self.assertTrue(f07_report["grant_provider"])
            self.assertTrue(f07_report["deletion_hook"])
        finally:
            # Trả lại trạng thái production wiring cho test khác; không để
            # lại registry rỗng giữa các module test.
            configure_production_wiring(force=True)


# ===========================================================================
# P1-2 (QA-1) — hook xoá "mood" hợp nhất: cutoff F15 + revoke received-grants
# ===========================================================================
class MoodDeletionHookCutoffWiringTests(F15WiringTestCase):
    """Hook "mood" mà production resolves (qua wiring) phải tôn trọng cutoff
    của request — cùng hợp đồng với hook "ai" sau fix Task 2-a và các hook
    F15 chuẩn (style test_f04_deletion.CutoffScopeDeletionTests): chỉ row tạo
    TRƯỚC cutoff nằm trong phạm vi; retry/replay với CÙNG cutoff không bao
    giờ nới phạm vi; thiếu/sai cutoff raise ValueError (fail-loud)."""

    def _resolved_hook(self):
        hook = grant_registry.get_deletion_hook("mood")
        self.assertIsNotNone(hook, "category 'mood' phải có hook sau wiring")
        return hook() if isinstance(hook, type) else hook

    def _age(self, row, *, created_at):
        row.__class__.objects.filter(pk=row.pk).update(created_at=created_at)
        row.refresh_from_db()

    def test_entries_and_received_grants_created_after_cutoff_survive(self):
        from family_bridge_features.f07_mood.models import MoodEntry

        cutoff = dt.datetime.now(tz=UTC)
        old_entry = self._make_mood_entry(owner=self.owner)
        new_entry = self._make_mood_entry(owner=self.owner)
        self._age(old_entry, created_at=cutoff - dt.timedelta(hours=1))
        self._age(new_entry, created_at=cutoff + dt.timedelta(hours=1))
        # received grants: entry của NGƯỜI KHÁC share cho owner (bản F07);
        # hai entry khác nhau vì (entry, recipient, approved_revision) unique.
        stranger_entry_old = self._make_mood_entry(owner=self.stranger)
        stranger_entry_new = self._make_mood_entry(owner=self.stranger)
        received_old = self._make_mood_share(
            owner=self.stranger, recipient=self.owner,
            entry=stranger_entry_old)
        received_new = self._make_mood_share(
            owner=self.stranger, recipient=self.owner,
            entry=stranger_entry_new)
        self._age(received_old, created_at=cutoff - dt.timedelta(hours=1))
        self._age(received_new, created_at=cutoff + dt.timedelta(hours=1))

        outcome = self._resolved_hook().apply_user_deletion(
            user_id=str(self.owner.pk), requested_at=cutoff)

        self.assertTrue(outcome["ok"])
        self.assertIn("entries deleted=1", outcome["detail"])
        self.assertIn("received grants revoked=1", outcome["detail"])
        self.assertFalse(MoodEntry.objects.filter(pk=old_entry.pk).exists())
        self.assertTrue(MoodEntry.objects.filter(pk=new_entry.pk).exists(),
                        "entry tạo SAU cutoff phải sống sót")
        received_old.refresh_from_db()
        received_new.refresh_from_db()
        self.assertIsNotNone(received_old.revoked_at,
                             "grant nhận TRƯỚC cutoff bị revoke (F07 behavior)")
        self.assertIsNone(received_new.revoked_at,
                          "grant nhận SAU cutoff không được động tới")

    def test_retry_with_same_cutoff_never_widens_scope(self):
        cutoff = dt.datetime.now(tz=UTC)
        old_entry = self._make_mood_entry(owner=self.owner)
        self._age(old_entry, created_at=cutoff - dt.timedelta(hours=1))
        hook = self._resolved_hook()
        first = hook.apply_user_deletion(user_id=str(self.owner.pk),
                                         requested_at=cutoff)
        self.assertTrue(first["ok"])

        # Dữ liệu MỚI sinh ra sau deletion (created_at > cutoff): entry của
        # owner + grant owner NHẬN từ người khác.
        fresh_entry = self._make_mood_entry(owner=self.owner)
        self._age(fresh_entry, created_at=cutoff + dt.timedelta(hours=2))
        stranger_entry = self._make_mood_entry(owner=self.stranger)
        fresh_received = self._make_mood_share(
            owner=self.stranger, recipient=self.owner, entry=stranger_entry)
        self._age(fresh_received,
                  created_at=cutoff + dt.timedelta(hours=2))

        # Replay/retry CÙNG request (CÙNG cutoff): không được nới phạm vi.
        second = hook.apply_user_deletion(user_id=str(self.owner.pk),
                                          requested_at=cutoff)
        self.assertTrue(second["ok"])
        self.assertIn("entries deleted=0", second["detail"])
        self.assertIn("received grants revoked=0", second["detail"])
        fresh_entry.refresh_from_db()
        fresh_received.refresh_from_db()
        self.assertIsNone(fresh_received.revoked_at,
                          "retry không được revoke grant sinh sau cutoff")

    def test_missing_or_invalid_cutoff_raises_like_f15_hooks(self):
        from family_bridge_features.f07_mood.models import MoodEntry

        entry = self._make_mood_entry(owner=self.owner)
        hook = self._resolved_hook()
        with self.assertRaises(ValueError):
            hook.apply_user_deletion(user_id=str(self.owner.pk),
                                     requested_at=None)
        with self.assertRaises(ValueError):
            hook.apply_user_deletion(user_id=str(self.owner.pk),
                                     requested_at="khong-phai-ngay")
        # Fail-loud: không có row nào bị xoá khi cutoff sai.
        self.assertTrue(MoodEntry.objects.filter(pk=entry.pk).exists())


# ===========================================================================
# P2 (QA-1 mục 6) — authorizer production fail-closed với actor rỗng/lệch
# ===========================================================================
class HandlerAuthorizerActorContractTests(F15WiringTestCase):
    """actor_id rỗng/không phải UUID + authorizer production phải fail-closed
    503 ``handler_not_authorized`` TRƯỚC khi query — không bao giờ crash
    ValidationError (500) từ filter UUID."""

    def test_authorizer_raises_module_unavailable_on_bad_actor(self):
        from family_bridge_core.errors import ModuleUnavailable

        from ..services.verification import (ACTION_VERIFY,
                                             AdminCapabilityAuthorizer)

        authorizer = AdminCapabilityAuthorizer()
        for actor in ("", "   ", "khong-phai-uuid"):
            with self.assertRaises(ModuleUnavailable) as ctx:
                authorizer.authorize(actor_id=actor, action=ACTION_VERIFY,
                                     request_id=str(uuid.uuid4()))
            self.assertEqual(ctx.exception.details.get("reason"),
                             "handler_not_authorized")

    def test_verify_request_with_empty_actor_fails_closed_not_crash(self):
        from family_bridge_core.errors import ModuleUnavailable

        service = DeletionService()
        result = service.request_deletion(user=self.owner,
                                          categories=["journal"])
        with self.assertRaises(ModuleUnavailable) as ctx:
            service.verify_request(request_id=result["request_id"],
                                   verifier_ref="synthetic",
                                   actor_id="")
        self.assertEqual(ctx.exception.details.get("reason"),
                         "handler_not_authorized")
        # Không có transition nào xảy ra — request vẫn ở trạng thái REQUESTED.
        row = DeletionRequest.objects.get(pk=result["request_id"])
        self.assertEqual(row.status, DeletionRequest.STATUS_REQUESTED)
