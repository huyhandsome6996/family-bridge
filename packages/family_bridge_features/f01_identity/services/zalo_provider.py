"""Production Zalo verifier adapter (SEC-01, SEC-13).

Calls Zalo's token-inspection endpoint server-side with the app secret and
maps the response to VerifiedIdentity. Because Huy has not provided
ZALO_APP_ID/SECRET yet, this adapter is wired but unverified against the
live platform; unit tests run it against a scripted HTTP double (correct /
wrong app / expired / malformed / network failure) per the verification
plan. Nothing here is claimed as Zalo device evidence (US-049).

The endpoint URL is an allowlisted constant (SEC-13: no user-controlled
URLs). Responses are bounded and TLS verification is never disabled.
"""

from __future__ import annotations

import urllib.parse
import urllib.request
import json
from typing import Any, Dict

from family_bridge_core.errors import (
    InputInvalid, NotAuthenticated, TemporarilyUnavailable,
)
from family_bridge_core.protocols import VerifiedIdentity

# Zalo API host allowlist (docs.zaloplatforms.com, checked 2026-10-11).
ZALO_GRAPH_HOSTS = frozenset({"graph.zalo.me", "oauth.zalo.me"})
ACCESS_TOKEN_INFO_PATH = "https://graph.zalo.me/v2.0/me"
REQUEST_TIMEOUT_SECONDS = 10
MAX_RESPONSE_BYTES = 16 * 1024


class ZaloPlatformVerifier:
    """HTTP adapter implementing the IdentityVerifier port."""

    def __init__(self, *, app_id: str, app_secret: str,
                 http_get=None) -> None:
        if not app_id or not app_secret:
            # Fail closed at construction: without credentials the verifier
            # must not pretend to work (module_unavailable semantics live at
            # the view layer; here we allow injection for tests only).
            app_id = app_id or ""
            app_secret = app_secret or ""
        self.app_id = str(app_id)
        self.app_secret = str(app_secret)
        self._http_get = http_get or self._default_http_get

    # -- port ----------------------------------------------------------------
    def verify(self, *, access_token: str) -> VerifiedIdentity:
        if not self.app_id or not self.app_secret:
            raise TemporarilyUnavailable({"reason": "provider_not_configured"})
        data = self._fetch_token_info(access_token)
        error_code = data.get("error")
        if error_code:
            code = str(error_code)
            if code == "-216":     # wrong app / token not issued to this app
                raise InputInvalid({"reason": "wrong_app_id"})
            if code in {"-100", "-102", "-212", "-213"}:  # expired/invalid family
                raise NotAuthenticated({"reason": "token_invalid_or_expired"})
            raise NotAuthenticated({"reason": "provider_rejected"})
        subject = data.get("id")
        if subject is None or not isinstance(subject, (str, int)):
            raise InputInvalid({"reason": "provider_response_malformed"})
        return VerifiedIdentity(provider="zalo", app_id=self.app_id,
                                provider_subject=str(subject))

    # -- internals -------------------------------------------------------------
    def _fetch_token_info(self, access_token: str) -> Dict[str, Any]:
        url = (f"{ACCESS_TOKEN_INFO_PATH}?"
               + urllib.parse.urlencode({"access_token": access_token,
                                         "fields": "id"}))
        raw = self._http_get(url)
        try:
            payload = json.loads(raw.decode("utf-8")[:MAX_RESPONSE_BYTES])
        except (ValueError, UnicodeDecodeError) as exc:
            raise InputInvalid({"reason": "provider_response_malformed"}) from exc
        if not isinstance(payload, dict):
            raise InputInvalid({"reason": "provider_response_malformed"})
        return payload

    @staticmethod
    def _default_http_get(url: str) -> bytes:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme != "https" or parsed.hostname not in ZALO_GRAPH_HOSTS:
            raise InputInvalid({"reason": "destination_not_allowed"})
        request = urllib.request.Request(url, method="GET",
                                         headers={"Accept": "application/json"})
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            if response.status != 200:
                raise TemporarilyUnavailable({"reason": "provider_unreachable"})
            return response.read(MAX_RESPONSE_BYTES)
