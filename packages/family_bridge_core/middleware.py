"""Middleware dung chung cho backend (family_bridge_core nam tren sys.path
ca cua backend/config/settings.py va cua harness settings).

F16 — Zalo dormancy gate (hop dong Task 19):
- Khi FB_ZALO_LOGIN_ENABLED=FALSE, POST /api/v1/auth/session (dang nhap Zalo
  cua F01) tra 503 module_unavailable/zalo_login_disabled — khong cham vao
  f01 api.py (nhánh do dang bi lock boi PR #33), khong leak nguyen nhan
  cay/cau hinh, va van tra Cache-Control: no-store.
- Flag duoc DOC TAI THOI DIEM REQUEST (getattr, khong cache) nen
  override_settings trong test co tac dung ngay ma khong can remount.
- Mặc định là TRUE (giu nguyen hanh vi hien tai); chi truong hop chung toi
  tat dang nhap Zalo thi moi 503.
- Khong mount o harness settings: harness khong test gate qua HTTP; gate
  duoc kiem tra bang backend settings (co mount) + unit test RequestFactory
  chay o ca hai moi truong.
"""

from __future__ import annotations

from django.conf import settings as dj_settings
from django.http import JsonResponse

_GATE_PATH = "/api/v1/auth/session"


class FBZaloDormancyMiddleware(object):
    """Chan dang nhap Zalo khi tinh nang o trang thai dormancy (F16)."""

    def __init__(self, get_response=None):
        self.get_response = get_response

    def __call__(self, request):
        if (not getattr(dj_settings, "FB_ZALO_LOGIN_ENABLED", True)
                and request.method == "POST"
                and request.path == _GATE_PATH):
            return JsonResponse(
                {"error": {"code": "module_unavailable",
                           "details": {"reason": "zalo_login_disabled"}}},
                status=503,
                headers={"Cache-Control": "no-store"},
            )
        return self.get_response(request)
