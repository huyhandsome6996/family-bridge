"""Shared test helpers cho F16 (tai su dung helpers cua f01)."""

from __future__ import annotations

import csv
import io
import os
import tempfile
import uuid

from django.conf import settings as dj_settings
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from family_bridge_features.f01_identity.tests.helpers import (  # noqa: F401
    accept_service_consent, auth_header, make_session,
)

from ..models import ClassAccount, CompanionProposal

DEFAULT_PASSWORD = "InitPass2026!"
ACCOUNTS_HEADER = ["external_ref", "login_code", "role", "class_ref",
                   "display_name"]
PROPOSALS_HEADER = ["student_login_code", "caregiver_login_code"]


def _scoped_only_throttle_override() -> dict:
    """Doc thoi de kiem soat throttle per-process cua backend trong test.

    Backend settings mac dinh co AnonRateThrottle 60/min chia bucket
    per-process theo IP (LocMemCache). Bucket nay KHONG reset giua cac test
    va KHONG the doi bang override_settings (DRF APIView chup
    DEFAULT_THROTTLE_CLASSES luc import view). Suite f16 tao hang tram
    request tu 127.0.0.1 nen bucket tran lam cac test khac (core envelope)
    nhan 429 that ba. Gioi han hop dong (class_login 200/h, guard DB
    10/15ph) van duoc kiem tra that — khong bo qua check nao.
    """
    rest = dict(getattr(dj_settings, "REST_FRAMEWORK", {}) or {})
    rest["DEFAULT_THROTTLE_CLASSES"] = [
        "rest_framework.throttling.ScopedRateThrottle"]
    return {"REST_FRAMEWORK": rest}


class ScopedThrottleTestCase(TestCase):
    """TestCase phong ve throttle per-process cho suite f16.

    Mỗi test bắt đầu với cache sạch (reset bucket AnonRateThrottle/UserRate
    giữa các test — bucket LocMemCache sống xuyên test trong cùng process).
    Dùng setUpClass enable thủ công (không qua class decorator) để các
    subclass vẫn có thể thêm @override_settings(PASSWORD_HASHERS=...) riêng
    mà không mất override của lớp cha.
    """

    _throttle_ctx = None

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._throttle_ctx = override_settings(
            **_scoped_only_throttle_override())
        cls._throttle_ctx.enable()

    def setUp(self):
        super().setUp()
        from django.core.cache import cache
        cache.clear()

    @classmethod
    def tearDownClass(cls):
        if cls._throttle_ctx is not None:
            cls._throttle_ctx.disable()
            cls._throttle_ctx = None
        super().tearDownClass()


def make_class_account(code, role, *, password=DEFAULT_PASSWORD, class_ref="10A1",
                       external_ref=None, display_name=None, is_active=True):
    """Tao User + ClassAccount cho test. Tra ve (account, user)."""
    User = get_user_model()
    user = User.objects.create_user(
        username=f"cls_test_{uuid.uuid4().hex[:12]}",
        password=password,
        first_name=display_name or code,
    )
    if not is_active:
        user.is_active = False
        user.save(update_fields=["is_active"])
    account = ClassAccount.objects.create(
        user=user, login_code=code.upper(), role=role, class_ref=class_ref,
        external_ref=external_ref or f"ext-{uuid.uuid4().hex[:10]}")
    return account, user


def make_proposal(student, caregiver, *, status=CompanionProposal.STATUS_PROPOSED):
    return CompanionProposal.objects.create(
        student_account=student, caregiver_account=caregiver, status=status)


def accounts_csv_text(rows):
    """rows: list of (external_ref, login_code, role, class_ref, display_name)."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(ACCOUNTS_HEADER)
    for row in rows:
        writer.writerow(row)
    return buffer.getvalue()


def proposals_csv_text(pairs):
    """pairs: list of (student_login_code, caregiver_login_code)."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(PROPOSALS_HEADER)
    for pair in pairs:
        writer.writerow(pair)
    return buffer.getvalue()


def write_temp_csv(text: str) -> str:
    handle = tempfile.NamedTemporaryFile(
        "w", suffix=".csv", delete=False, encoding="utf-8", newline="")
    handle.write(text)
    handle.close()
    return handle.name


def cleanup_csv(path: str) -> None:
    try:
        os.unlink(path)
    except OSError:
        pass
