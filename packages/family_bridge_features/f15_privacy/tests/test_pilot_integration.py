"""Official accounts.User/URLs integration, run from backend/manage.py.

Synthetic actors only; TestCase creates an isolated database. No real tokens.
"""
import datetime as dt
import uuid
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from family_bridge_core.timeutils import UTC
from family_bridge_features.f01_identity.models import Connection, ConnectionInvite, Session, hash_token
from ..services.wiring import configure_production_wiring


class PilotIntegrationTests(TestCase):
    def test_equal_clock_decisions_do_not_resurrect_acceptance(self):
        from family_bridge_features.f01_identity.services.identity import record_consent, has_active_consent
        from family_bridge_features.f01_identity.services.policy import CURRENT_POLICY_VERSIONS
        user = get_user_model().objects.create_user(username="synthetic-consent-clock")
        same_time = dt.datetime.now(tz=UTC)
        for decision in ["accepted", "declined"]:
            record_consent(user=user, purpose="research", policy_version=CURRENT_POLICY_VERSIONS["research"], decision=decision, now=same_time)
        self.assertFalse(has_active_consent(user.pk, "research"))

    def setUp(self):
        configure_production_wiring(force=True)
        self.a, self.b, self.c = [get_user_model().objects.create_user(username="pilot-" + str(uuid.uuid4())) for _ in range(3)]
        self.clients = []
        for user in [self.a, self.b, self.c]:
            raw = uuid.uuid4().hex
            Session.objects.create(user=user, token_hash=hash_token(raw), expires_at=dt.datetime.now(tz=UTC) + dt.timedelta(hours=1))
            client = APIClient(); client.credentials(HTTP_AUTHORIZATION="Bearer " + raw); self.clients.append(client)
        invite = ConnectionInvite.objects.create(inviter=self.a, candidate=self.b, code_hash=uuid.uuid4().hex, status="active", expires_at=dt.datetime.now(tz=UTC) + dt.timedelta(days=1))
        low, high = sorted([str(self.a.pk), str(self.b.pk)])
        self.connection = Connection.objects.create(party_low_id=low, party_high_id=high, invite=invite, status="active", generation=1, relationship_kind="primary")

    def test_item_share_revoke_unlink_and_request_deletion_real_views(self):
        a, b, c = self.clients
        first = a.post("/api/v1/journal/pages", {"content": "SYNTHETIC page one"}, format="json")
        second = a.post("/api/v1/journal/pages", {"content": "SYNTHETIC page two"}, format="json")
        self.assertEqual(first.status_code, 201); self.assertEqual(second.status_code, 201)
        data = first.json(); share_path = "/api/v1/journal/pages/" + data["page_id"] + "/share"
        self.assertEqual(b.get("/api/v1/journal/shared").json()["results"], [])
        self.assertEqual(a.post(share_path, {"recipient_id": str(self.b.pk), "expected_revision": data["revision"] + 1}, format="json").status_code, 409)
        share = a.post(share_path, {"recipient_id": str(self.b.pk), "expected_revision": data["revision"]}, format="json")
        self.assertEqual(share.status_code, 201)
        shared = b.get("/api/v1/journal/shared"); self.assertEqual(shared.status_code, 200); self.assertEqual(len(shared.json()["results"]), 1)
        detail = "/api/v1/journal/shared/" + share.json()["share_id"]
        self.assertEqual(b.get(detail).status_code, 200); self.assertEqual(c.get(detail).status_code, 404)
        overview = a.get("/api/v1/privacy/overview"); self.assertEqual(overview.status_code, 200); self.assertEqual(len(overview.json()["shared_by_me"]), 1)
        revoked = a.post("/api/v1/privacy/grants/journal_page/" + data["page_id"] + "/revoke", {"recipient_id": str(self.b.pk), "expected_revision": data["revision"]}, format="json")
        self.assertEqual(revoked.status_code, 200); self.assertEqual(b.get(detail).status_code, 404)
        unlink = a.post("/api/v1/connections/" + str(self.connection.pk) + "/revoke", {}, format="json")
        self.assertEqual(unlink.status_code, 200); self.assertEqual(b.get("/api/v1/connections").json()["results"], [])
        request = a.post("/api/v1/privacy/deletion-requests", {"categories": ["journal"]}, format="json")
        self.assertEqual(request.status_code, 201); self.assertEqual(request.json()["status"], "requested")
        request_id = request.json()["request_id"]
        self.assertEqual(c.get("/api/v1/privacy/deletion-requests/" + request_id).status_code, 404)
        self.assertEqual(a.get("/api/v1/privacy/deletion-requests/" + request_id).json()["status"], "requested")
