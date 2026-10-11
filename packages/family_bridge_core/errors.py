"""Stable machine error codes and typed errors.

Contract: docs/contracts/api-foundation.md (Phần "Payload patterns và lỗi").
Codes are stable API surface; HTTP status mapping is fixed here so every
feature returns the same envelope: {"error": {"code": "...", "details": {...}}}.

Never include stack traces, prompts, private bodies, tokens or invite codes
in details. Denied objects must not leak existence (404 vs 403 decided at the
service layer, consistently: default 404 for private objects, 403 for public
objects the actor may know about but not mutate).
"""

from __future__ import annotations

from typing import Any, Dict, Optional

ERROR_INPUT_INVALID = "input_invalid"
ERROR_NOT_AUTHENTICATED = "not_authenticated"
ERROR_NOT_AUTHORIZED = "not_authorized"
ERROR_NOT_FOUND = "not_found"
ERROR_REVISION_CONFLICT = "revision_conflict"
ERROR_PREVIEW_STALE = "preview_stale"
ERROR_DUPLICATE_KEY_PAYLOAD_MISMATCH = "duplicate_key_payload_mismatch"
ERROR_SLOT_UNAVAILABLE = "slot_unavailable"
ERROR_COOLDOWN_ACTIVE = "cooldown_active"
ERROR_CONSENT_REQUIRED = "consent_required"
ERROR_POLICY_NOT_APPROVED = "policy_not_approved"
ERROR_REPORT_POLICY_UNSET = "report_policy_unset"
ERROR_MODULE_UNAVAILABLE = "module_unavailable"
ERROR_RATE_LIMITED = "rate_limited"
ERROR_TEMPORARILY_UNAVAILABLE = "temporarily_unavailable"

HTTP_BY_CODE = {
    ERROR_INPUT_INVALID: 400,
    ERROR_NOT_AUTHENTICATED: 401,
    ERROR_NOT_AUTHORIZED: 403,
    ERROR_NOT_FOUND: 404,
    ERROR_REVISION_CONFLICT: 409,
    ERROR_PREVIEW_STALE: 409,
    ERROR_DUPLICATE_KEY_PAYLOAD_MISMATCH: 409,
    ERROR_SLOT_UNAVAILABLE: 409,
    ERROR_COOLDOWN_ACTIVE: 409,
    ERROR_CONSENT_REQUIRED: 403,
    ERROR_POLICY_NOT_APPROVED: 403,
    ERROR_REPORT_POLICY_UNSET: 403,
    ERROR_MODULE_UNAVAILABLE: 503,
    ERROR_RATE_LIMITED: 429,
    ERROR_TEMPORARILY_UNAVAILABLE: 503,
}

# Keys that must never be placed into error details (redaction guard).
FORBIDDEN_DETAIL_KEYS = frozenset({
    "token", "access_token", "refresh_token", "secret", "password",
    "code_hash", "invite_code", "original_text", "private_body", "body",
    "prompt", "approved_body", "provider_subject", "phone",
})


class FamilyBridgeError(Exception):
    """Typed error carrying a stable machine code and safe details."""

    code: str = ERROR_INPUT_INVALID

    def __init__(self, code: str, details: Optional[Dict[str, Any]] = None,
                 message: str = "") -> None:
        self.code = code
        self.details = sanitize_details(details or {})
        self.message = message or code
        super().__init__(self.message)

    @property
    def http_status(self) -> int:
        return HTTP_BY_CODE.get(self.code, 400)

    def to_payload(self) -> Dict[str, Any]:
        return {"error": {"code": self.code, "details": self.details}}


def sanitize_details(details: Dict[str, Any]) -> Dict[str, Any]:
    """Drop forbidden keys and oversized values; never raise on sanitize."""
    safe: Dict[str, Any] = {}
    for key, value in (details or {}).items():
        if str(key).lower() in FORBIDDEN_DETAIL_KEYS:
            continue
        text = value if isinstance(value, (int, float, bool)) else str(value)
        if isinstance(text, str) and len(text) > 200:
            text = text[:200]
        safe[str(key)] = text
    return safe


# Convenience subclasses ------------------------------------------------------
# Each subclass fixes its code and takes (details, message) so callers can
# raise CooldownActive({...}) directly without repeating the code string.

def _make_error_class(name: str, code: str):
    def __init__(self, details=None, message=""):
        FamilyBridgeError.__init__(self, code, details, message)
    namespace = {"code": code, "__init__": __init__,
                 "__module__": __name__, "__qualname__": name}
    return type(name, (FamilyBridgeError,), namespace)


class InputInvalid(FamilyBridgeError):
    code = ERROR_INPUT_INVALID

    def __init__(self, details=None, message=""):
        FamilyBridgeError.__init__(self, ERROR_INPUT_INVALID, details, message)


NotAuthenticated = _make_error_class("NotAuthenticated", ERROR_NOT_AUTHENTICATED)
NotAuthorized = _make_error_class("NotAuthorized", ERROR_NOT_AUTHORIZED)
NotFound = _make_error_class("NotFound", ERROR_NOT_FOUND)
RevisionConflict = _make_error_class("RevisionConflict", ERROR_REVISION_CONFLICT)
PreviewStale = _make_error_class("PreviewStale", ERROR_PREVIEW_STALE)
DuplicateKeyPayloadMismatch = _make_error_class(
    "DuplicateKeyPayloadMismatch", ERROR_DUPLICATE_KEY_PAYLOAD_MISMATCH)
SlotUnavailable = _make_error_class("SlotUnavailable", ERROR_SLOT_UNAVAILABLE)
CooldownActive = _make_error_class("CooldownActive", ERROR_COOLDOWN_ACTIVE)
ConsentRequired = _make_error_class("ConsentRequired", ERROR_CONSENT_REQUIRED)
PolicyNotApproved = _make_error_class("PolicyNotApproved", ERROR_POLICY_NOT_APPROVED)
ReportPolicyUnset = _make_error_class("ReportPolicyUnset", ERROR_REPORT_POLICY_UNSET)
ModuleUnavailable = _make_error_class("ModuleUnavailable", ERROR_MODULE_UNAVAILABLE)
RateLimited = _make_error_class("RateLimited", ERROR_RATE_LIMITED)
TemporarilyUnavailable = _make_error_class(
    "TemporarilyUnavailable", ERROR_TEMPORARILY_UNAVAILABLE)
