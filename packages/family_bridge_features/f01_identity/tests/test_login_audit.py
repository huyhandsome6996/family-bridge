"""Independent login audit through HTTP views; synthetic provider transport only.

Also run with backend/config/settings.py to use accounts.User and the official
registry URL mount. Never runs against the live PC database or real accounts.
"""
import datetime as dt
import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.test import LiveServerTestCase
from rest_framework.test import APIClient

from ..models import ConsentRecord, ProviderIdentity, Session, hash_token
from ..services.policy import CURRENT_POLICY_VERSIONS
from ..services.zalo_provider import ZaloPlatformVerifier
from family_bridge_core.timeutils import UTC


@override_settings(ZALO_APP_ID="audit-parent", ZALO_APP_SECRET="synthetic-test-secret")
class LoginAuditTests(TestCase):
    def setUp(self):
        self.transport = patch.object(ZaloPlatformVerifier, "_default_http_get", side_effect=self.provider)
        self.transport.start()
        self.addCleanup(self.transport.stop)

    @staticmethod
    def provider(url, headers=None):
        token = headers["access_token"]
        assert token not in url
        assert "appsecret_proof" in headers
        if token == "audit-provider-reject":
            return json.dumps({"error": -501, "message": "SECRET_CANARY token=" + token}).encode()
        return json.dumps({"id": token.removeprefix("audit-zalo-")}).encode()

    def login(self, actor):
        client = APIClient()
        response = client.post("/api/v1/auth/session", {"access_token": "audit-zalo-" + actor}, format="json")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        client.credentials(HTTP_AUTHORIZATION="Bearer " + data["token"])
        return client, data

    def test_rejected_provider_free_text_never_reaches_http_envelope(self):
        response = APIClient().post("/api/v1/auth/session", {"access_token": "audit-provider-reject"}, format="json")
        self.assertEqual(response.status_code, 401)
        body = response.json()
        self.assertEqual(body["error"]["details"]["reason"], "provider_rejected")
        self.assertEqual(body["error"]["details"]["provider_code"], "-501")
        self.assertNotIn("SECRET_CANARY", json.dumps(body))
        self.assertNotIn("audit-provider-reject", json.dumps(body))
        self.assertEqual(ProviderIdentity.objects.count(), 0)
        self.assertEqual(Session.objects.count(), 0)

    def test_same_provider_identity_session_hash_consent_logout_and_expiry(self):
        a, first = self.login("A")
        b, second = self.login("B")
        again, repeat = self.login("A")
        self.assertEqual(first["user"]["id"], repeat["user"]["id"])
        self.assertNotEqual(first["token"], repeat["token"])
        self.assertEqual(ProviderIdentity.objects.count(), 2)
        self.assertEqual(ConsentRecord.objects.count(), 0)
        self.assertFalse(get_user_model().objects.get(pk=first["user"]["id"]).is_staff)
        self.assertTrue(Session.objects.filter(token_hash=hash_token(first["token"])).exists())
        self.assertFalse(Session.objects.filter(token_hash=first["token"]).exists())
        forged = APIClient().post("/api/v1/auth/session", {"access_token": "audit-zalo-A", "user_id": second["user"]["id"], "role": "admin"}, format="json")
        self.assertEqual(forged.status_code, 400)
        self.assertEqual(a.post("/api/v1/auth/logout", {}, format="json").status_code, 200)
        self.assertEqual(a.get("/api/v1/auth/me").status_code, 401)
        self.assertEqual(again.get("/api/v1/auth/me").status_code, 200)
        Session.objects.filter(token_hash=hash_token(second["token"])).update(expires_at=dt.datetime.now(tz=UTC) - dt.timedelta(seconds=1))
        self.assertEqual(b.get("/api/v1/auth/me").status_code, 401)

    def test_provider_diagnostic_code_is_bounded_numeric_only(self):
        from family_bridge_core.errors import NotAuthenticated
        for code in ["SECRET_CODE_CANARY", "123456789", True]:
            verifier = ZaloPlatformVerifier(app_id="audit-parent", app_secret="synthetic", http_get=lambda url, headers: json.dumps({"error": code, "message": "PRIVATE_CANARY"}).encode())
            with self.assertRaises(NotAuthenticated) as caught:
                verifier.verify(access_token="audit-zalo-A")
            self.assertEqual(caught.exception.details, {"reason": "provider_rejected"})


@override_settings(ZALO_APP_ID="audit-parent", ZALO_APP_SECRET="synthetic-test-secret", STATIC_URL="/static/")
class LoginLiveHTTPAuditTests(LiveServerTestCase):
    """Real loopback TCP -> official URLs -> verifier -> isolated test DB.

    The external Zalo transport is synthetic; this is not device evidence.
    """
    def test_login_relogin_logout_over_real_http(self):
        import urllib.request
        import urllib.error

        def call(path, body=None, token=None):
            headers = {"Content-Type": "application/json"}
            if token:
                headers["Authorization"] = "Bearer " + token
            request = urllib.request.Request(self.live_server_url + "/api/v1/" + path, data=json.dumps(body).encode() if body is not None else None, headers=headers)
            try:
                with urllib.request.urlopen(request, timeout=5) as response:
                    return response.status, json.loads(response.read())
            except urllib.error.HTTPError as response:
                return response.code, json.loads(response.read())

        with patch.object(ZaloPlatformVerifier, "_default_http_get", side_effect=LoginAuditTests.provider):
            status, first = call("auth/session", {"access_token": "audit-zalo-A"})
            self.assertEqual(status, 200)
            self.assertEqual(call("auth/me", token=first["token"])[0], 200)
            status, repeat = call("auth/session", {"access_token": "audit-zalo-A"})
            self.assertEqual(status, 200)
            self.assertEqual(first["user"]["id"], repeat["user"]["id"])
            self.assertEqual(ProviderIdentity.objects.count(), 1)
            self.assertEqual(ConsentRecord.objects.count(), 0)
            self.assertEqual(call("auth/logout", {}, first["token"])[0], 200)
            self.assertEqual(call("auth/me", token=first["token"])[0], 401)
            self.assertEqual(call("auth/me", token=repeat["token"])[0], 200)
