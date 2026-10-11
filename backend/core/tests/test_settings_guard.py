"""Guard cấu hình production (SEC-09/SEC-19/SEC-27) — kiểm chứng fail-closed.

Chạy `python manage.py check` trong tiến trình con với DJANGO_SETTINGS_MODULE=config.settings
để chứng minh settings thật fail-closed (thiếu secret/secret yếu/SQLite/Wildcard hosts
đều từ chối khởi động) và cấu hình hợp lệ passing `check`/`check --deploy`. Chạy
subprocess thay vì override_settings để kiểm tra đúng luồng import settings một lần
như runtime; `check` không kết nối DB nên không cần MySQL server thật — nhưng
settings production import driver MySQL, nên các test DƯƠNG TÍNH (exit 0) chỉ chạy
khi mysqlclient import được (máy không root không build được → skip có lý do;
bằng chứng dương tính thuộc CI job production-guard).

Secret chỉ là chuỗi dummy vô nghĩa sinh ngẫu nhiên trong test (SEC-19) và test
luôn assert giá trị dummy không xuất hiện trong output.
"""

import os
import re
import secrets
import subprocess
import sys
import unittest
from pathlib import Path

from django.test import SimpleTestCase

try:
    import MySQLdb  # noqa: F401 — chỉ kiểm tra khả năng import
    MYSQL_CLIENT_AVAILABLE = True
except ImportError:
    MYSQL_CLIENT_AVAILABLE = False

BACKEND_DIR = Path(__file__).resolve().parents[2]

# Biến môi trường có thể ảnh hưởng settings; bị loại khỏi env subprocess để
# mỗi test tự quyết định đúng bộ giá trị cần kiểm chứng.
STRIPPED_ENV_KEYS = (
    "DJANGO_SETTINGS_MODULE", "DJANGO_ENV", "DJANGO_SECRET_KEY", "DJANGO_ALLOWED_HOSTS",
    "DJANGO_LOG_LEVEL", "DB_ENGINE", "MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD",
    "MYSQL_HOST", "MYSQL_PORT", "MYSQL_SSL_CA", "CORS_ALLOWED_ORIGINS",
)

VALID_PRODUCTION_ENV = {
    "DJANGO_ENV": "production",
    "DJANGO_ALLOWED_HOSTS": "api.example.com",
    "DB_ENGINE": "mysql",
    "MYSQL_DATABASE": "family_bridge",
    "MYSQL_USER": "family_bridge",
    "MYSQL_PASSWORD": "guard-dummy-password",
    "CORS_ALLOWED_ORIGINS": "https://example.zdn.vn",
}


class ProductionSettingsGuardTests(SimpleTestCase):
    maxDiff = None

    def setUp(self):
        # Dummy ≥50 ký tự, random mỗi lần chạy — không bao giờ là secret thật.
        self.dummy_secret = secrets.token_urlsafe(48)

    def check_env(self, command=("manage.py", "check"), **overrides):
        env = {key: value for key, value in os.environ.items() if key not in STRIPPED_ENV_KEYS}
        env["DJANGO_SETTINGS_MODULE"] = "config.settings"
        env.update(overrides)
        return subprocess.run(
            [sys.executable, *command],
            cwd=str(BACKEND_DIR),
            env=env,
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )

    @staticmethod
    def output_of(result):
        return f"{result.stdout}\n{result.stderr}"

    def assert_no_dummy_leak(self, result, *extra_values):
        combined = self.output_of(result)
        for value in (*extra_values, "guard-dummy-password", self.dummy_secret):
            self.assertNotIn(value, combined)

    def test_production_without_secret_key_fails_closed(self):
        result = self.check_env(DJANGO_ENV="production")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("DJANGO_SECRET_KEY is required", self.output_of(result))

    def test_production_short_secret_key_fails_closed(self):
        short_key = "f" * 49  # 49 ký tự — dưới ngưỡng 50 bắt buộc
        result = self.check_env(DJANGO_ENV="production", DJANGO_SECRET_KEY=short_key)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("at least 50 characters", self.output_of(result))
        self.assertNotIn(short_key, self.output_of(result))

    def test_production_sqlite_database_rejected(self):
        result = self.check_env(DJANGO_ENV="production", DJANGO_SECRET_KEY=self.dummy_secret, DB_ENGINE="sqlite")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Production requires MySQL", self.output_of(result))

    def test_production_wildcard_allowed_hosts_rejected(self):
        result = self.check_env(
            DJANGO_ENV="production",
            DJANGO_SECRET_KEY=self.dummy_secret,
            DJANGO_ALLOWED_HOSTS="*",
            DB_ENGINE="mysql",
            MYSQL_DATABASE="family_bridge",
            MYSQL_USER="family_bridge",
            MYSQL_PASSWORD="guard-dummy-password",
            CORS_ALLOWED_ORIGINS="https://example.zdn.vn",
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("explicit DJANGO_ALLOWED_HOSTS", self.output_of(result))
        self.assert_no_dummy_leak(result)

    @unittest.skipUnless(
        MYSQL_CLIENT_AVAILABLE,
        "mysqlclient không import được local (không root); bằng chứng dương tính thuộc CI job production-guard",
    )
    def test_production_valid_dummy_config_passes_check(self):
        result = self.check_env(**{**VALID_PRODUCTION_ENV, "DJANGO_SECRET_KEY": self.dummy_secret})
        self.assertEqual(result.returncode, 0, self.output_of(result))
        self.assertIn("no issues", result.stdout)
        self.assert_no_dummy_leak(result)

    @unittest.skipUnless(
        MYSQL_CLIENT_AVAILABLE,
        "mysqlclient không import được local (không root); bằng chứng dương tính thuộc CI job production-guard",
    )
    def test_production_check_deploy_passes_with_warnings_only(self):
        result = self.check_env(
            command=("manage.py", "check", "--deploy"),
            **{**VALID_PRODUCTION_ENV, "DJANGO_SECRET_KEY": self.dummy_secret},
        )
        self.assertEqual(result.returncode, 0, self.output_of(result))
        combined = self.output_of(result)
        # check --deploy được phép còn WARNING (hiển thị trong output), không được có ERRORS.
        self.assertNotIn("ERRORS:", combined)
        warning_ids = sorted(set(re.findall(r"\((?:security|admin|urls)\.[WE]\d+\)", combined)))
        print(f"check --deploy warnings: {', '.join(warning_ids) if warning_ids else '(none)'}")
        self.assert_no_dummy_leak(result)
