"""Suite cau hinh tai khoan lop: doi mat khau / ma dang nhap / ten goi."""

from django.test import TestCase, override_settings

from ..models import LoginAttempt
from .helpers import (
    ScopedThrottleTestCase, accept_service_consent, auth_header,
    make_class_account, make_proposal, make_session, DEFAULT_PASSWORD,
)

PASSWORD_URL = "/api/v1/auth/class-password"
CODE_URL = "/api/v1/auth/class-code"
DISPLAY_URL = "/api/v1/auth/class-display-name"
LOGIN_URL = "/api/v1/auth/class-session"
MD5_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]


@override_settings(PASSWORD_HASHERS=MD5_HASHERS)
class ChangePasswordTests(ScopedThrottleTestCase):
    def _login(self, code):
        response = self.client.post(LOGIN_URL, {"code": code,
                                                "password": DEFAULT_PASSWORD},
                                    content_type="application/json")
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def test_change_password_reacts_and_preserves_state(self):
        account, _user = make_class_account("HS001", "student")
        from ..services.proposals import ProposalService
        # Du lieu nghiep vu truoc khi doi mat khau.
        caregiver, _ = make_class_account("PH001", "caregiver")
        proposal = make_proposal(account, caregiver)
        accept_service_consent(account.user)

        first = self._login("HS001")
        # Phien thu hai (se bi revoke), giu raw token de kiem tra.
        token_other, _session = make_session(account.user)

        response = self.client.post(
            PASSWORD_URL,
            {"current_password": DEFAULT_PASSWORD,
             "new_password": "NewPass2026x!"},
            content_type="application/json", **auth_header(first["token"]))
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertTrue(body["changed"])
        self.assertEqual(body["sessions_revoked_other"], 1)

        # Phien cu (khac) chet; phien hien tai van song.
        dead = self.client.get("/api/v1/classroom/proposals",
                               **auth_header(token_other))
        self.assertEqual(dead.status_code, 401)
        alive = self.client.get("/api/v1/classroom/proposals",
                                **auth_header(first["token"]))
        self.assertEqual(alive.status_code, 200)

        # Mat khau cu het hieu luc (body generic), mat khau moi dang nhap OK.
        old_login = self.client.post(LOGIN_URL,
                                     {"code": "HS001",
                                      "password": DEFAULT_PASSWORD},
                                     content_type="application/json")
        new_login = self.client.post(LOGIN_URL,
                                     {"code": "HS001",
                                      "password": "NewPass2026x!"},
                                     content_type="application/json")
        self.assertEqual(old_login.status_code, 401)
        self.assertEqual(new_login.status_code, 200)

        # Du lieu nghiep vu giu nguyen; first_name (ten goi) khong bi doi.
        results = alive.json()["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["proposal_id"], str(proposal.id))
        account.refresh_from_db()
        self.assertEqual(account.user.first_name, "HS001")

    def test_reauth_wrong_password_403(self):
        account, _user = make_class_account("HS001", "student")
        token, _ = make_session(account.user)
        response = self.client.post(
            PASSWORD_URL, {"current_password": "SaiMatKhau1",
                           "new_password": "NewPass2026x!"},
            content_type="application/json", **auth_header(token))
        self.assertEqual(response.status_code, 403, response.content)
        self.assertEqual(response.json()["error"]["details"]["reason"],
                         "reauth_failed")

    def test_weak_and_same_password_400(self):
        account, _user = make_class_account("HS001", "student")
        token, _ = make_session(account.user)
        weak = self.client.post(
            PASSWORD_URL, {"current_password": DEFAULT_PASSWORD,
                           "new_password": "ngan"},
            content_type="application/json", **auth_header(token))
        self.assertEqual(weak.status_code, 400)
        self.assertEqual(weak.json()["error"]["details"]["reason"],
                         "weak_password")
        same = self.client.post(
            PASSWORD_URL, {"current_password": DEFAULT_PASSWORD,
                           "new_password": DEFAULT_PASSWORD},
            content_type="application/json", **auth_header(token))
        self.assertEqual(same.status_code, 400)
        self.assertEqual(same.json()["error"]["details"]["reason"],
                         "same_password")


@override_settings(PASSWORD_HASHERS=MD5_HASHERS)
class ChangeCodeTests(ScopedThrottleTestCase):
    def test_change_code_old_dead_new_works_state_unchanged(self):
        account, user = make_class_account("HS001", "student")
        caregiver, _ = make_class_account("PH001", "caregiver")
        proposal = make_proposal(account, caregiver)
        token, _ = make_session(account.user)

        response = self.client.post(
            CODE_URL, {"current_password": DEFAULT_PASSWORD,
                       "new_code": "HS999"},
            content_type="application/json", **auth_header(token))
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual(body["login_code"], "HS999")
        self.assertTrue(body["changed"])

        # Ma cu chet voi body generic giong ma khong ton tai.
        old_login = self.client.post(LOGIN_URL,
                                     {"code": "HS001",
                                      "password": DEFAULT_PASSWORD},
                                     content_type="application/json")
        unknown_login = self.client.post(LOGIN_URL,
                                         {"code": "ZZ000", "password": "x"},
                                         content_type="application/json")
        self.assertEqual(old_login.status_code, 401)
        self.assertEqual(old_login.content, unknown_login.content)
        new_login = self.client.post(LOGIN_URL,
                                     {"code": "HS999",
                                      "password": DEFAULT_PASSWORD},
                                     content_type="application/json")
        self.assertEqual(new_login.status_code, 200)
        self.assertEqual(new_login.json()["user"]["id"], str(user.pk))

        # user.id + phien + proposal giu nguyen.
        self.client.get("/api/v1/classroom/proposals", **auth_header(token))
        proposal.refresh_from_db()
        self.assertEqual(proposal.student_account.user_id, user.pk)

    def test_duplicate_code_400(self):
        make_class_account("HS001", "student")
        _other_account, other_user = make_class_account("PH001", "caregiver")
        token, _ = make_session(other_user)
        response = self.client.post(
            CODE_URL, {"current_password": DEFAULT_PASSWORD,
                       "new_code": "HS001"},
            content_type="application/json", **auth_header(token))
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(response.json()["error"]["details"]["reason"],
                         "duplicate_code")

    def test_invalid_format_400(self):
        account, _user = make_class_account("HS001", "student")
        token, _ = make_session(account.user)
        response = self.client.post(
            CODE_URL, {"current_password": DEFAULT_PASSWORD,
                       "new_code": "khong hop le!"},
            content_type="application/json", **auth_header(token))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"]["details"]["reason"],
                         "invalid_code_format")

    def test_reauth_required(self):
        account, _user = make_class_account("HS001", "student")
        token, _ = make_session(account.user)
        response = self.client.post(
            CODE_URL, {"current_password": "SaiMatKhau1", "new_code": "HS999"},
            content_type="application/json", **auth_header(token))
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["error"]["details"]["reason"],
                         "reauth_failed")


@override_settings(PASSWORD_HASHERS=MD5_HASHERS)
class ChangeDisplayNameTests(ScopedThrottleTestCase):
    def test_display_name_persisted_and_visible_to_counterpart(self):
        student, _user = make_class_account("HS001", "student")
        caregiver, _care_user = make_class_account("PH001", "caregiver")
        make_proposal(student, caregiver)
        token_student, _ = make_session(student.user)
        token_caregiver, _ = make_session(caregiver.user)

        response = self.client.post(
            DISPLAY_URL, {"current_password": DEFAULT_PASSWORD,
                          "display_name": "Cha cua Minh"},
            content_type="application/json", **auth_header(token_caregiver))
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual(body["display_name"], "Cha cua Minh")
        self.assertEqual(body["identity_basis"], "self_declared")

        # Partner (HS) thay ten goi moi trong payload proposal.
        listing = self.client.get("/api/v1/classroom/proposals",
                                  **auth_header(token_student))
        self.assertEqual(listing.status_code, 200)
        results = listing.json()["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["counterpart"]["display_name"],
                         "Cha cua Minh")
        self.assertEqual(results[0]["counterpart"]["identity_basis"],
                         "self_declared")

    def test_reauth_required(self):
        account, _user = make_class_account("HS001", "student")
        token, _ = make_session(account.user)
        response = self.client.post(
            DISPLAY_URL, {"current_password": "SaiMatKhau1",
                          "display_name": "Ten moi"},
            content_type="application/json", **auth_header(token))
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["error"]["details"]["reason"],
                         "reauth_failed")
