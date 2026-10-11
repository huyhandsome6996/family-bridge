"""SEC-14: throttle mặc định là hành vi thật (behavior), health/ready được miễn.

Lưu ý kỹ thuật (đã kiểm chứng trên DRF 3.16.1):
- `SimpleRateThrottle.THROTTLE_RATES = api_settings.DEFAULT_THROTTLE_RATES` được gán
  NGAY LÚC IMPORT MODULE (rest_framework/throttling.py dòng 66), nên
  override_settings(REST_FRAMEWORK={...rate thấp...}) KHÔNG đổi được rate lúc runtime
  (đã thử: request thứ 3 vẫn 200 với rate override 2/min). Vì vậy behavior test ở đây
  bắn request thật với rate ĐÃ CẤU HÌNH (anon 60/min, user 120/min), đọc số limite
  từ settings để test không vỡ khi US-004 siết số liệu; mọi request đi qua stack DRF
  thật (dispatch → permission → throttle → exception handler).
- DRF `APIView.initial()` chạy `check_permissions` TRƯỚC `check_throttles`
  (rest_framework/views.py dòng 424-426): request anon bị 401 KHÔNG bao giờ chạm
  throttle, nên hạn mức anon chỉ đo được trên view AllowAny (AnonProbe) — phát hiện
  này được ghi vào verification-report.md cho US-004.
"""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from core.views import health, readiness

PERIOD_SECONDS = {"s": 1, "m": 60, "h": 3600, "d": 86400}


def configured_rate_count(scope):
    """Số request tối đa/cửa sổ của rate đang cấu hình, vd '60/min' → 60."""
    rate = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"][scope]
    num, period = rate.split("/")
    return int(num)


class ThrottleBehaviorTests(TestCase):
    def setUp(self):
        # Lịch sử rate của DRF nằm trong cache process-wide → dọn để test độc lập.
        cache.clear()
        self.addCleanup(cache.clear)

    @override_settings(ROOT_URLCONF="core.tests.urls_probe")
    def test_anon_requests_exceeding_default_rate_get_429(self):
        # Đo trên AnonProbe (AllowAny) — đúng hàng chục request là lượt bị chặn.
        limit = configured_rate_count("anon")
        statuses = [self.client.get("/probe/anon/").status_code for _ in range(limit + 1)]
        self.assertEqual(statuses[limit - 1], 200)
        self.assertEqual(statuses[limit], 429)

        throttled = self.client.get("/probe/anon/")
        self.assertEqual(throttled.status_code, 429)
        self.assertEqual(throttled.data["error"]["code"], "throttled")

    @override_settings(ROOT_URLCONF="core.tests.urls_probe")
    def test_authenticated_requests_exceeding_default_rate_get_429(self):
        # User đã xác thực tiêu hạn mức user (120/min mặc định), không phải anon.
        user = get_user_model().objects.create_user("throttle-probe")
        client = APIClient()
        client.force_authenticate(user=user)
        limit = configured_rate_count("user")
        statuses = [client.get("/probe/").status_code for _ in range(limit + 1)]
        self.assertEqual(statuses[limit - 1], 200)
        self.assertEqual(statuses[limit], 429)
        self.assertEqual(client.get("/probe/").data["error"]["code"], "throttled")

    @override_settings(ROOT_URLCONF="core.tests.urls_probe")
    def test_health_and_ready_stay_200_while_other_anon_requests_are_throttled(self):
        # Vượt hạn mức anon bằng view thường (AnonProbe); cùng ident/cùng cửa sổ,
        # health/ready (miễn throttle qua @throttle_classes([])) vẫn phải 200 —
        # monitoring không bao giờ bị rate-limit.
        limit = configured_rate_count("anon")
        for _ in range(limit):
            self.client.get("/probe/anon/")
        self.assertEqual(self.client.get("/probe/anon/").status_code, 429)
        self.assertEqual(self.client.get("/api/v1/health/").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/ready/").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/health/").status_code, 200)

    def test_health_and_ready_views_declare_no_throttle_classes(self):
        # Guard cấu trúc (bổ trợ behavior test): @throttle_classes([]) trên cả hai
        # view nền tảng; nếu ai đó bỏ decorator, test này sẽ đỏ.
        self.assertEqual(health.cls.throttle_classes, [])
        self.assertEqual(readiness.cls.throttle_classes, [])
