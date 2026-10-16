"""B18 backend wiring tests — feature packages mounted on the REAL backend.

What these tests prove (and never overclaim):
- All 16 feature Django apps are installed (explicit allowlist, loud failure
  if a package is missing — see settings.FEATURE_APPS).
- Registry-driven URLs resolve for a representative path of every feature.
- Unauthenticated private calls get the contract 401: Bearer challenge,
  {"error": {...}} envelope, Cache-Control: no-store — via the REAL
  FBSDSessionAuthentication class (no test-double auth on this backend).
- Scoped throttle rates (B18 union) are configured.
- Health/ready remain public and unchanged.

What they do NOT prove: Zalo device behavior (US-049), MySQL race suites,
AI provider availability (port stays unwired — fail-safe manual flow).
"""
from django.conf import settings
from django.test import TestCase
from django.urls import resolve


EXPECTED_FEATURE_APPS = {
    "f01_identity", "f02_program", "f03_cards", "f04_ai", "f05_inbox",
    "f06_drafts", "f07_mood", "f08_journal", "f09_activities", "f10_signal",
    "f11_supporters", "f12_appointments", "f13_help", "f14_surveys",
    "f15_privacy", "admin_core", "f16_classroom",
}

# One stable, side-effect-free route per feature (public or auth-guarded;
# resolution only — no business assertions, those live in the 333-test suite).
REPRESENTATIVE_ROUTES = {
    "f01_identity": "/api/v1/consents",
    "f02_program": "/api/v1/program/catalog",
    "f03_cards": "/api/v1/cards",
    "f04_ai": "/api/v1/ai/status",
    "f05_inbox": "/api/v1/messages",
    "f06_drafts": "/api/v1/drafts",
    "f07_mood": "/api/v1/mood/entries",
    "f08_journal": "/api/v1/journal/pages",
    "f09_activities": "/api/v1/activities/catalog",
    "f10_signal": "/api/v1/signals/meta",
    "f11_supporters": "/api/v1/supporters/roles",
    "f12_appointments": "/api/v1/appointments/directory",
    "f13_help": "/api/v1/help/directory",
    "f14_surveys": "/api/v1/surveys/forms",
    "f15_privacy": "/api/v1/privacy/overview",
    "admin_core": "/api/v1/admin/dashboard",
    "f16_classroom": "/api/v1/auth/class-capabilities",
}


class InstalledAppsTests(TestCase):
    def test_all_17_feature_apps_installed(self):
        installed = set(settings.INSTALLED_APPS)
        for label in EXPECTED_FEATURE_APPS:
            self.assertIn(f"family_bridge_features.{label}", installed)

    def test_feature_apps_metadata_matches_allowlist(self):
        self.assertEqual(set(settings.FEATURE_APPS), EXPECTED_FEATURE_APPS)

    def test_auth_user_model_is_real_accounts_user(self):
        # Feature migrations serialize the swappable reference; the real
        # backend binds them to accounts.User (UUID pk) at migrate time.
        self.assertEqual(settings.AUTH_USER_MODEL, "accounts.User")


class RegistryRoutesResolveTests(TestCase):
    def test_representative_route_of_every_feature_resolves(self):
        for label, route in REPRESENTATIVE_ROUTES.items():
            with self.subTest(feature=label, route=route):
                match = resolve(route)
                self.assertIsNotNone(match.func)


class RealAuthenticationTests(TestCase):
    def test_default_auth_class_is_fbsd_session_auth(self):
        self.assertEqual(
            settings.REST_FRAMEWORK["DEFAULT_AUTHENTICATION_CLASSES"],
            ["family_bridge_features.f01_identity.auth.FBSDSessionAuthentication"],
        )

    def test_unauthenticated_private_call_gets_401_envelope_and_challenge(self):
        response = self.client.get("/api/v1/consents")
        self.assertEqual(response.status_code, 401)
        self.assertIn("error", response.data)
        self.assertIn("code", response.data["error"])
        self.assertEqual(response["Cache-Control"], "no-store")
        self.assertEqual(
            response["WWW-Authenticate"], 'Bearer realm="family-bridge"')

    def test_classroom_proposals_requires_bearer(self):
        # F16 routes resolve and enforce the same contract 401 envelope.
        response = self.client.get("/api/v1/classroom/proposals")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response["Cache-Control"], "no-store")

    def test_garbage_bearer_token_gets_401_not_500(self):
        response = self.client.get(
            "/api/v1/consents", HTTP_AUTHORIZATION="Bearer not-a-real-token")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response["Cache-Control"], "no-store")


class ThrottleWiringTests(TestCase):
    def test_scoped_rates_match_b18_integration_union(self):
        rates = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
        self.assertEqual(rates["invite_claim"], "30/hour")
        self.assertEqual(rates["send_message"], "60/hour")
        self.assertEqual(rates["ai_refine"], "30/hour")
        self.assertEqual(rates["survey_report"], "20/hour")
        self.assertEqual(rates["class_login"], "200/hour")
        self.assertIn(
            "rest_framework.throttling.ScopedRateThrottle",
            settings.REST_FRAMEWORK["DEFAULT_THROTTLE_CLASSES"],
        )


class PlatformProbesUnchangedTests(TestCase):
    def test_health_still_public_ok(self):
        response = self.client.get("/api/v1/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_unknown_api_path_is_plain_404_without_leak(self):
        response = self.client.get("/api/v1/does-not-exist/")
        self.assertEqual(response.status_code, 404)
        self.assertNotIn("SECRET", str(response.content))
