"""CORS allowlist (SEC-09) — port từ kt01, giữ nguyên logic."""

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
