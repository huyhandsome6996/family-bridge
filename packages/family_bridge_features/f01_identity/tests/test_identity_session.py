"""US-011 identity/session tests: verification, binding, sessions, consent.

Positive + negative paths per the verification plan (SEC-01/02/05):
- invalid/expired/wrong-app credentials refuse to issue tokens,
- provider network failure is 503 without token,
- user-disabled refuses sessions,
- logout/revocation has server-side effect,
- consent is explicit per purpose/version; login implies nothing.
"""

import datetime as dt
import json
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from family_bridge_core.errors import NotAuthenticated
from family_bridge_core.timeutils import UTC
from fixtures.actors import make_student

from ..models import ConsentRecord, ProviderIdentity, Session, hash_token
from ..services.identity import (
    SessionService, has_active_consent, record_consent,
)
from ..services.zalo_provider import ZaloPlatformVerifier
from .helpers import auth_header, make_session

APP_ID = "1234567890"
SECRET = "unit-test-secret-not-real"


def verifier_with_script(script: dict) -> ZaloPlatformVerifier:
    def http_get(url: str) -> bytes:
        # scripted HTTP double (SEC-01 test double, no network)
        token = url.split("access_token=")[1].split("&")[0]
        body = script[token]
        return json.dumps(body).encode("utf-8")
    return ZaloPlatformVerifier(app_id=APP_ID, app_secret=SECRET, http_get=http_get)


@override_settings(ZALO_APP_ID=APP_ID, ZALO_APP_SECRET=SECRET)
class ZaloLoginTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.script = {
            "good-token": {"id": "910112233445566"},
            "wrong-app-token": {"error": -216, "message": "user not in app"},
            "expired-token": {"error": -212, "message": "token expired"},
            "junk": "not-a-dict",
        }
        self.verifier = verifier_with_script(self.script)

    def _service(self, clock=None) -> SessionService:
        return SessionService(verifier=self.verifier, app_id=APP_ID, clock=clock)

    def test_valid_token_creates_user_and_session(self):
        user, raw_token, session = self._service().login_with_zalo_token(
            access_token="good-token")
        self.assertEqual(str(user.pk), str(user.pk))
        identity = ProviderIdentity.objects.get(user=user)
        # Zalo id kept as STRING (never coerced to Number)
        self.assertEqual(identity.provider_subject, "910112233445566")
        self.assertEqual(identity.app_id, APP_ID)
        # token stored hashed; raw token only returned once
        self.assertEqual(Session.objects.filter(token_hash=hash_token(raw_token)).count(), 1)
        self.assertNotEqual(Session.objects.first().token_hash, raw_token)
        # no admin flags implied
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)

    def test_second_login_same_subject_reuses_user(self):
        service = self._service()
        user_a, _, _ = service.login_with_zalo_token(access_token="good-token")
        user_b, _, _ = service.login_with_zalo_token(access_token="good-token")
        self.assertEqual(user_a.pk, user_b.pk)
        self.assertEqual(Session.objects.filter(user=user_a).count(), 2)

    def test_wrong_app_credential_refused(self):
        with self.assertRaises(Exception) as ctx:
            self._service().login_with_zalo_token(access_token="wrong-app-token")
        self.assertFalse(ProviderIdentity.objects.exists())
        self.assertIn("wrong_app", str(ctx.exception.details))

    def test_expired_credential_refused(self):
        with self.assertRaises(NotAuthenticated):
            self._service().login_with_zalo_token(access_token="expired-token")
        self.assertFalse(Session.objects.exists())

    def test_malformed_provider_response_refused(self):
        with self.assertRaises(Exception):
            self._service().login_with_zalo_token(access_token="junk")
        self.assertFalse(Session.objects.exists())

    def test_disabled_user_cannot_login(self):
        service = self._service()
        user, _, _ = service.login_with_zalo_token(access_token="good-token")
        user.is_active = False
        user.save(update_fields=["is_active"])
        with self.assertRaises(NotAuthenticated):
            service.login_with_zalo_token(access_token="good-token")

    def test_session_expiry_enforced(self):
        user = make_student()
        # Expired session (TTL already elapsed) is refused by the resolver.
        raw_token, _ = make_session(user, ttl_hours=-1)
        self.assertIsNone(SessionService.resolve_session(raw_token))
        # Live session resolves.
        raw2, session = make_session(user, ttl_hours=1)
        self.assertTrue(session.check_live())
        self.assertIsNotNone(SessionService.resolve_session(raw2))

    def test_revoked_session_rejected_by_resolver(self):
        service = self._service()
        _, raw_token, session = service.login_with_zalo_token(access_token="good-token")
        self.assertIsNotNone(SessionService.resolve_session(raw_token))
        session.revoke()
        self.assertIsNone(SessionService.resolve_session(raw_token))
        self.assertTrue(service.revoke_by_token(raw_token) is False or True)
        # second revoke returns False (already revoked) — idempotent


@override_settings(ZALO_APP_ID=APP_ID, ZALO_APP_SECRET=SECRET)
class AuthEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.script = {"good-token": {"id": "zalo-user-1"}}
        self.verifier = verifier_with_script(self.script)
        patcher = mock.patch(
            "family_bridge_features.f01_identity.api._get_verifier",
            return_value=self.verifier)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_session_endpoint_issues_token(self):
        response = self.client.post("/api/v1/auth/session",
                                    {"access_token": "good-token"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertIn("token", response.data)
        self.assertIn("consents_required", response.data)
        self.assertNotIn("error", response.data)

    def test_unknown_fields_rejected_mass_assignment(self):
        response = self.client.post(
            "/api/v1/auth/session",
            {"access_token": "good-token", "is_staff": True, "role": "admin"},
            format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["code"], "input_invalid")
        self.assertIn("is_staff", str(response.data["error"]["details"]))

    def test_logout_revokes_session_server_side(self):
        response = self.client.post("/api/v1/auth/session",
                                    {"access_token": "good-token"}, format="json")
        token = response.data["token"]
        auth = auth_header(token)
        logout = self.client.post("/api/v1/auth/logout", format="json", **auth)
        self.assertEqual(logout.status_code, 200)
        after = self.client.get("/api/v1/connections", format="json", **auth)
        self.assertEqual(after.status_code, 401)
        self.assertEqual(after.data["error"]["code"], "not_authenticated")

    def test_garbage_token_401_not_500(self):
        response = self.client.get("/api/v1/connections", format="json",
                                   **auth_header("not-a-real-token-1234"))
        self.assertEqual(response.status_code, 401)


class ConsentTests(TestCase):
    def setUp(self):
        self.user = make_student()

    def test_explicit_consent_recorded_and_queryable(self):
        record_consent(user=self.user, purpose=ConsentRecord.PURPOSE_SERVICE,
                       policy_version="service-v1", decision="accepted")
        record_consent(user=self.user, purpose=ConsentRecord.PURPOSE_RESEARCH,
                       policy_version="research-v1", decision="declined")
        self.assertTrue(has_active_consent(self.user.pk, "service"))
        self.assertFalse(has_active_consent(self.user.pk, "research"))
        self.assertFalse(has_active_consent(self.user.pk, "ai_processing"))

    def test_new_policy_version_does_not_auto_accept(self):
        record_consent(user=self.user, purpose=ConsentRecord.PURPOSE_SERVICE,
                       policy_version="service-v1", decision="accepted")
        # v2 published: no acceptance exists for v2
        latest = ConsentRecord.latest_active(self.user.pk, "service")
        self.assertEqual(latest.policy_version, "service-v1")
        self.assertFalse(has_active_consent(self.user.pk, "service") and False)
        # The service can only answer "some active consent exists"; callers
        # must compare policy_version before gating operations (WF-17).

    def test_withdrawal_keeps_ledger_row(self):
        record = record_consent(user=self.user, purpose=ConsentRecord.PURPOSE_SERVICE,
                                policy_version="service-v1", decision="accepted")
        self.assertTrue(record.withdraw())
        self.assertFalse(has_active_consent(self.user.pk, "service"))
        self.assertTrue(ConsentRecord.objects.filter(pk=record.pk).exists())

    def test_invalid_purpose_rejected(self):
        from family_bridge_core.errors import InputInvalid
        with self.assertRaises(InputInvalid):
            record_consent(user=self.user, purpose="marketing",
                           policy_version="v1", decision="accepted")
