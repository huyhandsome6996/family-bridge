"""Gemini transport tests (unit + through-API, fake transport only).

No test here touches the network: urllib.request.urlopen is replaced with a
fake transport. A canary fake key proves the key stays OUT of the request
URL, the API response and the logs (it travels only in the x-goog-api-key
request header). Live smoke is opt-in via RUN_GEMINI_LIVE_TESTS=1 and never
runs in the default suite.
"""

import json
import os
import urllib.error
import unittest
from unittest import mock

from django.test import TestCase, override_settings

from ..models import AiSuggestion
from ..services import registry
from ..services.gemini import (
    GeminiProvider, GeminiProviderError, PROVIDER_HOST,
)
from .test_f04 import F04ApiBase

CANARY_KEY = "test-canary-key-not-a-real-secret-0001"

ENDPOINT = f"https://{PROVIDER_HOST}/v1beta/models/gemini-2.5-flash:generateContent"


def _gemini_response(text="Mình cảm thấy mệt và cần được bố mẹ lắng nghe hơn.",
                     *, finish="STOP", parts=None, prompt_block=None):
    payload = {"candidates": [{
        "content": {"parts": parts if parts is not None
                    else [{"text": text}]},
        "finishReason": finish,
    }]}
    if prompt_block:
        payload["promptFeedback"] = {"blockReason": prompt_block}
    return json.dumps(payload).encode("utf-8")


class _FakeResponse:
    def __init__(self, body):
        self._body = body

    def read(self, size=-1):
        return self._body if size < 0 else self._body[:size]

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class FakeUrlopen:
    """Records the urllib Request (URL + headers) and replays a canned reply.
    `raise_with` injects a transport-level exception AFTER the call is
    recorded (simulates timeout/DNS failure)."""

    def __init__(self, body=b"", status=200):
        self.requests = []
        self.body = body
        self.status = status
        self.raise_with = None

    def __call__(self, request, timeout=None):
        self.requests.append({
            "url": request.get_full_url(),
            "headers": {key.lower(): value
                        for key, value in request.header_items()},
            "data": bytes(request.data),
            "timeout": timeout,
        })
        if self.raise_with is not None:
            raise self.raise_with
        if self.status != 200:
            # The error never carries the upstream body into the test.
            raise urllib.error.HTTPError(request.get_full_url(),
                                         self.status, "http error", {},
                                         None)
        return _FakeResponse(self.body)


def _provider(**overrides):
    params = {"api_key": CANARY_KEY, "model": "gemini-2.5-flash",
              "timeout_seconds": 15, "max_output_tokens": 1024}
    params.update(overrides)
    return GeminiProvider(**params)


class GeminiTransportUnitTests(TestCase):
    """F04-T18/T19 mapping on a fake transport (no network, no real key)."""

    def _run(self, fake, **overrides):
        provider = _provider(**overrides)
        with mock.patch("family_bridge_features.f04_ai.services.gemini"
                        ".urllib.request.urlopen", fake):
            return provider.refine(text="Con mệt lắm",
                                   purpose="refine_expression")

    def test_success_maps_to_port_shape(self):
        fake = FakeUrlopen(_gemini_response())
        result = self._run(fake)
        self.assertEqual(result["provider_id"], "gemini")
        self.assertEqual(result["model_revision"], "gemini-2.5-flash")
        self.assertEqual(result["prompt_revision"], "p1")
        self.assertTrue(result["suggested_text"])
        request = fake.requests[0]
        self.assertEqual(request["url"], ENDPOINT)
        self.assertNotIn("key=", request["url"])  # never in the URL
        self.assertEqual(request["headers"]["x-goog-api-key"], CANARY_KEY)

    def test_key_canary_never_in_url_response_or_logs(self):
        fake = FakeUrlopen(_gemini_response())
        with self.assertNoLogs("family_bridge_features.f04_ai.services.gemini"):
            result = self._run(fake)
        self.assertNotIn(CANARY_KEY, result["suggested_text"])
        self.assertNotIn(CANARY_KEY, fake.requests[0]["url"])
        response_payload = json.dumps(result, ensure_ascii=False)
        self.assertNotIn(CANARY_KEY, response_payload)

    def test_thinking_summary_parts_are_excluded(self):
        fake = FakeUrlopen(_gemini_response(parts=[
            {"text": "suy nghĩ nội bộ", "thought": True},
            {"text": "Kết quả viết lại cho bạn."},
        ]))
        result = self._run(fake)
        self.assertEqual(result["suggested_text"],
                         "Kết quả viết lại cho bạn.")

    def test_empty_candidates(self):
        fake = FakeUrlopen(json.dumps({"candidates": []}).encode())
        with self.assertRaises(GeminiProviderError) as ctx:
            self._run(fake)
        self.assertEqual(ctx.exception.fb_provider_reason,
                         "provider_output_empty")

    def test_empty_text_parts(self):
        fake = FakeUrlopen(_gemini_response(parts=[{"text": "   "}]))
        with self.assertRaises(GeminiProviderError) as ctx:
            self._run(fake)
        self.assertEqual(ctx.exception.fb_provider_reason,
                         "provider_output_empty")

    def test_safety_block_finish_reason(self):
        fake = FakeUrlopen(_gemini_response(finish="SAFETY"))
        with self.assertRaises(GeminiProviderError) as ctx:
            self._run(fake)
        self.assertEqual(ctx.exception.fb_provider_reason,
                         "provider_safety_blocked")

    def test_prompt_feedback_block(self):
        fake = FakeUrlopen(_gemini_response(prompt_block="BLOCKLIST"))
        with self.assertRaises(GeminiProviderError) as ctx:
            self._run(fake)
        self.assertEqual(ctx.exception.fb_provider_reason,
                         "provider_safety_blocked")

    def test_truncated_output_is_not_a_complete_suggestion(self):
        fake = FakeUrlopen(_gemini_response(finish="MAX_TOKENS"))
        with self.assertRaises(GeminiProviderError) as ctx:
            self._run(fake)
        self.assertEqual(ctx.exception.fb_provider_reason,
                         "provider_output_truncated")

    def test_malformed_json(self):
        fake = FakeUrlopen(b"{not json at all")
        with self.assertRaises(GeminiProviderError) as ctx:
            self._run(fake)
        self.assertEqual(ctx.exception.fb_provider_reason,
                         "provider_output_invalid")

    def test_oversized_response_rejected(self):
        fake = FakeUrlopen(b"x" * 1_100_000)
        with self.assertRaises(GeminiProviderError) as ctx:
            self._run(fake)
        self.assertEqual(ctx.exception.fb_provider_reason,
                         "provider_output_invalid")

    def test_http_status_mapping(self):
        for status, reason in ((429, "provider_quota_exceeded"),
                               (401, "provider_auth_invalid"),
                               (403, "provider_auth_invalid"),
                               (404, "provider_model_unavailable"),
                               (400, "provider_request_invalid"),
                               (500, "provider_outage"),
                               (503, "provider_outage")):
            fake = FakeUrlopen(status=status)
            with self.assertRaises(GeminiProviderError) as ctx:
                self._run(fake)
            self.assertEqual(ctx.exception.fb_provider_reason, reason, status)

    def test_timeout_mapping(self):
        import socket

        fake = FakeUrlopen()
        fake.raise_with = socket.timeout("timed out")
        with self.assertRaises(GeminiProviderError) as ctx:
            self._run(fake)
        self.assertEqual(ctx.exception.fb_provider_reason, "provider_timeout")

    def test_urlerror_with_timeout_reason(self):
        import socket

        fake = FakeUrlopen()
        fake.raise_with = urllib.error.URLError(
            socket.timeout("read timed out"))
        with self.assertRaises(GeminiProviderError) as ctx:
            self._run(fake)
        self.assertEqual(ctx.exception.fb_provider_reason, "provider_timeout")

    def test_generic_network_error_is_outage(self):
        fake = FakeUrlopen()
        fake.raise_with = urllib.error.URLError("name resolution failed")
        with self.assertRaises(GeminiProviderError) as ctx:
            self._run(fake)
        self.assertEqual(ctx.exception.fb_provider_reason, "provider_outage")

    def test_single_call_no_retry(self):
        fake = FakeUrlopen(_gemini_response())
        self._run(fake)
        self.assertEqual(len(fake.requests), 1)  # exactly one generation

    def test_timeout_clamped_to_bounds(self):
        fake = FakeUrlopen(_gemini_response())
        self._run(fake, timeout_seconds=1)
        self.assertEqual(fake.requests[0]["timeout"], 3)
        self._run(fake, timeout_seconds=99)
        self.assertEqual(fake.requests[1]["timeout"], 30)

    def test_request_body_is_minimal_and_json(self):
        fake = FakeUrlopen(_gemini_response())
        self._run(fake)
        body = json.loads(fake.requests[0]["data"].decode("utf-8"))
        self.assertEqual(sorted(body),
                         ["contents", "generationConfig", "system_instruction"])
        self.assertEqual(len(body["contents"]), 1)
        # only the chosen sentence travels — no history/context fields
        self.assertNotIn("history", json.dumps(body))
        self.assertEqual(body["generationConfig"]["maxOutputTokens"], 1024)


class GeminiThroughApiTests(F04ApiBase):
    """End-to-end: settings-wired GeminiProvider + fake transport through the
    HTTP API (F04-T18 binding: key read from GEMINI_API_KEY settings)."""

    def setUp(self):
        super().setUp()
        from django.test import override_settings

        self._override = override_settings(
            FB_AI_ENABLED=True, GEMINI_API_KEY=CANARY_KEY,
            GEMINI_MODEL="gemini-2.5-flash", GEMINI_TIMEOUT_SECONDS=15,
            GEMINI_MAX_OUTPUT_TOKENS=1024)
        self._override.enable()
        self.addCleanup(self._override.disable)
        registry.register_ai_provider(_provider())

    def test_refine_via_gemini_fake_transport_returns_clean_dto(self):
        fake = FakeUrlopen(_gemini_response())
        with mock.patch("family_bridge_features.f04_ai.services.gemini"
                        ".urllib.request.urlopen", fake):
            response = self._refine(self.student_token,
                                    key="ai-gemini-0001-abc")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["model_revision"], "gemini-2.5-flash")
        self.assertEqual(response.data["prompt_revision"], "p1")
        self.assertIn("suggested_text", response.data)
        self.assertNotIn("candidates", response.data)  # no raw provider shape
        self.assertNotIn(CANARY_KEY, str(response.data))
        self.assertEqual(len(fake.requests), 1)

    def test_gemini_transport_failure_maps_to_503_reason(self):
        fake = FakeUrlopen(status=429)
        with mock.patch("family_bridge_features.f04_ai.services.gemini"
                        ".urllib.request.urlopen", fake):
            response = self._refine(self.student_token,
                                    key="ai-gemini-0002-abc")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["error"]["details"]["reason"],
                         "provider_quota_exceeded")
        self.assertEqual(AiSuggestion.objects.count(), 0)


class GeminiWiredTimeoutTests(F04ApiBase):
    """R1A2-02: GEMINI_TIMEOUT_SECONDS must reach the REAL transport call.
    AiExpressService._call_provider passes timeout_seconds=None so
    GeminiProvider.refine falls back to self.timeout_seconds — the value
    wired from settings by services.wiring (previously a hard-coded 15
    overrode the env setting at runtime)."""

    def test_settings_wired_timeout_reaches_transport(self):
        import django.conf

        from ..services.wiring import build_provider_from_settings

        fake = FakeUrlopen(_gemini_response())
        with override_settings(
                FB_AI_ENABLED=True, GEMINI_API_KEY=CANARY_KEY,
                GEMINI_MODEL="gemini-2.5-flash", GEMINI_TIMEOUT_SECONDS=3,
                GEMINI_MAX_OUTPUT_TOKENS=1024):
            provider = build_provider_from_settings(django.conf.settings)
            self.assertIsInstance(provider, GeminiProvider)
            self.assertEqual(provider.timeout_seconds, 3)  # from settings
            registry.register_ai_provider(provider)  # replaces the fake
            with mock.patch("family_bridge_features.f04_ai.services.gemini"
                            ".urllib.request.urlopen", fake):
                response = self._refine(self.student_token,
                                        key="ai-timeout-0001-abc")
        self.assertEqual(response.status_code, 201)
        # The transport deadline IS the settings-wired value (3s, clamped
        # lower bound), not a hard-coded 15.
        self.assertEqual(fake.requests[0]["timeout"], 3)


@unittest.skipUnless(
    os.getenv("RUN_GEMINI_LIVE_TESTS") == "1",
    "Live Gemini smoke is opt-in (RUN_GEMINI_LIVE_TESTS=1 with a NEW key, "
    "approved budget, max 3 generation requests for the whole group).")
class LiveGeminiSmokeTests(TestCase):
    """Marker implemented per handoff 6.7-E; NOT RUN in this environment
    (no real key / no approved budget). Stays skipped by default."""

    def test_single_live_generation(self):
        from django.conf import settings

        api_key = str(getattr(settings, "GEMINI_API_KEY", "")).strip()
        if not api_key:
            self.skipTest("GEMINI_API_KEY not configured for live smoke")
        provider = GeminiProvider(api_key=api_key)
        result = provider.refine(
            text="Con mệt mỏi lắm rồi", purpose="refine_expression")
        self.assertIsInstance(result["suggested_text"], str)
        self.assertTrue(result["suggested_text"].strip())
        self.assertEqual(result["prompt_revision"], "p1")
