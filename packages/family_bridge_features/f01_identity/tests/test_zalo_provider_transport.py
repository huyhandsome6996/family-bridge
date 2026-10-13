"""Review-fix tests: Zalo transport failures map to 503, never to a token.

Regression coverage for the review finding "LỖI TRANSPORT ZALO": the
verifier previously only handled urllib.error.HTTPError, so URLError
(DNS/refused/TLS), socket.timeout and raw OSError escaped as unhandled
exceptions (login -> 500) instead of the documented
503 temporarily_unavailable / provider_unreachable envelope.

Contract kept intact by these tests:
- Transport failure => TemporarilyUnavailable(provider_unreachable), which
  the shared handler renders as 503 {"error":{"code":"temporarily_unavailable"}}.
- No session token, no ProviderIdentity, no User row is created when the
  verify step fails for ANY reason.
- Mapping is NOT a catch-all: genuine programming errors still propagate
  (they must be fixed, not hidden as "provider down").
"""

import json
import socket
import urllib.error
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from family_bridge_core.errors import InputInvalid, TemporarilyUnavailable

from ..models import ProviderIdentity, Session
from ..services.identity import SessionService
from ..services.zalo_provider import ZaloPlatformVerifier

APP_ID = "1234567890"
SECRET = "unit-test-secret-not-real"


def verifier_with_raising_get(exc: BaseException) -> ZaloPlatformVerifier:
    """Verifier whose HTTP layer always raises the given exception."""

    def http_get(url, headers=None):
        raise exc

    return ZaloPlatformVerifier(app_id=APP_ID, app_secret=SECRET, http_get=http_get)


class ZaloTransportErrorMappingTests(TestCase):
    """Each transport failure class from the review finding, one by one."""

    def _assert_maps_to_provider_unreachable(self, exc: BaseException):
        verifier = verifier_with_raising_get(exc)
        with self.assertRaises(TemporarilyUnavailable) as ctx:
            verifier.verify(access_token="any-token")
        self.assertEqual(ctx.exception.details.get("reason"), "provider_unreachable")

    def test_urlerror_dns_failure_maps_to_503(self):
        # urllib.error.URLError wraps OSError from socket layer (DNS, refused).
        self._assert_maps_to_provider_unreachable(
            urllib.error.URLError(reason=OSError("Name or service not known")))

    def test_urlerror_connection_refused_maps_to_503(self):
        self._assert_maps_to_provider_unreachable(
            urllib.error.URLError(reason=ConnectionRefusedError(111)))

    def test_wrapped_socket_timeout_maps_to_503(self):
        # Typical connect/read timeout: URLError(socket.timeout()).
        self._assert_maps_to_provider_unreachable(
            urllib.error.URLError(reason=socket.timeout("timed out")))

    def test_bare_socket_timeout_maps_to_503(self):
        # .read() raises the timeout OUTSIDE the URLError wrapper.
        self._assert_maps_to_provider_unreachable(socket.timeout("timed out"))

    def test_timeout_error_maps_to_503(self):
        # Python 3.10+: socket.timeout IS TimeoutError; assert both spellings.
        self._assert_maps_to_provider_unreachable(TimeoutError("timed out"))

    def test_raw_oserror_connection_reset_maps_to_503(self):
        self._assert_maps_to_provider_unreachable(OSError("Connection reset by peer"))

    def test_httperror_without_json_body_maps_to_503(self):
        # 502 with an HTML body: not an application verdict -> 503 provider.
        exc = urllib.error.HTTPError(
            url="https://graph.zalo.me/v2.0/me", code=502, msg="Bad Gateway",
            hdrs=None, fp=None)
        self._assert_maps_to_provider_unreachable(exc)

    def test_programming_errors_are_not_masked(self):
        # No catch-all: a broken injected transport (ValueError) or an
        # allowlist violation (InputInvalid) must surface, not become "503".
        verifier = verifier_with_raising_get(ValueError("bug in caller wiring"))
        with self.assertRaises(ValueError):
            verifier.verify(access_token="any-token")

        def http_get(url, headers=None):
            raise InputInvalid({"reason": "destination_not_allowed"})

        guard_verifier = ZaloPlatformVerifier(
            app_id=APP_ID, app_secret=SECRET, http_get=http_get)
        with self.assertRaises(InputInvalid):
            guard_verifier.verify(access_token="any-token")

    def test_default_transport_urerror_through_real_opener(self):
        # Through the REAL default transport (no injected double), exercised
        # via verify() exactly like production: a URL the socket layer cannot
        # reach maps to 503 instead of escaping as URLError.
        verifier = ZaloPlatformVerifier(app_id=APP_ID, app_secret=SECRET)
        with mock.patch("urllib.request.OpenerDirector.open",
                        side_effect=urllib.error.URLError(
                            reason=ConnectionRefusedError(111))):
            with self.assertRaises(TemporarilyUnavailable) as ctx:
                verifier.verify(access_token="t")
        self.assertEqual(ctx.exception.details.get("reason"), "provider_unreachable")

    def test_default_transport_read_timeout_through_real_opener(self):
        # Timeout while READING the body: open() succeeds, read() raises
        # socket.timeout — previously escaped, now 503 through verify().
        verifier = ZaloPlatformVerifier(app_id=APP_ID, app_secret=SECRET)
        response = mock.Mock()
        response.status = 200
        response.read.side_effect = socket.timeout("timed out")
        context = mock.MagicMock()
        context.__enter__.return_value = response
        with mock.patch("urllib.request.OpenerDirector.open", return_value=context):
            with self.assertRaises(TemporarilyUnavailable) as ctx:
                verifier.verify(access_token="t")
        self.assertEqual(ctx.exception.details.get("reason"), "provider_unreachable")

    def test_default_http_get_still_surfaces_transport_errors_raw(self):
        # The default transport itself raises raw transport errors; the 503
        # mapping belongs to _fetch_token_info (single source of truth that
        # also covers injected doubles).
        verifier = ZaloPlatformVerifier(app_id=APP_ID, app_secret=SECRET)
        with mock.patch("urllib.request.OpenerDirector.open",
                        side_effect=urllib.error.URLError(
                            reason=ConnectionRefusedError(111))):
            with self.assertRaises(urllib.error.URLError):
                verifier._default_http_get(
                    "https://graph.zalo.me/v2.0/me?fields=id",
                    {"access_token": "t"})


@override_settings(ZALO_APP_ID=APP_ID, ZALO_APP_SECRET=SECRET)
class LoginOnTransportFailureTests(TestCase):
    """End-to-end: transport failure at login => 503 envelope, zero rows."""

    def setUp(self):
        self.client = APIClient()
        patcher = mock.patch(
            "family_bridge_features.f01_identity.api._get_verifier",
            return_value=verifier_with_raising_get(
                urllib.error.URLError(reason=ConnectionResetError(104))))
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_session_endpoint_returns_503_provider_unreachable(self):
        response = self.client.post("/api/v1/auth/session",
                                    {"access_token": "whatever-token"},
                                    format="json")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["error"]["code"], "temporarily_unavailable")
        self.assertEqual(response.data["error"]["details"]["reason"],
                         "provider_unreachable")

    def test_failed_verify_creates_no_token_no_account(self):
        response = self.client.post("/api/v1/auth/session",
                                    {"access_token": "whatever-token"},
                                    format="json")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(Session.objects.count(), 0)
        self.assertEqual(ProviderIdentity.objects.count(), 0)
        self.assertEqual(
            get_user_model().objects.filter(username__startswith="zalo_").count(), 0)

    def test_service_login_raises_before_provisioning(self):
        service = SessionService(
            verifier=verifier_with_raising_get(socket.timeout("timed out")),
            app_id=APP_ID)
        with self.assertRaises(TemporarilyUnavailable):
            service.login_with_zalo_token(access_token="whatever-token")
        self.assertEqual(Session.objects.count(), 0)
        self.assertEqual(ProviderIdentity.objects.count(), 0)
