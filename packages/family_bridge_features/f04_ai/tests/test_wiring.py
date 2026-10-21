"""F04 configuration wiring tests (frozen contract C5): env binding,
validation, bounds, kill switch, status truthfulness. Misconfiguration must
turn the AI module OFF safely — never crash boot."""

from unittest import mock

from django.test import TestCase, override_settings

from ..services import registry
from ..services.gemini import GeminiProvider, GeminiProviderError
from ..services.wiring import build_provider_from_settings, configure_from_settings
from .helpers import auth_header, make_session
from .test_f04 import F04ApiBase, grant_ai_consent

CANARY_KEY = "test-canary-key-not-a-real-secret-0002"


def _settings(**overrides):
    base = {"FB_AI_ENABLED": True, "GEMINI_API_KEY": CANARY_KEY,
            "GEMINI_MODEL": "gemini-2.5-flash", "GEMINI_TIMEOUT_SECONDS": 15,
            "GEMINI_MAX_OUTPUT_TOKENS": 1024}
    base.update(overrides)
    return override_settings(**base)


class ProviderWiringTests(TestCase):
    def setUp(self):
        registry.reset_registries()
        self.addCleanup(registry.reset_registries)

    def _dj_settings(self):
        import django.conf

        return django.conf.settings

    def test_kill_switch_off_means_no_provider(self):
        with _settings(FB_AI_ENABLED=False):
            self.assertIsNone(build_provider_from_settings(self._dj_settings()))
            self.assertFalse(configure_from_settings())
        self.assertIsNone(registry.get_ai_provider())

    def test_missing_key_means_no_provider(self):
        with _settings(GEMINI_API_KEY=""):
            self.assertIsNone(
                build_provider_from_settings(self._dj_settings()))
        with _settings(GEMINI_API_KEY="   "):
            self.assertIsNone(
                build_provider_from_settings(self._dj_settings()))

    def test_model_outside_allowlist_means_no_provider(self):
        with _settings(GEMINI_MODEL="totally-made-up-model"):
            self.assertIsNone(
                build_provider_from_settings(self._dj_settings()))

    def test_unparseable_timeout_means_no_provider(self):
        with _settings(GEMINI_TIMEOUT_SECONDS=None):
            self.assertIsNone(
                build_provider_from_settings(self._dj_settings()))

    def test_valid_config_wires_provider_with_typed_values(self):
        with _settings(GEMINI_MODEL="gemini-2.5-flash-lite",
                       GEMINI_TIMEOUT_SECONDS=20,
                       GEMINI_MAX_OUTPUT_TOKENS=256):
            provider = build_provider_from_settings(self._dj_settings())
        self.assertIsInstance(provider, GeminiProvider)
        self.assertEqual(provider.model, "gemini-2.5-flash-lite")
        self.assertEqual(provider.timeout_seconds, 20)
        self.assertEqual(provider.max_output_tokens, 256)
        self.assertEqual(provider.prompt_revision, "p1")

    def test_configure_registers_into_registry(self):
        with _settings():
            self.assertTrue(configure_from_settings())
        self.assertIsInstance(registry.get_ai_provider(), GeminiProvider)

    def test_startup_diagnosis_is_safe_and_performs_no_provider_request(self):
        with _settings(FB_AI_ENABLED=False), mock.patch(
                "urllib.request.urlopen", side_effect=AssertionError("no network at startup")), \
                self.assertLogs("family_bridge_features.f04_ai.services.wiring", level="INFO") as logs:
            self.assertFalse(configure_from_settings())
        line = " ".join(logs.output)
        self.assertIn("enabled=False", line)
        self.assertIn("key_present=True", line)
        self.assertIn("provider_wired=False", line)
        self.assertNotIn(CANARY_KEY, line)

    def test_invalid_model_diagnosis_does_not_echo_untrusted_config(self):
        with _settings(GEMINI_MODEL="private-config-canary"), self.assertLogs(
                "family_bridge_features.f04_ai.services.wiring", level="INFO") as logs:
            self.assertFalse(configure_from_settings())
        line = " ".join(logs.output)
        self.assertIn("model_supported=False", line)
        self.assertNotIn("private-config-canary", line)
        self.assertNotIn(CANARY_KEY, line)

    def test_provider_wiring_never_raises_on_broken_settings_object(self):
        class Broken:
            FB_AI_ENABLED = property(lambda self: (_ for _ in ()).throw(
                RuntimeError("boom")))

        self.assertIsNone(build_provider_from_settings(Broken()))


class KillSwitchRuntimeTests(F04ApiBase):
    """Status and refine must reflect the kill switch at REQUEST time, even
    when a provider object is still registered (flag flips after startup)."""

    def test_status_false_when_kill_switch_off(self):
        from django.test import override_settings

        registry.register_ai_provider(GeminiProvider(api_key=CANARY_KEY))
        with override_settings(FB_AI_ENABLED=False):
            response = self.client.get("/api/v1/ai/status", format="json",
                                       **auth_header(self.student_token))
        self.assertEqual(response.data, {"ai_enabled": False})

    def test_status_true_when_enabled(self):
        from django.test import override_settings

        registry.register_ai_provider(GeminiProvider(api_key=CANARY_KEY))
        with override_settings(FB_AI_ENABLED=True,
                               GEMINI_API_KEY=CANARY_KEY):
            response = self.client.get("/api/v1/ai/status", format="json",
                                       **auth_header(self.student_token))
        self.assertEqual(response.data, {"ai_enabled": True})

    def test_refine_503_when_kill_switch_flips_after_registration(self):
        from django.test import override_settings

        registry.register_ai_provider(GeminiProvider(api_key=CANARY_KEY))
        with override_settings(FB_AI_ENABLED=False):
            response = self._refine(self.student_token,
                                    key="ai-killsw-0001-abcd")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["error"]["code"], "module_unavailable")
        self.assertEqual(response.data["error"]["details"]["reason"],
                         "ai_unavailable_or_off")
        self.assertEqual(len(self.provider.calls), 0)


class EnvBindingSettingsTests(TestCase):
    """backend/config/settings.py env parsing: bounds/clamp/off semantics."""

    def test_bounded_int_helper(self):
        try:
            from config.settings import _bounded_int_env
        except ModuleNotFoundError:
            self.skipTest("backend config.settings not importable in this "
                          "harness run")

        with mock.patch.dict("os.environ", {"T": "99"}):
            self.assertEqual(_bounded_int_env("T", 15, 3, 30), 30)  # clamp hi
        with mock.patch.dict("os.environ", {"T": "1"}):
            self.assertEqual(_bounded_int_env("T", 15, 3, 30), 3)   # clamp lo
        with mock.patch.dict("os.environ", {"T": "abc"}):
            self.assertIsNone(_bounded_int_env("T", 15, 3, 30))     # -> AI off
        with mock.patch.dict("os.environ", {"T": ""}):
            self.assertEqual(_bounded_int_env("T", 15, 3, 30), 15)  # default
