"""Hợp đồng GET /api/v1/ready/ — DB reachability, fail-safe, không leak (SEC-22/27).

Nguồn port: origin/feat/us-003-kt01:backend/core/tests.py.
Lưu ý: không dùng override_settings(DATABASES=...) để mô phỏng DB hỏng — Django 5.2
không reset connection khi override DATABASES (django.test.signals chỉ cảnh báo
"Overriding setting DATABASES can lead to unexpected behavior"); vì vậy kịch bản DB
lỗi được tạo bằng patch cursor raise OperationalError (đúng cách kt01 đã review).
"""

from unittest.mock import patch

from django.db import OperationalError
from django.test import TestCase


class ReadinessEndpointTests(TestCase):
    def test_ready_checks_database(self):
        # Ported verbatim từ kt01.
        self.assertEqual(self.client.get("/api/v1/ready/").status_code, 200)

    def test_ready_performs_exactly_one_database_query(self):
        # Đúng đặc tả: chỉ SELECT 1 — không quét schema, không list bảng.
        with self.assertNumQueries(1):
            response = self.client.get("/api/v1/ready/")
        self.assertEqual(response.status_code, 200)

    def test_ready_failure_does_not_leak_database_error(self):
        # Ported verbatim từ kt01 (OperationalError với message chứa "password=secret").
        with patch("core.views.connection.cursor", side_effect=OperationalError("password=secret")):
            response = self.client.get("/api/v1/ready/")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"status": "unavailable"})

    def test_ready_failure_logs_class_name_only_and_body_has_no_error_markers(self):
        # SEC-22/SEC-27: kể cả khi message lỗi DB chứa host/password thật,
        # log chỉ được chứa TÊN CLASS ngoại lệ; body phải đúng hợp đồng và
        # không chứa bất kỳ marker nào của dữ liệu nhạy cảm.
        sensitive = 'mysql host "db-leak-host.internal:3306" password="leak-pass-xyz"'
        with self.assertLogs("core.views", level="WARNING") as captured:
            with patch("core.views.connection.cursor", side_effect=OperationalError(sensitive)):
                response = self.client.get("/api/v1/ready/")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"status": "unavailable"})
        body = response.content.decode().lower()
        for marker in ("mysql", "host", "password", "leak", "3306"):
            self.assertNotIn(marker, body)

        self.assertEqual(len(captured.records), 1)
        logged = captured.records[0].getMessage()
        self.assertIn("OperationalError", logged)
        self.assertNotIn("leak-host", logged)
        self.assertNotIn("leak-pass", logged)
        self.assertNotIn("3306", logged)
