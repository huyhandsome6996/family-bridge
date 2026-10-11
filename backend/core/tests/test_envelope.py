"""Envelope lỗi {"error":{"code","details"}} — hợp đồng docs/contracts/api-foundation.md mục 3.

Kiểm chứng đủ các đường DRF xử lý: ValidationError (400), Http404 từ trong view
(404), MethodNotAllowed (405). Đường 404 không resolve được dưới /api/v1/ là lỗi
Django thuần (không qua DRF) — hợp đồng ghi rõ "Lỗi ngoài DRF chưa được chuẩn
hóa", nên test chỉ yêu cầu 404 + không leak cấu hình, không ép envelope.
"""

from django.test import TestCase
from rest_framework.test import APIClient, APIRequestFactory

from core.tests.probes import NotFoundProbe, ValidationErrorProbe


class ErrorEnvelopeTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_validation_error_uses_contract_envelope(self):
        response = ValidationErrorProbe.as_view()(APIRequestFactory().get("/probe/"))
        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.data)
        self.assertEqual(response.data["error"]["code"], "invalid")
        self.assertIn("details", response.data["error"])
        self.assertEqual(response["Cache-Control"], "no-store")

    def test_drf_404_from_view_uses_contract_envelope(self):
        # Http404 raise từ trong DRF view → DRF NotFound → envelope; chỉ bắt
        # SHAPE (code/details), không khóa giá trị code cụ thể.
        response = NotFoundProbe.as_view()(APIRequestFactory().get("/probe/"))
        self.assertEqual(response.status_code, 404)
        error = response.data.get("error", {})
        self.assertIn("code", error)
        self.assertIn("details", error)
        self.assertIsInstance(error["code"], str)
        self.assertNotEqual(error["code"], "")

    def test_method_not_allowed_uses_contract_envelope(self):
        # @api_view(["GET"]) → POST phải 405 và đi qua envelope (method strict, SEC-27).
        response = self.client.post("/api/v1/health/")
        self.assertEqual(response.status_code, 405)
        self.assertEqual(response.data["error"]["code"], "method_not_allowed")
        self.assertEqual(response["Cache-Control"], "no-store")

    def test_unknown_api_path_is_plain_404_without_configuration_leak(self):
        # Đường không resolve KHÔNG qua DRF (không envelope) — chỉ chứng minh
        # 404 và không lộ cấu hình/traceback cho client (SEC-27).
        response = self.client.get("/api/v1/does-not-exist/")
        self.assertEqual(response.status_code, 404)
        body = response.content.decode(errors="replace").lower()
        for marker in ("traceback", "secret", "password", "settings.py", "django.db"):
            self.assertNotIn(marker, body)
