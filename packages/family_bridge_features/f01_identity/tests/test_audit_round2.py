"""Audit round-2 regression tests (A02, A03, A05, A06, A07, A09, A12).

Every test maps to a finding in the 2026-10-13 audit at head c101a59 and
asserts STATE / ACTOR / SIDE EFFECTS, not call counts alone. The
reproductions ran against the pre-fix tree (c101a59) via a detached
baseline worktree before these tests were written; see the PR report.
"""

import datetime as dt
import json
import logging
from unittest import mock

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from family_bridge_core.errors import InputInvalid, NotFound, RateLimited
from family_bridge_core.timeutils import UTC
from fixtures.actors import make_student, make_caregiver

from ..models import (
    ClaimAttempt, Connection, ConnectionInvite, ConsentRecord, Session,
    hash_token,
)
from ..services.identity import (
    SessionService, has_active_consent,
)
from ..services.invites import ClaimRateGuard, InviteService
from ..services.policy import CURRENT_POLICY_VERSIONS
from ..services.zalo_provider import ZaloPlatformVerifier
from .helpers import accept_service_consent, auth_header, make_session

APP_ID = "1234567890"
SECRET = "unit-test-secret-not-real"


def _scripted_verifier(responses: dict) -> ZaloPlatformVerifier:
    """HTTP double: token -> provider JSON body (no network, A03)."""

    def http_get(url: str, headers=None) -> bytes:
        token = (headers or {}).get("access_token", "")
        body = responses[token]
        return json.dumps(body).encode("utf-8")

    return ZaloPlatformVerifier(app_id=APP_ID, app_secret=SECRET, http_get=http_get)


# ---------------------------------------------------------------------------
# A02 — withdrawal/decline of the latest record must not resurrect older ones
# ---------------------------------------------------------------------------
class A02ConsentEffectivenessTests(TestCase):
    def setUp(self):
        self.user = make_student()

    def _record(self, purpose="service", version=None, decision="accepted",
                when=None):
        version = version or CURRENT_POLICY_VERSIONS[purpose]
        # These cases assert sequential business events; Windows clock
        # resolution can tie timestamps. The explicit tie-case below still
        # supplies `when` unchanged and checks the UUID tie-break contract.
        if when is None:
            latest = ConsentRecord.objects.filter(user=self.user, purpose=purpose).order_by("-recorded_at").first()
            when = dt.datetime.now(tz=UTC)
            if latest is not None and when <= latest.recorded_at:
                when = latest.recorded_at + dt.timedelta(microseconds=1)
        return ConsentRecord.objects.create(
            user=self.user, purpose=purpose, policy_version=version,
            decision=decision,
            recorded_at=when or dt.datetime.now(tz=UTC),
        )

    def test_withdrawing_latest_does_not_resurrect_older_acceptance(self):
        self._record(version="service-v0")            # old accepted record
        second = self._record()                        # current accepted record
        second.withdraw()
        self.assertFalse(
            has_active_consent(self.user.pk, "service"),
            "withdraw của bản MỚI nhất không được hồi sinh acceptance cũ")

    def test_declining_latest_does_not_resurrect_older_acceptance(self):
        self._record()
        self._record(decision="declined")
        self.assertFalse(has_active_consent(self.user.pk, "service"))

    def test_withdrawn_row_keeps_ledger_semantics(self):
        record = self._record()
        record.withdraw()
        self.assertTrue(
            ConsentRecord.objects.filter(pk=record.pk).exists(),
            "withdraw giữ nguyên dòng sổ cái (ledger), không xóa")
        self.assertFalse(has_active_consent(self.user.pk, "service"))

    def test_fresh_acceptance_after_withdrawal_is_a_new_active_action(self):
        first = self._record()
        first.withdraw()
        self._record()  # chủ động chấp nhận lại sau khi thu hồi
        self.assertTrue(has_active_consent(self.user.pk, "service"))

    def test_old_version_acceptance_alone_is_not_active(self):
        self._record(version="service-v0")
        self.assertFalse(
            has_active_consent(self.user.pk, "service"),
            "acceptance của phiên bản cũ không tự hiệu lực cho bản hiện hành")

    def test_equal_timestamps_resolve_stably(self):
        # UUID PKs are random, so the id tie-break does not mean "newest
        # insert wins"; the CONTRACT is a stable, deterministic order: the
        # same row set always yields the same effective decision.
        when = dt.datetime(2026, 10, 13, 8, 0, tzinfo=UTC)
        self._record(when=when)
        self._record(decision="declined", when=when)
        chosen = (ConsentRecord.objects
                  .filter(user_id=self.user.pk, purpose="service")
                  .order_by("-recorded_at", "-id").first())
        again = (ConsentRecord.objects
                 .filter(user_id=self.user.pk, purpose="service")
                 .order_by("-recorded_at", "-id").first())
        self.assertEqual(chosen.pk, again.pk,
                         "tie timestamp phải chọn cùng một dòng giữa hai lần")
        self.assertEqual(
            has_active_consent(self.user.pk, "service"),
            chosen.decision == "accepted" and chosen.withdrawn_at is None,
            "hiệu lực phải khớp đúng dòng được chọn theo thứ tự ổn định")


# ---------------------------------------------------------------------------
# A03 — credential validation + provider subject schema
# ---------------------------------------------------------------------------
class _LogCapture(logging.Handler):
    """Capture django.request (and others) records to scan for canaries."""

    def __init__(self):
        super().__init__()
        self.records = []

    def emit(self, record):
        self.records.append(self.format(record) if self.formatter
                            else record.getMessage())


class A03CredentialValidationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.verifier = _scripted_verifier({})
        patcher = mock.patch(
            "family_bridge_features.f01_identity.api._get_verifier",
            return_value=self.verifier)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _post(self, token):
        return self.client.post("/api/v1/auth/session",
                                {"access_token": token}, format="json")

    def test_newline_token_is_400_not_500_and_no_external_connection(self):
        canary = "canary-token-A03"
        handler = _LogCapture()
        django_logger = logging.getLogger("django.request")
        django_logger.addHandler(handler)
        try:
            # Any attempt to open a socket fails the test: the credential must
            # be rejected BEFORE any transport call (0 outbound connections).
            with mock.patch("socket.socket", side_effect=AssertionError("network")):
                response = self._post(canary + "\nEVIL-HEADER")
        finally:
            django_logger.removeHandler(handler)
        self.assertEqual(response.status_code, 400,
                         "token có newline phải bị 400, không được 500")
        self.assertEqual(response.data["error"]["code"], "input_invalid")
        self.assertEqual(response.data["error"]["details"].get("field"),
                         "access_token")
        joined = "\n".join(handler.records)
        self.assertNotIn(canary, joined,
                         "canary credential không được lọt vào log/exception")
        self.assertNotIn("EVIL-HEADER", joined)
        self.assertFalse(Session.objects.exists())
        self.assertFalse(get_user_model().objects.exists())

    def test_control_and_unicode_tokens_rejected_as_malformed_not_sanitized(self):
        # CR/NUL/tab/space/non-ASCII: rejected AS-IS. The view-layer
        # sanitizer must NOT silently rewrite a credential.
        for bad in ("ok-token\rX", "ok-token\tX", "ok token", "tokén-accents",
                    "ok-token\x00X"):
            response = self._post(bad)
            self.assertEqual(response.status_code, 400, repr(bad))
            self.assertEqual(response.data["error"]["code"], "input_invalid", repr(bad))
            self.assertEqual(response.data["error"]["details"].get("field"),
                             "access_token", repr(bad))
        self.assertFalse(get_user_model().objects.exists())

    @override_settings(ZALO_APP_ID=APP_ID)
    def test_valid_shape_token_still_reaches_verifier(self):
        verifier = _scripted_verifier({"good-token": {"id": "789"}})
        with mock.patch(
                "family_bridge_features.f01_identity.api._get_verifier",
                return_value=verifier):
            response = self._post("good-token")
        self.assertEqual(response.status_code, 200)
        self.assertIn("token", response.data)


class A03ProviderSubjectSchemaTests(TestCase):
    def _verify_with(self, subject_value):
        verifier = _scripted_verifier({"tok": {"id": subject_value}})
        return verifier.verify(access_token="tok")

    def test_empty_and_whitespace_subjects_rejected(self):
        for bad in ("", "   ", " 123 ", "1 2"):
            with self.assertRaises(InputInvalid, msg=repr(bad)):
                self._verify_with(bad)

    def test_bool_subject_rejected_even_though_bool_is_int(self):
        with self.assertRaises(InputInvalid):
            self._verify_with(True)

    def test_oversized_subject_rejected_against_column_limit(self):
        with self.assertRaises(InputInvalid):
            self._verify_with("9" * 129)

    def test_numeric_string_and_int_accepted(self):
        self.assertEqual(self._verify_with("789").provider_subject, "789")
        self.assertEqual(self._verify_with(789).provider_subject, "789")

    def test_malformed_provider_response_creates_no_rows(self):
        service = SessionService(
            verifier=_scripted_verifier({"tok": {"id": True}}), app_id=APP_ID)
        with self.assertRaises(InputInvalid):
            service.login_with_zalo_token(access_token="tok")
        self.assertFalse(get_user_model().objects.exists())
        self.assertFalse(
            __import__("family_bridge_features.f01_identity.models",
                       fromlist=["ProviderIdentity"]).ProviderIdentity.objects.exists())
        self.assertFalse(Session.objects.exists())


# ---------------------------------------------------------------------------
# A05 — server-side policy version contract + service-consent gate
# ---------------------------------------------------------------------------
class A05PolicyContractTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = make_student()
        self.token, _ = make_session(self.user)

    def test_unpublished_policy_version_rejected_400(self):
        response = self.client.post(
            "/api/v1/consents",
            {"purpose": "service", "policy_version": "not-published-version",
             "decision": "accepted"},
            format="json", **auth_header(self.token))
        self.assertEqual(response.status_code, 400,
                         "phiên bản không phát hành không được ghi 201")
        self.assertEqual(response.data["error"]["code"], "input_invalid")
        self.assertFalse(ConsentRecord.objects.exists())

    def test_retired_version_rejected_even_for_decline(self):
        accept_service_consent(self.user)
        response = self.client.post(
            "/api/v1/consents",
            {"purpose": "service", "policy_version": "service-v0",
             "decision": "declined"},
            format="json", **auth_header(self.token))
        self.assertEqual(response.status_code, 400)

    def test_create_invite_without_consent_403_consent_required(self):
        response = self.client.post(
            "/api/v1/connections/invites", {"relationship_kind": "primary"},
            format="json", **auth_header(self.token))
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["error"]["code"], "consent_required")
        self.assertEqual(ConnectionInvite.objects.count(), 0)

    def test_create_invite_after_service_consent_201(self):
        accept_service_consent(self.user)
        response = self.client.post(
            "/api/v1/connections/invites", {"relationship_kind": "primary"},
            format="json", **auth_header(self.token))
        self.assertEqual(response.status_code, 201)

    def test_claim_and_confirm_gated_on_service_consent(self):
        accept_service_consent(self.user)
        create = self.client.post(
            "/api/v1/connections/invites", {"relationship_kind": "primary"},
            format="json", **auth_header(self.token))
        code = create.data["code"]
        candidate = make_caregiver()
        candidate_token, _ = make_session(candidate)
        # Chưa consent -> claim bị chặn
        claim = self.client.post("/api/v1/connections/invites/claim",
                                 {"code": code}, format="json",
                                 **auth_header(candidate_token))
        self.assertEqual(claim.status_code, 403)
        self.assertEqual(claim.data["error"]["code"], "consent_required")
        invite = ConnectionInvite.objects.get()
        self.assertEqual(invite.status, ConnectionInvite.INVITE_PENDING,
                         "claim bị chặn không được bind candidate")
        self.assertIsNone(invite.candidate)
        # Có consent -> claim đi tiếp
        accept_service_consent(candidate)
        claim2 = self.client.post("/api/v1/connections/invites/claim",
                                  {"code": code}, format="json",
                                  **auth_header(candidate_token))
        self.assertEqual(claim2.status_code, 200)

    def test_consent_read_shows_current_flag(self):
        accept_service_consent(self.user)
        listing = self.client.get("/api/v1/consents", format="json",
                                  **auth_header(self.token))
        by_purpose = {row["purpose"]: row for row in listing.data["consents"]}
        self.assertTrue(by_purpose["service"]["current"])
        self.assertFalse(by_purpose["research"]["current"])


# ---------------------------------------------------------------------------
# A06 — activation rechecks BOTH accounts
# ---------------------------------------------------------------------------
class A06AccountRecheckTests(TestCase):
    def setUp(self):
        self.service = InviteService()
        self.inviter = make_student()
        self.candidate = make_caregiver()
        accept_service_consent(self.inviter)
        accept_service_consent(self.candidate)
        self.invite, self.raw_code = self.service.create_invite(
            inviter=self.inviter, relationship_kind="primary")

    def test_disabled_candidate_never_activates_connection(self):
        self.service.claim_invite(candidate=self.candidate, raw_code=self.raw_code)
        self.candidate.is_active = False
        self.candidate.save(update_fields=["is_active"])
        with self.assertRaises(Exception) as ctx:
            self.service.inviter_confirm(inviter=self.inviter,
                                         invite_id=str(self.invite.pk))
        from family_bridge_core.errors import NotAuthorized
        self.assertIsInstance(ctx.exception, NotAuthorized)
        self.assertEqual(ctx.exception.details.get("reason"), "account_inactive")
        self.assertFalse(Connection.objects.exists(),
                         "tài khoản candidate đã tắt -> KHÔNG tạo Connection")
        self.invite.refresh_from_db()
        self.assertEqual(self.invite.status, ConnectionInvite.INVITE_AWAITING,
                         "lời mời không được chuyển active")

    def test_disabled_inviter_code_claims_like_dead_code(self):
        self.inviter.is_active = False
        self.inviter.save(update_fields=["is_active"])
        stranger = make_caregiver()
        with self.assertRaises(NotFound) as ctx:
            self.service.claim_invite(candidate=stranger, raw_code=self.raw_code)
        self.assertEqual(ctx.exception.details.get("reason"),
                         "invalid_or_expired_code")
        self.assertFalse(Connection.objects.exists())


# ---------------------------------------------------------------------------
# A07 — failed claims must persist in the DB rate guard
# ---------------------------------------------------------------------------
class A07RateGuardPersistenceTests(TestCase):
    def setUp(self):
        self.service = InviteService()
        self.candidate = make_student()

    def _wrong_claim(self, guard):
        try:
            self.service.claim_invite(candidate=self.candidate,
                                      raw_code="WRONGCODE123",
                                      rate_guard=guard)
        except NotFound:
            pass

    def test_failed_claims_are_recorded(self):
        guard = ClaimRateGuard(max_attempts=3)
        outcomes = []
        for _ in range(4):
            try:
                self.service.claim_invite(candidate=self.candidate,
                                          raw_code="WRONGCODE123",
                                          rate_guard=guard)
                outcomes.append("ok")
            except RateLimited:
                outcomes.append("limited")
            except NotFound:
                outcomes.append("not_found")
        self.assertEqual(outcomes,
                         ["not_found", "not_found", "not_found", "limited"])
        self.assertEqual(
            ClaimAttempt.objects.filter(actor_id=str(self.candidate.pk)).count(),
            3,
            "3 attempt SAI phải được ghi vĩnh viễn (không rollback theo tx)")
        self.assertFalse(ConnectionInvite.objects.exists())

    def test_failed_claims_persist_over_api_with_default_guard(self):
        user = make_student()
        accept_service_consent(user)
        token, _ = make_session(user)
        client = APIClient()
        for _ in range(4):
            response = client.post("/api/v1/connections/invites/claim",
                                   {"code": "WRONGCODE123"}, format="json",
                                   **auth_header(token))
            self.assertEqual(response.status_code, 404)
        self.assertEqual(
            ClaimAttempt.objects.filter(actor_id=str(user.pk)).count(), 4,
            "guard DB là shared/durable: 4 lần sai phải còn nguyên sau response")

    def test_preview_and_claim_share_one_budget(self):
        user = make_student()
        accept_service_consent(user)
        token, _ = make_session(user)
        client = APIClient()
        client.post("/api/v1/connections/invites/preview",
                    {"code": "WRONGCODE123"}, format="json",
                    **auth_header(token))
        client.post("/api/v1/connections/invites/preview",
                    {"code": "WRONGCODE123"}, format="json",
                    **auth_header(token))
        client.post("/api/v1/connections/invites/claim",
                    {"code": "WRONGCODE123"}, format="json",
                    **auth_header(token))
        self.assertEqual(
            ClaimAttempt.objects.filter(actor_id=str(user.pk)).count(), 3,
            "preview và claim dùng chung một budget theo contract")


# ---------------------------------------------------------------------------
# A09 — bounded reads + keyset pagination
# ---------------------------------------------------------------------------
class A09BoundsPaginationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = make_student()
        self.token, _ = make_session(self.user)

    def test_consent_read_is_bounded_no_full_history_scan(self):
        now = dt.datetime.now(tz=UTC)
        for i in range(75):
            ConsentRecord.objects.create(
                user=self.user, purpose="service",
                policy_version="service-v0" if i % 2 else "service-v1",
                decision="accepted", recorded_at=now - dt.timedelta(minutes=i))
        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get("/api/v1/consents", format="json",
                                       **auth_header(self.token))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["consents"]), 3)
        self.assertLessEqual(
            len(ctx.captured_queries), 8,
            "GET consents phải O(P) truy vấn có index, không scan 75 dòng")

    def _make_connections(self, count):
        User = get_user_model()
        for i in range(count):
            other = User.objects.create_user(username=f"peer-{i}",
                                             password="x" * 20)
            invite = ConnectionInvite.objects.create(
                inviter=self.user, code_hash=hash_token(f"code-{i}"),
                relationship_kind="primary",
                expires_at=dt.datetime.now(tz=UTC) + dt.timedelta(days=1))
            Connection.objects.create(party_low=self.user, party_high=other,
                                      invite=invite,
                                      relationship_kind="primary")

    def test_connections_paginated_default_page_and_cursor(self):
        self._make_connections(25)
        first = self.client.get("/api/v1/connections", format="json",
                                **auth_header(self.token))
        self.assertEqual(first.status_code, 200)
        self.assertEqual(len(first.data["results"]), 20)
        cursor = first.data["next_cursor"]
        self.assertTrue(cursor, "trang 1 phải mang next_cursor khi còn dòng")
        second = self.client.get(
            f"/api/v1/connections?cursor={cursor}", format="json",
            **auth_header(self.token))
        self.assertEqual(len(second.data["results"]), 5)
        self.assertIsNone(second.data["next_cursor"])
        # Không trùng lặp giữa hai trang (keyset ổn định)
        seen = {row["connection_id"] for row in first.data["results"]}
        for row in second.data["results"]:
            self.assertNotIn(row["connection_id"], seen)

    def test_connections_limit_clamped_and_authorized(self):
        self._make_connections(25)
        stranger = make_student()
        stranger_token, _ = make_session(stranger)
        huge = self.client.get("/api/v1/connections?limit=999", format="json",
                               **auth_header(self.token))
        self.assertEqual(len(huge.data["results"]), 25,
                         "limit bị kẹp theo MAX_PAGE_SIZE, trả đủ số dòng của mình")
        empty = self.client.get("/api/v1/connections?limit=5", format="json",
                                **auth_header(stranger_token))
        self.assertEqual(len(empty.data["results"]), 0,
                         "authorization trước pagination")

    def test_invites_paginated_beyond_old_cap(self):
        now = dt.datetime.now(tz=UTC)
        for i in range(25):
            ConnectionInvite.objects.create(
                inviter=self.user, code_hash=hash_token(f"inv-{i}"),
                relationship_kind="primary",
                status=ConnectionInvite.INVITE_CANCELED,
                expires_at=now + dt.timedelta(days=1),
                closed_at=now)
        first = self.client.get("/api/v1/connections/invites", format="json",
                                **auth_header(self.token))
        self.assertEqual(len(first.data["results"]), 20)
        cursor = first.data["next_cursor"]
        self.assertTrue(cursor)
        second = self.client.get(
            f"/api/v1/connections/invites?cursor={cursor}", format="json",
            **auth_header(self.token))
        self.assertEqual(len(second.data["results"]), 5,
                         "dòng 21-25 phải quản lý được qua cursor")


# ---------------------------------------------------------------------------
# A12 — revoke_all_for_user works on the real port path
# ---------------------------------------------------------------------------
class A12RevokeAllTests(TestCase):
    def setUp(self):
        self.user = make_student()
        self.other = make_caregiver()

    def test_revoke_all_revokes_only_this_user_bulk(self):
        tokens = [make_session(self.user)[0] for _ in range(3)]
        other_token, other_session = make_session(self.other)
        with CaptureQueriesContext(connection) as ctx:
            count = SessionService.revoke_all_for_user(self.user.pk)
        self.assertEqual(count, 3)
        self.assertLessEqual(len(ctx.captured_queries), 3,
                             "phải là 1 UPDATE bounded, không vòng N query")
        for raw in tokens:
            self.assertIsNone(SessionService.resolve_session(raw))
        self.assertIsNotNone(SessionService.resolve_session(other_token),
                             "phiên user khác không bị đụng tới")
        self.assertEqual(SessionService.revoke_all_for_user(self.user.pk), 0,
                         "idempotent: lần hai không còn gì để thu hồi")

    def test_expired_sessions_not_counted(self):
        session = Session.objects.create(
            user=self.user, token_hash=hash_token("old"),
            expires_at=dt.datetime.now(tz=UTC) - dt.timedelta(hours=1))
        count = SessionService.revoke_all_for_user(self.user.pk)
        self.assertEqual(count, 0)
        session.refresh_from_db()
        self.assertIsNone(session.revoked_at,
                         "phiên đã hết hạn không cần thu hồi lại")
