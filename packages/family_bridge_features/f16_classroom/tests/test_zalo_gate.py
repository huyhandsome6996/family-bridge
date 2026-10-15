"""Suite Zalo dormancy gate (F16): middleware chan POST /api/v1/auth/session.

Hai tang kiem thu:
- Unit (RequestFactory): chay o MOI moi truong (harness khong mount middleware
  nhung class van import duoc tu family_bridge_core).
- HTTP (Django test Client): chi khi middleware duoc mount o backend settings
  (harness khong mount — bo qua co ly do ro rang, khong dem la PASS).
"""

import json
import unittest

from django.conf import settings
from django.http import HttpResponse
from django.test import Client, RequestFactory, TestCase, override_settings

from family_bridge_core.middleware import FBZaloDormancyMiddleware

from .helpers import ScopedThrottleTestCase


SESSION_URL = "/api/v1/auth/session"
GATE_BODY = {"error": {"code": "module_unavailable",
                       "details": {"reason": "zalo_login_disabled"}}}


def _passthrough(request):
    return HttpResponse("passthrough")


class GateUnitTests(ScopedThrottleTestCase):
    """Middleware thuần — không phụ thuộc danh sách MIDDLEWARE của settings."""

    def _process(self, method, path):
        request = getattr(RequestFactory(), method.lower())(path)
        middleware = FBZaloDormancyMiddleware(_passthrough)
        return middleware(request)

    def test_disabled_post_session_returns_503_gate_envelope(self):
        with override_settings(FB_ZALO_LOGIN_ENABLED=False):
            response = self._process("POST", SESSION_URL)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(json.loads(response.content), GATE_BODY)
        self.assertEqual(response["Cache-Control"], "no-store")

    def test_disabled_get_still_passes_through(self):
        with override_settings(FB_ZALO_LOGIN_ENABLED=False):
            response = self._process("GET", SESSION_URL)
        self.assertEqual(response.content, b"passthrough")

    def test_disabled_other_path_passes_through(self):
        with override_settings(FB_ZALO_LOGIN_ENABLED=False):
            response = self._process("POST", "/api/v1/auth/class-session")
        self.assertEqual(response.content, b"passthrough")

    def test_default_enabled_post_passes_through(self):
        with override_settings(FB_ZALO_LOGIN_ENABLED=True):
            response = self._process("POST", SESSION_URL)
        self.assertEqual(response.content, b"passthrough")


MOUNTED = ("family_bridge_core.middleware.FBZaloDormancyMiddleware"
           in getattr(settings, "MIDDLEWARE", []))
_SKIP_REASON = ("gate middleware chi duoc mount tren backend settings "
                "(harness khong test gate qua HTTP)")


@unittest.skipUnless(MOUNTED, _SKIP_REASON)
class GateMountedHTTPTests(ScopedThrottleTestCase):
    """Qua HTTP that khi middleware duoc mount (backend settings)."""

    def test_disabled_session_503_gate_envelope_via_client(self):
        client = Client()
        with override_settings(FB_ZALO_LOGIN_ENABLED=False):
            response = client.post(SESSION_URL,
                                   {"code": "HS001", "password": "x"},
                                   content_type="application/json")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), GATE_BODY)
        self.assertEqual(response["Cache-Control"], "no-store")

    def test_default_on_is_not_gate_blocked(self):
        client = Client()
        response = client.post(SESSION_URL, {"code": "HS001", "password": "x"},
                               content_type="application/json")
        body = response.json()
        is_gate_block = (response.status_code == 503
                         and body == GATE_BODY)
        self.assertFalse(is_gate_block, body)
        # mac dinh khong co creds Zalo → f01 fail closed (503
        # temporarily_unavailable/provider_not_configured) — KHONG phai gate.

    def test_capabilities_reflects_disabled_flag_via_http(self):
        client = Client()
        with override_settings(FB_ZALO_LOGIN_ENABLED=False):
            response = client.get("/api/v1/auth/class-capabilities")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["login_methods"]["zalo"])
