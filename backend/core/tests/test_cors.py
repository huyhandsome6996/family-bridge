"""CORS allowlist (SEC-09) — port từ kt01, giữ nguyên logic.

S3/D-01 (peer review round 1): `x-idempotency-key` was added to
CORS_ALLOW_HEADERS because POST /api/v1/ai/refine requires the
X-Idempotency-Key header. These tests pin that at two levels:
(a) the configured allow-header list contains x-idempotency-key;
(b) a real OPTIONS preflight (django-cors-headers middleware runs inside the
    Django test client: "corsheaders" in INSTALLED_APPS +
    corsheaders.middleware.CorsMiddleware in MIDDLEWARE) for
    /api/v1/ai/refine echoes the header in Access-Control-Allow-Headers.
"""

from django.conf import settings
from django.test import TestCase, override_settings


class CorsAllowlistTests(TestCase):
    @override_settings(CORS_ALLOWED_ORIGINS=["https://h5.zdn.vn"])
    def test_cors_accepts_only_configured_origins(self):
        # Ported verbatim từ kt01.
        for origin, allowed in [("https://h5.zdn.vn", True), ("https://attacker.example", False)]:
            response = self.client.options(
                "/api/v1/health/",
                HTTP_ORIGIN=origin,
                HTTP_ACCESS_CONTROL_REQUEST_METHOD="GET",
            )
            self.assertEqual("Access-Control-Allow-Origin" in response, allowed)


class CorsIdempotencyHeaderTests(TestCase):
    """S3/D-01: X-Idempotency-Key must survive the CORS preflight for the
    F04 refine endpoint (cross-origin web/zalo clients send it on POST)."""

    def test_allow_headers_config_contains_x_idempotency_key(self):
        allow_headers = [str(h).lower() for h in settings.CORS_ALLOW_HEADERS]
        self.assertIn("x-idempotency-key", allow_headers)

    @override_settings(CORS_ALLOWED_ORIGINS=["https://h5.zdn.vn"])
    def test_preflight_ai_refine_allows_x_idempotency_key(self):
        response = self.client.options(
            "/api/v1/ai/refine",
            HTTP_ORIGIN="https://h5.zdn.vn",
            HTTP_ACCESS_CONTROL_REQUEST_METHOD="POST",
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS="x-idempotency-key",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Access-Control-Allow-Origin"],
                         "https://h5.zdn.vn")
        allow_headers = [
            h.strip().lower()
            for h in response.get("Access-Control-Allow-Headers", "").split(",")
            if h.strip()
        ]
        self.assertIn("x-idempotency-key", allow_headers)
