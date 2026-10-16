"""Capability snapshot cho web/mini-app (F16) — public, doc-only.

- login_methods.local_class: DANG NHAP LOP luon bat khi f16 duoc mount.
- login_methods.zalo: chi TRUE khi FB_ZALO_LOGIN_ENABLED bat VA du day du
  ZALO_APP_ID/ZALO_APP_SECRET. Thieu bat ky dieu kien nao → False (fail
  closed — UI khong hien nut Zalo).
- settings: cac endpoint cau hinh F16 da mo.
- policy.no_forced_password_change: F16 khong ep doi mat khau sau login.
"""

from __future__ import annotations

from django.conf import settings as dj_settings


def build() -> dict:
    zalo_ready = (bool(getattr(dj_settings, "FB_ZALO_LOGIN_ENABLED", True))
                  and bool(getattr(dj_settings, "ZALO_APP_ID", ""))
                  and bool(getattr(dj_settings, "ZALO_APP_SECRET", "")))
    return {
        "login_methods": {
            "local_class": True,
            "zalo": zalo_ready,
        },
        "settings": {
            "change_password": True,
            "change_code": True,
            "change_display_name": True,
        },
        "policy": {
            "no_forced_password_change": True,
        },
    }
