"""Settings-level regression tests (audit "việc nhỏ": TLS fallback c977543).

Contract being pinned:
- Loopback hosts (local dev, CI mysql:8.4 service container) must NOT get
  ssl/ssl_mode options — the container's self-signed cert would fail
  VERIFY_IDENTITY and break CI/dev.
- Remote hosts (Render/TiDB) MUST get TLS with VERIFY_IDENTITY when a CA is
  available: explicit MYSQL_SSL_CA wins, otherwise the system CA bundle.
- No CA available on a remote host: options stay unset (documented
  fallback, keeps the deployment from crashing at import; the connection
  itself is then governed by the server's require_secure_transport).

The module is reloaded with patched env per case and restored afterwards so
the rest of the suite keeps the original settings state.
"""

import importlib
import os
import unittest
from unittest import mock

from django.test import SimpleTestCase

SETTINGS_MODULE = "config.settings"


class SettingsTlsFallbackTests(SimpleTestCase):
    def _load_with(self, env, *, system_ca_exists=True):
        with mock.patch.dict(os.environ, env, clear=False):
            with mock.patch("os.path.exists",
                            return_value=system_ca_exists):
                module = importlib.import_module(SETTINGS_MODULE)
                return importlib.reload(module)

    def tearDown(self):
        # Restore original settings state for the rest of the suite.
        importlib.reload(importlib.import_module(SETTINGS_MODULE))

    def test_remote_host_gets_verify_identity_with_explicit_ca(self):
        module = self._load_with({
            "DB_ENGINE": "mysql",
            "MYSQL_HOST": "gateway01.ap-southeast-1.prod.tidbcloud.com",
            "MYSQL_SSL_CA": "/tmp/explicit-ca.pem",
        })
        options = module.DATABASES["default"]["OPTIONS"]
        self.assertEqual(options.get("ssl_mode"), "VERIFY_IDENTITY")
        self.assertEqual(options.get("ssl"), {"ca": "/tmp/explicit-ca.pem"})

    def test_remote_host_falls_back_to_system_ca_bundle(self):
        module = self._load_with({
            "DB_ENGINE": "mysql",
            "MYSQL_HOST": "remote.example.org",
        }, system_ca_exists=True)
        options = module.DATABASES["default"]["OPTIONS"]
        self.assertEqual(options.get("ssl_mode"), "VERIFY_IDENTITY")
        self.assertEqual(options.get("ssl"),
                         {"ca": "/etc/ssl/certs/ca-certificates.crt"})

    def test_loopback_host_never_gets_tls_options(self):
        for host in ("127.0.0.1", "localhost", "::1"):
            module = self._load_with({
                "DB_ENGINE": "mysql",
                "MYSQL_HOST": host,
                "MYSQL_SSL_CA": "/tmp/explicit-ca.pem",
            })
            options = module.DATABASES["default"]["OPTIONS"]
            self.assertNotIn("ssl", options,
                             f"loopback {host} không được ép TLS")
            self.assertNotIn("ssl_mode", options)

    def test_remote_without_any_ca_stays_unconfigured(self):
        module = self._load_with({
            "DB_ENGINE": "mysql",
            "MYSQL_HOST": "remote.example.org",
        }, system_ca_exists=False)
        options = module.DATABASES["default"]["OPTIONS"]
        self.assertNotIn("ssl", options)
        self.assertNotIn("ssl_mode", options)
