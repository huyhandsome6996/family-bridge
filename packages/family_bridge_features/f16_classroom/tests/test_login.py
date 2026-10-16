"""Suite dang nhap tai khoan lop: shape OK, khong biet le, guard DB, scale.

Moi truong: SQLite harness. Login that qua API /api/v1/auth/class-session.
"""

import datetime as dt

from django.test import TestCase, override_settings

from family_bridge_core.timeutils import UTC

from ..models import ClassAccount, LoginAttempt
from .helpers import (
    ScopedThrottleTestCase, auth_header, make_class_account, make_session,
    DEFAULT_PASSWORD,
)

LOGIN_URL = "/api/v1/auth/class-session"
MD5_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]


class LoginShapeTests(ScopedThrottleTestCase):
    def test_login_ok_shape(self):
        make_class_account("HS001", "student", display_name="Minh")
        response = self.client.post(LOGIN_URL,
                                    {"code": "HS001", "password": DEFAULT_PASSWORD},
                                    content_type="application/json")
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual(body["token_type"], "Bearer")
        self.assertIn("token", body)
        # expires_at phan tich duoc ISO va nam tuong lai
        expires = dt.datetime.fromisoformat(body["expires_at"])
        self.assertGreater(expires, dt.datetime.now(tz=UTC))
        self.assertEqual(body["user"]["role"], "student")
        self.assertEqual(body["user"]["class_ref"], "10A1")
        self.assertEqual(body["user"]["display_name"], "Minh")
        self.assertIn("id", body["user"])
        self.assertIsInstance(body["consents_required"], list)
        # F16 khong ep doi mat khau — khong co khoa nay trong payload.
        self.assertNotIn("must_change_password", body)

    def test_role_from_db_not_code_prefix(self):
        # Ma "HS777" giong tien to HS nhung role trong DB la caregiver —
        # payload phai tra role theo DB, khong doan tu tien to.
        make_class_account("HS777", "caregiver")
        response = self.client.post(LOGIN_URL,
                                    {"code": "HS777", "password": DEFAULT_PASSWORD},
                                    content_type="application/json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["role"], "caregiver")

    def test_consents_required_lists_missing_purposes(self):
        account, _user = make_class_account("HS001", "student")
        from family_bridge_features.f01_identity.tests.helpers import (
            accept_service_consent,
        )
        accept_service_consent(account.user)  # service da dong y
        response = self.client.post(LOGIN_URL,
                                    {"code": "HS001", "password": DEFAULT_PASSWORD},
                                    content_type="application/json")
        consents = response.json()["consents_required"]
        self.assertNotIn("service", consents)
        self.assertIn("ai_processing", consents)


class LoginAntiEnumerationTests(ScopedThrottleTestCase):
    def test_unknown_wrong_disabled_byte_identical(self):
        make_class_account("HS001", "student")
        disabled, _ = make_class_account("PH001", "caregiver")
        disabled.user.is_active = False
        disabled.user.save(update_fields=["is_active"])

        unknown = self.client.post(LOGIN_URL,
                                   {"code": "ZZ999", "password": "Whatever123"},
                                   content_type="application/json")
        wrong = self.client.post(LOGIN_URL,
                                 {"code": "HS001", "password": "SaiMatKhau1"},
                                 content_type="application/json")
        disabled_resp = self.client.post(
            LOGIN_URL, {"code": "PH001", "password": DEFAULT_PASSWORD},
            content_type="application/json")
        self.assertEqual(unknown.status_code, 401)
        self.assertEqual(wrong.status_code, 401)
        self.assertEqual(disabled_resp.status_code, 401)
        # Ba nguyen nhan that bai → body BYTE giong het nhau.
        self.assertEqual(unknown.content, wrong.content)
        self.assertEqual(wrong.content, disabled_resp.content)
        body = unknown.json()
        self.assertEqual(body["error"]["code"], "not_authenticated")
        self.assertEqual(body["error"]["details"]["reason"],
                         "invalid_credentials")

    def test_malformed_code_same_envelope(self):
        make_class_account("HS001", "student")
        malformed = self.client.post(LOGIN_URL,
                                     {"code": "hs!!!", "password": "x"},
                                     content_type="application/json")
        unknown = self.client.post(LOGIN_URL,
                                   {"code": "ZZ999", "password": "x"},
                                   content_type="application/json")
        self.assertEqual(malformed.status_code, 401)
        self.assertEqual(malformed.content, unknown.content)

    def test_missing_fields_generic_error(self):
        response = self.client.post(LOGIN_URL, {"code": "HS001"},
                                    content_type="application/json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"]["code"], "input_invalid")


@override_settings(PASSWORD_HASHERS=MD5_HASHERS)
class LoginRateGuardTests(ScopedThrottleTestCase):
    LOCK_URL = LOGIN_URL

    def _fail_times(self, code, times, ip=None):
        for _ in range(times):
            response = self.client.post(
                self.LOCK_URL, {"code": code, "password": "SaiMatKhau1"},
                content_type="application/json", REMOTE_ADDR=ip or "127.0.0.1")
        return response

    def test_ten_failures_lock_account_even_with_good_password(self):
        make_class_account("HS001", "student")
        self._fail_times("HS001", 10)
        response = self.client.post(
            self.LOCK_URL, {"code": "HS001", "password": DEFAULT_PASSWORD},
            content_type="application/json")
        self.assertEqual(response.status_code, 429, response.content)
        body = response.json()
        self.assertEqual(body["error"]["code"], "rate_limited")
        self.assertEqual(body["error"]["details"]["reason"],
                         "too_many_attempts")
        self.assertEqual(body["error"]["details"]["window_minutes"], 15)

    def test_ip_key_independence_across_accounts(self):
        make_class_account("HS001", "student")
        make_class_account("HS002", "student")
        # 10 sai cho HS001 tu IP 10.0.0.1
        self._fail_times("HS001", 10, ip="10.0.0.1")
        # Tai khoan HS001 bi khoa (khoa theo acct) ke ca IP khac
        locked = self.client.post(
            self.LOCK_URL, {"code": "HS001", "password": DEFAULT_PASSWORD},
            content_type="application/json", REMOTE_ADDR="10.0.0.2")
        self.assertEqual(locked.status_code, 429)
        # HS002 tu IP moi: cac khoa acct/codeh/ip cua no deu sach → OK.
        fresh = self.client.post(
            self.LOCK_URL, {"code": "HS002", "password": DEFAULT_PASSWORD},
            content_type="application/json", REMOTE_ADDR="10.0.0.2")
        self.assertEqual(fresh.status_code, 200, fresh.content)

    def test_success_records_ok_and_resets_nothing_but_counts_failures_only(self):
        # "ok" khong tinh vao nguong: 5 sai + thanh cong + 5 sai van chua khoa
        # (tong that bai = 10 se khoa o lan thu 11).
        make_class_account("HS001", "student")
        self._fail_times("HS001", 5)
        self.client.post(self.LOCK_URL,
                         {"code": "HS001", "password": DEFAULT_PASSWORD},
                         content_type="application/json")
        self._fail_times("HS001", 4)
        still_ok = self.client.post(
            self.LOCK_URL, {"code": "HS001", "password": DEFAULT_PASSWORD},
            content_type="application/json")
        self.assertEqual(still_ok.status_code, 200, still_ok.content)
        self._fail_times("HS001", 1)
        locked = self.client.post(
            self.LOCK_URL, {"code": "HS001", "password": DEFAULT_PASSWORD},
            content_type="application/json")
        self.assertEqual(locked.status_code, 429)

    def test_attempts_recorded_hashed_keys_only(self):
        make_class_account("HS001", "student")
        self._fail_times("HS001", 1)
        keys = set(LoginAttempt.objects.values_list("attempt_key", flat=True))
        self.assertTrue(all(key.startswith(("acct:", "codeh:", "ip:")) for key in keys))
        # Ma dang nhap khong duoc xuat hien trong key (chi HMAC).
        self.assertFalse(any("HS001" in key for key in keys))


@override_settings(PASSWORD_HASHERS=MD5_HASHERS)
class LoginScaleTests(ScopedThrottleTestCase):
    def test_100_accounts_login_and_token_usable(self):
        for i in range(1, 101):
            make_class_account(f"HS{i:03d}", "student")
        tokens = []
        for i in range(1, 101):
            response = self.client.post(
                LOGIN_URL, {"code": f"HS{i:03d}", "password": DEFAULT_PASSWORD},
                content_type="application/json")
            self.assertEqual(response.status_code, 200, response.content)
            tokens.append(response.json()["token"])
        # Token dau tien dung duoc tren endpoint bearer cua chinh F16.
        response = self.client.get("/api/v1/classroom/proposals",
                                   **auth_header(tokens[0]))
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["results"], [])
