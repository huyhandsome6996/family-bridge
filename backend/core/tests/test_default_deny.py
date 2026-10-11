"""Default-deny (SEC-03) + các endpoint KHÔNG được tồn tại ở nền tảng này.

Nguồn port: origin/feat/us-003-kt01:backend/core/tests.py (test default-deny và
POST /api/v1/auth/zalo/). Bổ sung: không endpoint phát hành token, không /admin/.
"""

from django.test import TestCase
from django.urls import NoReverseMatch, reverse
from rest_framework.test import APIClient, APIRequestFactory

from core.tests.probes import PrivateProbe


class DefaultDenyTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_future_api_views_require_authentication_by_default(self):
        # Ported verbatim từ kt01: APIView kế thừa IsAuthenticated → 401 + envelope.
        response = PrivateProbe.as_view()(APIRequestFactory().get("/probe/"))
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["error"]["code"], "not_authenticated")

    def test_no_token_issuance_endpoint_exists(self):
        # US-011 chưa triển khai: không được có đường phát hành/refresh token nào.
        with self.assertRaises(NoReverseMatch):
            reverse("token_obtain_pair")
        self.assertEqual(self.client.post("/api/v1/token/").status_code, 404)
        self.assertEqual(self.client.post("/api/v1/token/refresh/").status_code, 404)

    def test_admin_site_is_not_installed(self):
        # SEC-27: production tối thiểu — scaffold không đăng ký admin site.
        self.assertEqual(self.client.get("/admin/").status_code, 404)
        self.assertEqual(self.client.get("/admin/login/").status_code, 404)

    def test_login_is_not_faked_by_accepting_client_identity(self):
        # Ported verbatim từ kt01: không chấp nhận zalo_id client tự khai (SEC-01).
        self.assertEqual(
            self.client.post("/api/v1/auth/zalo/", {"zalo_id": "someone-else"}).status_code,
            404,
        )
