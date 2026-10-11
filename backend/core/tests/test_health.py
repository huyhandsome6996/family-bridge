"""Hợp đồng GET /api/v1/health/ — liveness public, payload đúng hợp đồng.

Nguồn port: origin/feat/us-003-kt01:backend/core/tests.py (test đã review trước đây).
Khác biệt API so với kt01: health nay có @throttle_classes([]) — không đổi logic test
vì test này chỉ kiểm tra payload/header; hành vi miễn throttle nằm ở test_throttle.py.
"""

from django.test import TestCase


class HealthEndpointTests(TestCase):
    def test_health_is_public_without_exposing_configuration(self):
        # Ported verbatim từ kt01.
        response = self.client.get("/api/v1/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})
        self.assertEqual(response["Cache-Control"], "no-store")

    def test_health_performs_no_database_queries(self):
        # Liveness không được chạm DB (platform-endpoints.md; DSA: 0 query).
        with self.assertNumQueries(0):
            response = self.client.get("/api/v1/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})
