"""DB-backed sliding-window guard cho dang nhap tai khoan lop (SEC-14).

Pattern: ClaimRateGuard cua F01 (services/invites.py) — check + record CAM
KET trong transaction rieng TRUOC transaction nghiep vu, de mot thu dang
nhap that bai van duoc dem ke ca khi nghiep vu rollback.

Khoa bam co domain-separation (khong luu ma dang nhap thô):
- acct:<user-uuid>  — theo tai khoan (thu do mat khau)
- codeh:hmac_sha256(key=sha256(SECRET_KEY+b"fb-classroom-guard").digest(),
  msg=normalized_code)[:40] — theo MA da bam (HMAC domain-separated, khong
  the dao nguoc thanh ma, tranh phu thuoc SECRET_KEY truc tiep)
- ip:sha256(ip)[:40] — theo dia chi client

Nguong: MAX_FAILURES ket qua sai trong WINDOW (15 phut) → khoa. Ket qua
"locked_out" duoc ghi de kiem toan nhung KHONG cong vao nguong (khong keo
dai cua so khoa vo han khi bi dia chi no) — chi sai mat khau/ma la mo dem.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import hmac

from django.conf import settings as dj_settings

from family_bridge_core.errors import RateLimited
from family_bridge_core.timeutils import UTC

from ..models import (
    OUTCOME_LOCKED_OUT, OUTCOME_OK, OUTCOME_UNKNOWN_CODE, OUTCOME_WRONG_PASSWORD,
    LoginAttempt,
)

MAX_FAILURES = 10
WINDOW_MINUTES = 15
WINDOW = dt.timedelta(minutes=WINDOW_MINUTES)

# Ket qua TINH VAO nguong khoa (sai thong tin xac thuc).
COUNTED_FAILURES = (OUTCOME_WRONG_PASSWORD, OUTCOME_UNKNOWN_CODE)
FAIL_OUTCOMES = (OUTCOME_WRONG_PASSWORD, OUTCOME_UNKNOWN_CODE, OUTCOME_LOCKED_OUT)

_GUARD_DOMAIN = b"fb-classroom-guard"


def _secret_digest() -> bytes:
    return hashlib.sha256(
        dj_settings.SECRET_KEY.encode("utf-8") + _GUARD_DOMAIN).digest()


def guard_key_for_account(user_id) -> str:
    return f"acct:{user_id}"


def guard_key_for_code(normalized_code: str) -> str:
    mac = hmac.new(_secret_digest(), normalized_code.encode("utf-8"),
                   hashlib.sha256).hexdigest()
    return f"codeh:{mac[:40]}"


def guard_key_for_ip(ip: str) -> str:
    return "ip:" + hashlib.sha256((ip or "").encode("utf-8")).hexdigest()[:40]


class LoginRateGuard:
    """Check + ghi thu dang nhap theo nhom khoa, window truot trong DB."""

    def __init__(self, *, max_failures: int = MAX_FAILURES,
                 window: dt.timedelta = WINDOW) -> None:
        self.max_failures = max_failures
        self.window = window

    def assert_not_locked(self, *, keys, now: dt.datetime | None = None) -> None:
        """Mot khoa nao duoc dem >= max_failures sai trong window → RateLimited."""
        now = now or dt.datetime.now(tz=UTC)
        window_start = now - self.window
        for key in keys:
            recent = LoginAttempt.objects.filter(
                attempt_key=key, attempted_at__gte=window_start,
                outcome__in=COUNTED_FAILURES).count()
            if recent >= self.max_failures:
                raise RateLimited({"reason": "too_many_attempts",
                                   "window_minutes": WINDOW_MINUTES})

    def record(self, *, keys, outcome: str,
               now: dt.datetime | None = None) -> None:
        """Ghi ket qua thu dang nhap cho TAT CA cac khoa, transaction rieng."""
        if outcome not in FAIL_OUTCOMES and outcome != OUTCOME_OK:
            raise ValueError(f"unknown login outcome: {outcome}")
        now = now or dt.datetime.now(tz=UTC)
        from django.db import transaction
        with transaction.atomic():
            LoginAttempt.objects.bulk_create([
                LoginAttempt(attempt_key=key, outcome=outcome, attempted_at=now)
                for key in keys
            ])
