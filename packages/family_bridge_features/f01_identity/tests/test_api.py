"""F01 API-level tests: envelope errors, permissions, anti-enumeration."""

import json
from unittest import mock

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from fixtures.actors import make_student, make_caregiver, make_system_admin

from ..models import Connection
from ..services.invites import InviteService
from .helpers import accept_service_consent, auth_header, make_session

APP_ID = "1234567890"


@override_settings(ZALO_APP_ID=APP_ID)
class InviteApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.inviter = make_student()
        self.candidate = make_caregiver()
        self.service = InviteService()
        # A05: create/claim/confirm are gated server-side on service consent.
        accept_service_consent(self.inviter)
        accept_service_consent(self.candidate)
        self.inviter_token, _ = make_session(self.inviter)
        self.candidate_token, _ = make_session(self.candidate)

    def _create_invite(self, relationship_kind="primary"):
        response = self.client.post(
            "/api/v1/connections/invites",
            {"relationship_kind": relationship_kind},
            format="json", **auth_header(self.inviter_token))
        self.assertEqual(response.status_code, 201)
        return response.data

    def test_full_bilateral_flow_over_api(self):
        invite = self._create_invite()
        claim = self.client.post("/api/v1/connections/invites/claim",
                                 {"code": invite["code"]},
                                 format="json", **auth_header(self.candidate_token))
        self.assertEqual(claim.status_code, 200)
        self.assertEqual(claim.data["status"], "awaiting_confirmation")
        confirm = self.client.post(
            f"/api/v1/connections/invites/{invite['invite_id']}/confirm",
            {}, format="json", **auth_header(self.inviter_token))
        self.assertEqual(confirm.status_code, 200)
        self.assertEqual(confirm.data["connection"]["status"], "active")
        self.assertEqual(confirm.data["connection"]["generation"], 1)
        listing = self.client.get("/api/v1/connections", format="json",
                                  **auth_header(self.candidate_token))
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(len(listing.data["results"]), 1)
        self.assertEqual(listing.data["results"][0]["other_party_id"],
                         str(self.inviter.pk))

    def test_stranger_cannot_list_others_invitations(self):
        invite = self._create_invite()
        stranger = make_student()
        stranger_token, _ = make_session(stranger)
        listing = self.client.get("/api/v1/connections/invites", format="json",
                                  **auth_header(stranger_token))
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(listing.data["results"], [])

    def test_unauthenticated_401_envelope(self):
        response = self.client.get("/api/v1/connections")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["error"]["code"], "not_authenticated")

    def test_wrong_relationship_kind_400(self):
        response = self.client.post("/api/v1/connections/invites",
                                    {"relationship_kind": "cousin"},
                                    format="json", **auth_header(self.inviter_token))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["code"], "input_invalid")

    def test_claim_rate_limited_429(self):
        invite = self._create_invite()
        from ..services.invites import ClaimRateGuard
        for _ in range(30):
            self.client.post("/api/v1/connections/invites/claim",
                             {"code": "WRONGWRONG12"}, format="json",
                             **auth_header(self.candidate_token))
        limited = self.client.post("/api/v1/connections/invites/claim",
                                   {"code": invite["code"]},
                                   format="json", **auth_header(self.candidate_token))
        self.assertEqual(limited.status_code, 429)
        self.assertEqual(limited.data["error"]["code"], "rate_limited")

    def test_revoked_connection_blocks_listing_and_allows_idempotent_revoke(self):
        invite = self._create_invite()
        self.client.post("/api/v1/connections/invites/claim",
                         {"code": invite["code"]}, format="json",
                         **auth_header(self.candidate_token))
        confirm = self.client.post(
            f"/api/v1/connections/invites/{invite['invite_id']}/confirm",
            {}, format="json", **auth_header(self.inviter_token))
        connection_id = confirm.data["connection"]["connection_id"]
        first = self.client.post(f"/api/v1/connections/{connection_id}/revoke",
                                 {}, format="json", **auth_header(self.inviter_token))
        self.assertEqual(first.status_code, 200)
        second = self.client.post(f"/api/v1/connections/{connection_id}/revoke",
                                  {}, format="json", **auth_header(self.candidate_token))
        self.assertEqual(second.status_code, 200)
        listing = self.client.get("/api/v1/connections", format="json",
                                  **auth_header(self.candidate_token))
        self.assertEqual(listing.data["results"], [])

    def test_mass_assignment_on_claim_rejected(self):
        invite = self._create_invite()
        response = self.client.post("/api/v1/connections/invites/claim",
                                    {"code": invite["code"], "status": "active",
                                     "candidate_confirmed_at": "2020-01-01"},
                                    format="json", **auth_header(self.candidate_token))
        self.assertEqual(response.status_code, 400)

    def test_malformed_uuid_404(self):
        response = self.client.post("/api/v1/connections/not-a-uuid/revoke",
                                    {}, format="json", **auth_header(self.inviter_token))
        self.assertIn(response.status_code, (400, 404))
