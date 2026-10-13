"""Review-fix tests: bilateral identity check + invite revision visibility.

Covers the review finding "XÁC NHẬN ĐÚNG NGƯỜI" (backend half):
- PUT/GET /api/v1/auth/me stores a self-declared display name (bounded,
  mass-assignment safe, never Zalo-verified, never authorization-relevant).
- POST /api/v1/connections/invites/preview reveals WHO created a code
  BEFORE the candidate decides to claim — read-only, anti-enumeration,
  shares the claim rate budget.
- Invite/connection reads carry `revision` + `counterpart` (self-declared
  display profile) so the inviter can confirm with a real expected_revision
  and both sides can check the right person. Raw UUID/subject of the
  counterpart is not added; no N+1 on list endpoints.
"""

import json
from unittest import mock

from django.contrib.auth import get_user_model
from django.db.models import Sum
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from family_bridge_core.errors import TemporarilyUnavailable
from fixtures.actors import make_caregiver, make_student

from ..models import ConnectionInvite, hash_token
from ..services.invites import InviteService
from .helpers import auth_header, make_session

APP_ID = "1234567890"
SECRET = "unit-test-secret-not-real"


def verifier_ok() -> object:
    def http_get(url, headers=None):
        return json.dumps({"id": "910112233445566"}).encode("utf-8")
    return type("V", (), {"verify": staticmethod(
        lambda *, access_token: type("I", (), {
            "provider": "zalo", "app_id": APP_ID,
            "provider_subject": "910112233445566"})())})


@override_settings(ZALO_APP_ID=APP_ID, ZALO_APP_SECRET=SECRET)
class AuthMeTests(TestCase):
    def setUp(self):
        self.user = make_student()
        self.client = APIClient()
        self.token, _ = make_session(self.user)
        self.auth = auth_header(self.token)

    def test_get_me_self_declared_profile(self):
        response = self.client.get("/api/v1/auth/me", **self.auth)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["user_id"], str(self.user.pk))
        self.assertEqual(response.data["display_name"],
                         (self.user.first_name or "").strip() or None)
        self.assertEqual(response.data["identity_basis"], "self_declared")

    def test_put_me_sets_display_name(self):
        response = self.client.put("/api/v1/auth/me",
                                   {"display_name": "  Lan   Nguyễn  "},
                                   format="json", **self.auth)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["display_name"], "Lan Nguyễn")
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, "Lan Nguyễn")

    def test_put_me_rejects_empty_and_oversized(self):
        long_name = "A" * 81
        for bad in ("", "   ", None, long_name):
            response = self.client.put("/api/v1/auth/me",
                                       {"display_name": bad},
                                       format="json", **self.auth)
            self.assertEqual(response.status_code, 400, f"bad={bad!r}")

    def test_put_me_rejects_unknown_fields(self):
        response = self.client.put(
            "/api/v1/auth/me",
            {"display_name": "Lan", "is_staff": True, "role": "admin"},
            format="json", **self.auth)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["code"], "input_invalid")

    def test_me_requires_session(self):
        self.assertEqual(
            self.client.get("/api/v1/auth/me").status_code, 401)
        self.assertEqual(
            self.client.put("/api/v1/auth/me", {"display_name": "Lan"},
                            format="json").status_code, 401)


@override_settings(ZALO_APP_ID=APP_ID, ZALO_APP_SECRET=SECRET)
class InvitePreviewTests(TestCase):
    def setUp(self):
        self.inviter = make_student()
        self.candidate = make_caregiver()
        self.inviter.first_name = "Phụ huynh Minh"
        self.inviter.save(update_fields=["first_name"])
        self.service = InviteService()
        self.client = APIClient()
        self.invite, self.raw_code = self.service.create_invite(
            inviter=self.inviter, relationship_kind="primary")
        self.candidate_token, _ = make_session(self.candidate)
        self.candidate_auth = auth_header(self.candidate_token)

    def _preview(self, code=None, auth=None):
        return self.client.post("/api/v1/connections/invites/preview",
                                {"code": code if code is not None else self.raw_code},
                                format="json",
                                **(auth if auth is not None else self.candidate_auth))

    def test_preview_shows_inviter_before_accepting(self):
        response = self._preview()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["relationship_kind"], "primary")
        self.assertEqual(response.data["counterpart"]["display_name"],
                         "Phụ huynh Minh")
        self.assertEqual(response.data["counterpart"]["identity_basis"],
                         "self_declared")
        # No state change: candidate not bound, invite still pending.
        self.invite.refresh_from_db()
        self.assertEqual(self.invite.status, ConnectionInvite.INVITE_PENDING)
        self.assertIsNone(self.invite.candidate_id)
        # Internal hand-off id must not leak to the client.
        self.assertNotIn("inviter_user_id", response.data)

    def test_preview_unknown_expired_closed_share_one_reply(self):
        # Unknown code and a wrong-but-well-formed code get the SAME
        # anti-enumeration reply as expired/closed codes.
        for code in ("WRONGCODE123", "ZZZZZZZZZZZZ"):
            response = self._preview(code=code)
            self.assertEqual(response.status_code, 404)
            self.assertEqual(
                response.data["error"]["details"]["reason"],
                "invalid_or_expired_code")

    def test_preview_own_code_reports_self_connect(self):
        inviter_token, _ = make_session(self.inviter)
        response = self.client.post("/api/v1/connections/invites/preview",
                                    {"code": self.raw_code}, format="json",
                                    **auth_header(inviter_token))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["details"]["reason"],
                         "self_connect_denied")

    def test_preview_after_other_candidate_consumed_code_is_404(self):
        other = make_caregiver()
        self.service.claim_invite(candidate=other, raw_code=self.raw_code)
        response = self._preview()
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["error"]["details"]["reason"],
                         "invalid_or_expired_code")

    def test_preview_shares_rate_budget_with_claim(self):
        from ..services.invites import CLAIM_RATE_LIMIT_PER_HOUR
        from ..models import ClaimAttempt
        import datetime as dt
        from family_bridge_core.timeutils import UTC
        now = dt.datetime.now(tz=UTC)
        for _ in range(CLAIM_RATE_LIMIT_PER_HOUR):
            ClaimAttempt.objects.create(actor_id=str(self.candidate.pk),
                                        attempted_at=now)
        response = self._preview()
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.data["error"]["code"], "rate_limited")


@override_settings(ZALO_APP_ID=APP_ID, ZALO_APP_SECRET=SECRET)
class InviteRevisionAndCounterpartTests(TestCase):
    """List reads carry revision + counterpart; confirm uses real revision."""

    def setUp(self):
        self.inviter = make_student()
        self.candidate = make_caregiver()
        self.candidate.first_name = "Chị Hồng"
        self.candidate.save(update_fields=["first_name"])
        self.service = InviteService()
        self.client = APIClient()
        self.invite, self.raw_code = self.service.create_invite(
            inviter=self.inviter, relationship_kind="primary")
        self.inviter_token, _ = make_session(self.inviter)
        self.candidate_token, _ = make_session(self.candidate)
        self.inviter_auth = auth_header(self.inviter_token)
        self.candidate_auth = auth_header(self.candidate_token)

    def test_invite_list_carries_revision_and_counterpart(self):
        # Pending invite: visible to the INVITER only (candidate not bound).
        inviter_rows = self.client.get("/api/v1/connections/invites",
                                       **self.inviter_auth).data["results"]
        pending = inviter_rows[0]
        self.assertEqual(pending["revision"], self.invite.revision)
        self.assertIsNone(pending["counterpart"])
        # After claim, the candidate sees the invite with the inviter profile.
        self.service.claim_invite(candidate=self.candidate, raw_code=self.raw_code)
        self.invite.refresh_from_db()
        candidate_rows = self.client.get("/api/v1/connections/invites",
                                         **self.candidate_auth).data["results"]
        row = candidate_rows[0]
        self.assertEqual(row["counterpart"]["display_name"],
                         self.inviter.first_name)
        self.assertEqual(row["counterpart"]["identity_basis"], "self_declared")
        self.assertEqual(row["revision"], self.invite.revision)

    def test_pending_invite_counterpart_is_none_not_uuid(self):
        # Inviter views a pending invite: no candidate yet.
        response = self.client.get("/api/v1/connections/invites",
                                   **self.inviter_auth)
        row = response.data["results"][0]
        self.assertIsNone(row["counterpart"])
        self.assertNotIn("candidate_id", row)
        self.assertNotIn("inviter_id", row)

    def test_claim_response_shows_inviter_profile(self):
        response = self.client.post("/api/v1/connections/invites/claim",
                                    {"code": self.raw_code}, format="json",
                                    **self.candidate_auth)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["counterpart"]["display_name"],
                         self.inviter.first_name)
        self.assertEqual(response.data["revision"], 2)  # claim bumps revision

    def test_confirm_with_revision_from_list_succeeds(self):
        listing = self.client.get("/api/v1/connections/invites",
                                  **self.inviter_auth)
        revision = listing.data["results"][0]["revision"]
        self.service.claim_invite(candidate=self.candidate, raw_code=self.raw_code)
        response = self.client.post(
            f"/api/v1/connections/invites/{self.invite.id}/confirm",
            {"expected_revision": revision + 1},  # claim bumped it
            format="json", **self.inviter_auth)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["invite"]["counterpart"]["display_name"],
                         "Chị Hồng")

    def test_confirm_with_stale_revision_conflicts(self):
        self.service.claim_invite(candidate=self.candidate, raw_code=self.raw_code)
        response = self.client.post(
            f"/api/v1/connections/invites/{self.invite.id}/confirm",
            {"expected_revision": 1},  # stale: claim already bumped to 2
            format="json", **self.inviter_auth)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error"]["code"], "revision_conflict")

    def test_connection_list_carries_counterpart_profile(self):
        self.service.claim_invite(candidate=self.candidate, raw_code=self.raw_code)
        self.service.inviter_confirm(inviter=self.inviter,
                                     invite_id=str(self.invite.pk))
        response = self.client.get("/api/v1/connections", **self.inviter_auth)
        row = response.data["results"][0]
        self.assertEqual(row["counterpart"]["display_name"], "Chị Hồng")
        self.assertEqual(row["counterpart"]["identity_basis"], "self_declared")

    def test_invite_list_uses_one_profile_query_not_n_plus_one(self):
        # Several invites with claimed candidates: profile lookups must stay
        # batched (one user query), never one query per row.
        for index in range(4):
            claimer = make_caregiver()
            claimer.first_name = f"Bạn {index}"
            claimer.save(update_fields=["first_name"])
            invite, code = self.service.create_invite(
                inviter=self.inviter, relationship_kind="primary")
            self.service.claim_invite(candidate=claimer, raw_code=code)
        queries = []

        class Counter:
            def __init__(self, cursor):
                self.cursor = cursor
            def execute(self, sql, params=None):
                queries.append(sql)
                return self.cursor.execute(sql, params)
            def __getattr__(self, name):
                return getattr(self.cursor, name)

        from django.db import DEFAULT_DB_ALIAS
        from django.db import connections as dj_connections
        alias = DEFAULT_DB_ALIAS
        real_cursor = dj_connections[alias].cursor

        def counting_cursor():
            return Counter(real_cursor())

        with mock.patch.object(type(dj_connections[alias]), "cursor",
                               side_effect=counting_cursor):
            response = self.client.get("/api/v1/connections/invites",
                                       **self.inviter_auth)
        self.assertEqual(response.status_code, 200)
        # 4 newly claimed invites + the pending one from setUp.
        self.assertEqual(len(response.data["results"]), 5)
        profile_queries = [q for q in queries
                           if "auth_user" in q and "first_name" in q]
        self.assertLessEqual(
            len(profile_queries), 2,
            f"user profile lookups must stay batched, got: "
            f"{len(profile_queries)}")
