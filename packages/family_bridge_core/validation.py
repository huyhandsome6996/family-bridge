"""Validation helpers with fixed bounds.

DSA-01: bounds are enforced at the backend. Over-limit input is rejected
 loudly (input_invalid with field name) — never silently truncated.
DEC-17: numeric baselines below are PROPOSALS adopted provisionally for
 synthetic development only; they must be ratified before production data.
"""

from __future__ import annotations

import re
import uuid
from typing import Any, Iterable, Optional

from .errors import InputInvalid

# Bounds (DEC-17 provisional; ratify before real data)
MAX_TEXT_CHARS = 4000            # private/public text per item
MAX_JSON_BYTES = 64 * 1024       # JSON body per request
MAX_LIST_ITEMS = 50              # allowlist array entries
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 50
MAX_REASON_CHARS = 500
MIN_REASON_CHARS = 10
MAX_TITLE_CHARS = 120
MAX_IDempotency_KEY_CHARS = 128

_IDEMPOTENCY_KEY_RE = re.compile(r"^[A-Za-z0-9_.:\-]{8,128}$")
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def strip_dangerous_control_chars(value: str) -> str:
    """Remove C0 control chars (except \n and \t) — data hygiene, not truncation."""
    return _CONTROL_RE.sub("", value)


def validate_text(value: Any, *, field: str, min_len: int = 0,
                  max_len: int = MAX_TEXT_CHARS, allow_empty: bool = False,
                  strip: bool = True) -> str:
    if not isinstance(value, str):
        raise InputInvalid({"field": field, "reason": "must_be_string"})
    text = strip_dangerous_control_chars(value)
    if strip:
        text = text.strip()
    length = len(text)
    if not allow_empty and length < max(min_len, 1):
        raise InputInvalid({"field": field, "reason": "too_short", "min": min_len})
    if length > max_len:
        raise InputInvalid({"field": field, "reason": "too_long",
                            "max": max_len, "received": length})
    return text


def validate_enum(value: Any, *, field: str, allowed: Iterable[str]) -> str:
    if not isinstance(value, str) or value not in set(allowed):
        raise InputInvalid({"field": field, "reason": "invalid_enum",
                            "allowed": sorted(set(allowed))})
    return value


def validate_uuid(value: Any, *, field: str) -> uuid.UUID:
    if isinstance(value, uuid.UUID):
        return value
    if not isinstance(value, str):
        raise InputInvalid({"field": field, "reason": "must_be_uuid_string"})
    try:
        return uuid.UUID(value)
    except (ValueError, AttributeError) as exc:
        raise InputInvalid({"field": field, "reason": "malformed_uuid"}) from exc


def validate_idempotency_key(value: Any, *, field: str = "idempotency_key") -> str:
    if not isinstance(value, str) or not _IDEMPOTENCY_KEY_RE.match(value):
        raise InputInvalid({"field": field,
                            "reason": "invalid_format_expected_8_128_chars"})
    return value


def validate_page_size(value: Optional[int]) -> int:
    if value is None:
        return DEFAULT_PAGE_SIZE
    try:
        page = int(value)
    except (TypeError, ValueError) as exc:
        raise InputInvalid({"field": "page_size", "reason": "must_be_int"}) from exc
    if page <= 0:
        return DEFAULT_PAGE_SIZE
    if page > MAX_PAGE_SIZE:
        return MAX_PAGE_SIZE
    return page


def validate_revision(value: Any, *, field: str = "expected_revision") -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise InputInvalid({"field": field, "reason": "must_be_integer"})
    if value < 1:
        raise InputInvalid({"field": field, "reason": "must_be_positive"})
    return value


def validate_reason(value: Any, *, field: str = "reason") -> str:
    return validate_text(value, field=field, min_len=MIN_REASON_CHARS,
                         max_len=MAX_REASON_CHARS)


def reject_unknown_fields(payload: dict, allowed: Iterable[str]) -> None:
    """SEC-05: reject unknown top-level fields instead of ignoring them."""
    allowed_set = set(allowed)
    unknown = sorted(set(payload) - allowed_set)
    if unknown:
        raise InputInvalid({"reason": "unknown_fields", "fields": unknown[:20]})
