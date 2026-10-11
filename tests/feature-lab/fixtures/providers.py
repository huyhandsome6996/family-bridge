"""Fake providers for tests (SEC-01/16): scripted Zalo verifier + AI provider.

These doubles exist to test OUR contract handling of provider outcomes.
They never prove real Zalo/provider behavior — reports must keep such
cases NOT_RUN/BLOCKED until real credentials exist.
"""

import datetime as dt
from typing import Dict, Optional

from family_bridge_core.errors import (
    FamilyBridgeError, InputInvalid, TemporarilyUnavailable,
)
from family_bridge_core.protocols import VerifiedIdentity
from family_bridge_core.timeutils import UTC

WRONG_APP = "wrong_app"
EXPIRED = "expired"
INVALID = "invalid"
NETWORK_ERROR = "network_error"


class FakeZaloVerifier:
    """Scripted verifier: token -> VerifiedIdentity or raise."""

    def __init__(self, app_id: str = "1234567890") -> None:
        self.app_id = app_id
        self.script: Dict[str, object] = {}
        self.calls: list = []

    def script_token(self, token: str, subject: str) -> None:
        self.script[token] = subject

    def script_failure(self, token: str, failure: str) -> None:
        self.script[token] = failure

    def verify(self, *, access_token: str) -> VerifiedIdentity:
        self.calls.append(access_token)
        outcome = self.script.get(access_token, INVALID)
        if outcome == WRONG_APP:
            raise FamilyBridgeError("input_invalid",
                                    {"reason": "wrong_app_id"})
        if outcome == EXPIRED:
            raise FamilyBridgeError("input_invalid", {"reason": "token_expired"})
        if outcome == NETWORK_ERROR:
            raise TemporarilyUnavailable({"reason": "provider_unreachable"})
        if outcome == INVALID:
            raise InputInvalid({"reason": "invalid_credential"})
        return VerifiedIdentity(provider="zalo", app_id=self.app_id,
                                provider_subject=str(outcome))


class FakeAIProvider:
    """Scripted rephrase provider. Never network. Records minimal metadata —
    and deliberately does NOT store input text beyond what a test asserts on,
    so no test accidentally 'passes' because the double leaked data."""

    def __init__(self) -> None:
        self.script: Dict[str, object] = {}
        self.calls: list = []

    def script_response(self, marker: str, suggestion: str) -> None:
        self.script[marker] = suggestion

    def script_failure(self, marker: str, failure: str) -> None:
        self.script[marker] = failure

    def rephrase(self, *, text: str, audience_context: str) -> str:
        marker = f"{audience_context}:{len(text)}"
        self.calls.append({"marker": marker, "chars": len(text)})
        outcome = self.script.get(marker, self.script.get("*"))
        if outcome is None:
            raise TemporarilyUnavailable({"reason": "provider_unavailable"})
        if outcome == "timeout":
            raise TemporarilyUnavailable({"reason": "provider_timeout"})
        if outcome == "quota":
            raise FamilyBridgeError("rate_limited", {"reason": "provider_quota"})
        return str(outcome)


class FakeAuditWriter:
    """In-memory AuditWriter asserting redaction invariants (SEC-22)."""

    FORBIDDEN = ("body", "approved_body", "original_text", "private_body",
                 "prompt", "token", "invite_code", "phone")

    def __init__(self) -> None:
        self.events: list = []

    def record(self, *, actor_id: str, action: str, target_ref: str,
               outcome: str, reason: str | None = None,
               metadata: Optional[dict] = None) -> str:
        for key in self.FORBIDDEN:
            assert key not in (metadata or {}), f"audit leaked forbidden key {key}"
        self.events.append({
            "actor_id": actor_id, "action": action, "target_ref": target_ref,
            "outcome": outcome, "reason": reason,
            "metadata": dict(metadata or {}),
            "at": dt.datetime.now(tz=UTC).isoformat(),
        })
        return f"audit-{len(self.events)}"
