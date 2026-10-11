"""F13 service: verified help directory with an honest, verified fallback.

Public allowlist endpoint (B00 contract): unauthenticated access is
INTENTIONAL — the help page must open even when auth/backend degrade
(WF-06/SEC-24). Nothing here stores call history or purpose; the endpoint
is read-only and stateless (no telemetry beyond normal access logs).

Rules:
- Provider port (B12/B13 content owner) returns VERIFIED contacts only;
  this service defensively re-filters (verified flag, review_due date,
  retired status) so a misbehaving provider cannot leak unverified numbers.
- A contact past its review_due shows NO phone number — just an honest
  "verification expired" status and the guidance path. Never fabricate
  numbers, never keep stale numbers visible.
- Fallback = a SMALL code-level verified snapshot with provenance and
  review_due, used ONLY when the provider fails. If the fallback itself is
  past review_due, the response degrades to guidance-only (no numbers).
- open_now is computed from the CONTACT's own timezone — no client clock.
"""

from __future__ import annotations

import datetime as dt
from typing import Any, Dict, List, Optional

from family_bridge_core.timeutils import UTC

from . import registry

FALLBACK_VERSION = "2026.10-fb1"
FALLBACK_REVIEW_DUE = dt.date(2027, 4, 11)  # re-verify cadence (DEC-17)
FALLBACK_CONTACTS: List[Dict[str, Any]] = [
    {
        "contact_id": "fb-te-111",
        "public_name": "Tổng đài quốc gia bảo vệ trẻ em 111",
        "phone": "111",
        "hours": {"always": True},
        "tz_offset_hours": 7,
        "contact_type": "help",
        "accepting_appointments": False,
        "provenance": "fallback snapshot kèm build; cần xác minh lại định kỳ "
                      "(external-inputs.md) — KHÔNG phải danh bạ production",
    },
]


def _compute_open(hours: Dict[str, Any], tz_offset_hours: int,
                  now: dt.datetime) -> bool:
    """open_now computed in the CONTACT's timezone (deterministic, testable)."""
    local_now = now.astimezone(dt.timezone(
        dt.timedelta(hours=tz_offset_hours)))
    if not isinstance(hours, dict):
        return False
    if hours.get("always"):
        return True
    start = hours.get("start_hour")
    end = hours.get("end_hour")
    if not isinstance(start, int) or not isinstance(end, int):
        return False
    return start <= local_now.hour < end


def _is_review_current(review_due, today: dt.date) -> bool:
    """review_due may arrive as ISO string or date (provider contract is
    dict-shaped); parse defensively — malformed means NOT current."""
    if review_due is None:
        return True
    if isinstance(review_due, str):
        try:
            review_due = dt.date.fromisoformat(review_due[:10])
        except ValueError:
            return False
    if not isinstance(review_due, dt.date):
        return False
    return review_due >= today


class HelpDirectoryService:
    def directory(self, *, now: Optional[dt.datetime] = None) -> Dict[str, Any]:
        now = now or dt.datetime.now(tz=UTC)
        today = now.astimezone(UTC).date()
        try:
            provider = registry.get_directory_reader()
            if provider is None:
                raise ModuleNotFoundError("directory provider unwired")
            raw_contacts = list(provider.list_public_contacts(now=now))
            source = "provider"
            fallback_used = False
        except Exception:
            if _is_review_current(FALLBACK_REVIEW_DUE, today):
                raw_contacts = [dict(c) for c in FALLBACK_CONTACTS]
                source = f"fallback:{FALLBACK_VERSION}"
                fallback_used = True
            else:
                return {
                    "contacts": [], "source": "fallback_expired",
                    "fallback": True,
                    "guidance": "Danh bạ dự phòng đã HẾT hạn xác minh. "
                                "Hãy liên hệ người tin cậy ngay; danh bạ mới "
                                "sẽ có sau khi xác minh lại.",
                    "server_time": now.isoformat(),
                }

        contacts: List[Dict[str, Any]] = []
        for raw in raw_contacts:
            if not isinstance(raw, dict):
                continue
            if raw.get("verified") is False or raw.get("status") == "retired":
                continue  # never show unverified/retired entries
            review_due = raw.get("review_due")
            review_current = _is_review_current(review_due, today)
            phone = str(raw.get("phone", "")) if review_current else ""
            contacts.append({
                "contact_id": str(raw.get("contact_id", ""))[:64],
                "public_name": str(raw.get("public_name", ""))[:200],
                "phone": phone,
                "operating_hours": raw.get("hours", raw.get(
                    "operating_hours", {"always": True})),
                "service_timezone": str(raw.get("service_timezone",
                                                raw.get("tz_offset_hours",
                                                        7))),
                "contact_type": str(raw.get("contact_type", "help"))[:16],
                "accepting_appointments": bool(
                    raw.get("accepting_appointments", False)),
                "open_now": _compute_open(
                    raw.get("hours", raw.get("operating_hours",
                                             {"always": True})),
                    int(raw.get("tz_offset_hours", 7)
                        if isinstance(raw.get("tz_offset_hours"), int)
                        else 7), now),
                "status": ("verified" if review_current
                           else "verification_expired"),
                "provenance": str(raw.get("provenance", ""))[:300],
            })
        contacts.sort(key=lambda row: row["public_name"])
        return {"contacts": contacts, "source": source,
                "fallback": fallback_used,
                "server_time": now.isoformat()}
