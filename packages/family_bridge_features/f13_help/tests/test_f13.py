"""F13 backend tests (US-039): public access, verified-only, fallback
degradation, off-hours computation, no gates."""

import datetime as dt

from django.test import TestCase
from rest_framework.test import APIClient

from family_bridge_core.timeutils import UTC

from ..services.directory import _compute_open, HelpDirectoryService
from ..services import registry
from labgrants.f13_fixtures import TestDirectoryProvider


class DirectoryTests(TestCase):
    def setUp(self):
        registry.reset_registries()
        self.provider = TestDirectoryProvider()
        registry.register_directory_reader(self.provider)
        self.client = APIClient()

    def test_public_access_without_auth(self):
        response = self.client.get("/api/v1/help/directory")
        self.assertEqual(response.status_code, 200)  # NOT 401: public by design

    def test_verified_only_unverified_retired_hidden(self):
        response = self.client.get("/api/v1/help/directory")
        ids = [c["contact_id"] for c in response.data["contacts"]]
        self.assertIn("sch-01", ids)
        self.assertIn("help-01", ids)
        self.assertNotIn("help-unverified", ids)
        self.assertNotIn("help-retired", ids)

    def test_review_expired_hides_phone_keeps_honest_status(self):
        response = self.client.get("/api/v1/help/directory")
        rows = {c["contact_id"]: c for c in response.data["contacts"]}
        self.assertEqual(rows["help-expired"]["phone"], "")
        self.assertEqual(rows["help-expired"]["status"],
                         "verification_expired")
        self.assertEqual(rows["sch-01"]["status"], "verified")

    def test_open_now_computed_deterministically(self):
        # 10:00 UTC == 17:00 VN (UTC+7): 8-17 window just closed (17 not < 17)
        now = dt.datetime(2026, 10, 11, 10, 0, tzinfo=UTC)
        self.assertFalse(_compute_open({"start_hour": 8, "end_hour": 17}, 7, now))
        self.assertTrue(_compute_open({"start_hour": 8, "end_hour": 18}, 7, now))
        self.assertTrue(_compute_open({"always": True}, 7, now))
        # 02:00 UTC == 09:00 VN: inside window
        early = dt.datetime(2026, 10, 11, 2, 0, tzinfo=UTC)
        self.assertTrue(_compute_open({"start_hour": 8, "end_hour": 17}, 7, early))

    def test_provider_failure_serves_verified_fallback(self):
        self.provider.raise_error = True
        response = self.client.get("/api/v1/help/directory")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["fallback"])
        self.assertTrue(response.data["source"].startswith("fallback:"))
        ids = [c["contact_id"] for c in response.data["contacts"]]
        self.assertIn("fb-te-111", ids)

    def test_fallback_expired_degrades_to_guidance_only(self):
        self.provider.raise_error = True
        # Force the shipped fallback past its review date
        from ..services import directory as directory_module
        original = directory_module.FALLBACK_REVIEW_DUE
        directory_module.FALLBACK_REVIEW_DUE = dt.date(2020, 1, 1)
        try:
            response = self.client.get("/api/v1/help/directory")
            self.assertEqual(response.data["source"], "fallback_expired")
            self.assertEqual(response.data["contacts"], [])
            self.assertIn("guidance", response.data)
            # no fabricated numbers anywhere
            self.assertNotIn("phone", response.data)
        finally:
            directory_module.FALLBACK_REVIEW_DUE = original

    def test_no_gates_no_telemetry_endpoints(self):
        # The app exposes exactly ONE help endpoint: no call-history, no
        # purpose capture, no telemetry, no prerequisites of any kind.
        from ..urls import urlpatterns
        self.assertEqual(len(urlpatterns), 1)
        self.assertEqual(str(urlpatterns[0].pattern), "help/directory")
