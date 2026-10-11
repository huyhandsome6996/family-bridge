"""TEST-ONLY doubles for F04: AI provider fake.

Implements the refine port so tests can simulate: normal rewrite, outage,
timeout, quota exhaustion, malformed/oversized output, and prompt-injection
payloads. The fake NEVER executes text and records calls to assert the
minimal payload rule. Clearly labelled TEST-ONLY — B18 wires a real
provider from the server allowlist with env-stored keys.
"""

from family_bridge_core.timeutils import UTC


class TestAiProvider:
    """Deterministic rule-based rewrite: strips harsh markers and wraps the
    sentence with a feeling+need frame. NOT a quality claim — production
    prompts/models need Thầy/đơn vị approval (US-008) and stay in the
    server-side registry allowlist."""

    provider_id = "test-ai-rules"
    model_revision = "rules-2026.10"
    prompt_revision = "pr-001"

    def __init__(self) -> None:
        self.calls = []
        self.mode = "ok"

    def refine(self, *, text, purpose, timeout_seconds=None):
        self.calls.append({"text": text, "purpose": purpose,
                           "at": dt_now_iso()})
        if self.mode == "outage":
            raise _fail("provider_outage")
        if self.mode == "timeout":
            raise _fail("provider_timeout")
        if self.mode == "quota":
            raise _fail("provider_quota_exceeded")
        if self.mode == "malformed":
            return {"no_suggested_text_here": True}
        if self.mode == "oversized":
            return {"suggested_text": "x" * 5000}
        # Deterministic, boring transform; treats input as opaque text.
        cleaned = " ".join(str(text).split())
        return {
            "suggested_text": (
                f"Mình cảm thấy {(cleaned[:60] + '…') if len(cleaned) > 60 else cleaned} "
                "— mình cần được lắng nghe."),
            "provider_id": self.provider_id,
            "model_revision": self.model_revision,
            "prompt_revision": self.prompt_revision,
        }

    # malformed / oversized modes ------------------------------
    def set_mode(self, mode):
        self.mode = mode


class _fail(Exception):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.fb_provider_reason = reason


def dt_now_iso():
    import datetime as dt
    return dt.datetime.now(tz=UTC).isoformat()
