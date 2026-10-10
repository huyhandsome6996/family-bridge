from unittest.mock import patch
from django.db import OperationalError
from django.test import TestCase, override_settings
from rest_framework.test import APIClient, APIRequestFactory
from rest_framework.views import APIView
from rest_framework.response import Response


class PrivateProbe(APIView):
    def get(self, request):
        return Response({"private": True})


class FoundationTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_health_is_public_without_exposing_configuration(self):
        response = self.client.get("/api/v1/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})
        self.assertEqual(response["Cache-Control"], "no-store")

    def test_ready_checks_database(self):
        self.assertEqual(self.client.get("/api/v1/ready/").status_code, 200)

    def test_ready_failure_does_not_leak_database_error(self):
        with patch("core.views.connection.cursor", side_effect=OperationalError("password=secret")):
            response = self.client.get("/api/v1/ready/")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"status": "unavailable"})

    def test_future_api_views_require_authentication_by_default(self):
        response = PrivateProbe.as_view()(APIRequestFactory().get("/probe/"))
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["error"]["code"], "not_authenticated")

    @override_settings(CORS_ALLOWED_ORIGINS=["https://h5.zdn.vn"])
    def test_cors_accepts_only_configured_origins(self):
        for origin, allowed in [("https://h5.zdn.vn", True), ("https://attacker.example", False)]:
            response = self.client.options("/api/v1/health/", HTTP_ORIGIN=origin, HTTP_ACCESS_CONTROL_REQUEST_METHOD="GET")
            self.assertEqual("Access-Control-Allow-Origin" in response, allowed)

    def test_login_is_not_faked_by_accepting_client_identity(self):
        self.assertEqual(self.client.post("/api/v1/auth/zalo/", {"zalo_id": "someone-else"}).status_code, 404)
