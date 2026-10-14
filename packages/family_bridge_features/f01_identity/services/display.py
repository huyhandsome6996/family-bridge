"""Self-declared display identity for the bilateral connection check.

Review fix ("XÁC NHẬN ĐÚNG NGƯỜI"): both parties must be able to check WHO
they are connecting with before accept/confirm/revoke. FL-02 requires the UI
to show "danh tính tối thiểu" (access-sharing-matrix: ConnectionInvite/
Connection rows expose "metadata nhận biết tối thiểu" to the two involved
actors only).

Policy decisions encoded here:
- The ONLY identifier we expose to the counterpart is a SELF-DECLARED
  display name. It is NOT the Zalo-verified identity: F01 deliberately does
  not request name/avatar scope (permission must stay optional, refusal must
  degrade gracefully), and phone/GPS are never requested.
- Storage reuses the built-in auth User.first_name column (max 150 chars) so
  NO schema/migration change is needed — models.py/migrations stay untouched
  (W036 ownership: review/full-product-integration).
- Every payload carrying such a name also carries
  identity_basis="self_declared" so the UI can label it honestly as
  "tên tự khai báo — không phải danh tính Zalo đã xác minh".
- Raw provider_subject and internal UUIDs are NEVER included in these
  payloads (matrix: no provider_subject export; review: raw UUID is not a
  usable identity check anyway).

Lookup helpers batch with a single query (DSA: no N+1 on list endpoints).
"""

from __future__ import annotations

from typing import Dict, Iterable, Optional

from django.contrib.auth import get_user_model

from family_bridge_core.errors import InputInvalid
from family_bridge_core.validation import (
    strip_dangerous_control_chars, validate_text,
)

IDENTITY_BASIS_SELF_DECLARED = "self_declared"
MAX_DISPLAY_NAME_CHARS = 80


def normalize_display_name(raw) -> str:
    """Validate + normalize a client-supplied display name (bounded, SEC-05).

    Raises InputInvalid with stable reasons; never silently truncates
    (DSA-01). Unicode letters (Vietnamese included), spaces and common
    separators are accepted; control characters are stripped first.
    """
    text = validate_text(
        raw, field="display_name", min_len=1, max_len=MAX_DISPLAY_NAME_CHARS)
    collapsed = " ".join(text.split())
    if not collapsed:
        raise InputInvalid({"field": "display_name", "reason": "too_short"})
    return collapsed


def save_display_name(user, raw) -> str:
    """Persist the self-declared display name on the auth user row."""
    name = normalize_display_name(raw)
    user.first_name = name
    user.save(update_fields=["first_name"])
    return name


def display_name_of(user) -> Optional[str]:
    name = (getattr(user, "first_name", "") or "").strip()
    return name or None


def display_profile(user) -> dict:
    """Payload for ONE counterpart; honest about the identity basis."""
    return {
        "display_name": display_name_of(user),
        "identity_basis": IDENTITY_BASIS_SELF_DECLARED,
    }


def display_profiles_for(user_ids: Iterable) -> Dict[str, dict]:
    """Batch lookup: {user_id: profile} in ONE query (list endpoints, no N+1).

    Unknown/absent ids map to a profile with display_name=None so callers can
    render "người này chưa đặt tên gọi" instead of guessing.
    """
    ids = {str(uid) for uid in user_ids if uid}
    if not ids:
        return {}
    # in_bulk keys are CONVERTED field values (UUID objects for UUIDField),
    # so normalize both sides to str before matching.
    found = get_user_model().objects.in_bulk(ids)
    profiles: Dict[str, dict] = {}
    for user_id in ids:
        user = found.get(user_id) or found.get(_as_uuid(user_id))
        profiles[user_id] = (display_profile(user) if user is not None
                             else {"display_name": None,
                                   "identity_basis": IDENTITY_BASIS_SELF_DECLARED})
    return profiles


def _as_uuid(user_id: str):
    """Best-effort UUID coercion for in_bulk key matching; None if invalid."""
    import uuid as _uuid
    try:
        return _uuid.UUID(str(user_id))
    except (ValueError, AttributeError, TypeError):
        return None


__all__ = [
    "IDENTITY_BASIS_SELF_DECLARED",
    "MAX_DISPLAY_NAME_CHARS",
    "display_name_of",
    "display_profile",
    "display_profiles_for",
    "normalize_display_name",
    "save_display_name",
    "strip_dangerous_control_chars",
]
