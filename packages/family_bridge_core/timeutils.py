"""Time helpers: UTC storage, Asia/Ho_Chi_Minh display (contract rule 5).

- All DB timestamps are UTC (USE_TZ=True).
- Local business days (mood entries, program weeks) use an explicit timezone
  from an IANA allowlist; default Asia/Ho_Chi_Minh (CFG-I05).
- Cooldown deadline is ALWAYS computed from server time (DEC-03).
"""

from __future__ import annotations

import datetime as dt
from zoneinfo import ZoneInfo

UTC = dt.timezone.utc

TIMEZONE_ALLOWLIST = ("Asia/Ho_Chi_Minh",)

DEFAULT_TZ = ZoneInfo("Asia/Ho_Chi_Minh")

PAUSE_SECONDS = 300  # DEC-03: fixed, server-side, read-only


def to_timezone(value: dt.datetime, tzname: str = "Asia/Ho_Chi_Minh") -> dt.datetime:
    """Convert an aware datetime to the allowlisted display timezone."""
    if tzname not in TIMEZONE_ALLOWLIST:
        raise ValueError(f"timezone not allowed: {tzname}")
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(ZoneInfo(tzname))


def local_day(value: dt.datetime, tzname: str = "Asia/Ho_Chi_Minh") -> dt.date:
    """Calendar day in the display timezone (mood entry uniqueness key)."""
    return to_timezone(value, tzname).date()


def ensure_utc(value: dt.datetime) -> dt.datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def iso_utc(value: dt.datetime) -> str:
    return ensure_utc(value).isoformat()


def parse_iso(value: str) -> dt.datetime:
    parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    return ensure_utc(parsed)


def cooldown_deadline(now: dt.datetime, seconds: int = PAUSE_SECONDS) -> dt.datetime:
    """cooldown_until = server_now + 300. Only explicit re-pause by the author
    resets it; timers/AI/retry/resume NEVER send (DEC-03, WF-06)."""
    return ensure_utc(now) + dt.timedelta(seconds=seconds)
