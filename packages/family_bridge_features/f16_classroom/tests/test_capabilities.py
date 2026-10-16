"""Suite capabilities (F16): snapshot public, zalo fail-closed (hop dong)."""

from django.test import TestCase, override_settings

from .helpers import ScopedThrottleTestCase


CAPABILITIES_URL = "/api/v1/auth/class-capabilities"


class CapabilitiesPublicTests(ScopedThrottleTestCase):
    def test_public_no_auth_200_shape(self):
        response = self.client.get(CAPABILITIES_URL)
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertTrue(body["login_methods"]["local_class"])
        self.assertIn("zalo", body["login_methods"])
        for key in ("change_password", "change_code", "change_display_name"):
            self.assertTrue(body["settings"][key])
        self.assertTrue(body["policy"]["no_forced_password_change"])
        # Khong ep doi mat khau lan dau — contract no_forced_password_change.
        self.assertNotIn("must_change_password", body)

    def test_capabilities_never_lists_secret_values(self):
        response = self.client.get(CAPABILITIES_URL)
        self.assertNotIn("ZALO_APP_SECRET", response.content.decode())
        self.assertNotIn("password", response.content.decode().lower()
                         .replace("change_password", "")
                         .replace("no_forced_password_change", ""))


class CapabilitiesZaloFlagTests(ScopedThrottleTestCase):
    def test_zalo_false_when_flag_off_even_with_creds(self):
        with override_settings(FB_ZALO_LOGIN_ENABLED=False,
                               ZALO_APP_ID="1234567890",
                               ZALO_APP_SECRET="secret-value"):
            response = self.client.get(CAPABILITIES_URL)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["login_methods"]["zalo"])

    def test_zalo_false_when_creds_missing(self):
        with override_settings(FB_ZALO_LOGIN_ENABLED=True,
                               ZALO_APP_ID="", ZALO_APP_SECRET=""):
            response = self.client.get(CAPABILITIES_URL)
        self.assertFalse(response.json()["login_methods"]["zalo"])

    def test_zalo_false_when_only_app_secret_present(self):
        with override_settings(FB_ZALO_LOGIN_ENABLED=True,
                               ZALO_APP_ID="", ZALO_APP_SECRET="secret"):
            response = self.client.get(CAPABILITIES_URL)
        self.assertFalse(response.json()["login_methods"]["zalo"])

    def test_zalo_true_when_flag_on_and_creds_present(self):
        with override_settings(FB_ZALO_LOGIN_ENABLED=True,
                               ZALO_APP_ID="1234567890",
                               ZALO_APP_SECRET="secret-value"):
            response = self.client.get(CAPABILITIES_URL)
        self.assertTrue(response.json()["login_methods"]["zalo"])
