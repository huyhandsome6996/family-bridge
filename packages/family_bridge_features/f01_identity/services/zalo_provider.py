"""Production Zalo verifier adapter (SEC-01, SEC-13).

Calls Zalo's profile-inspection endpoint server-side and maps the response
to VerifiedIdentity. Per the Zalo Mini App login guide (authen-user doc,
updated 2026-01-28; checked 2026-10-13):

- GET https://graph.zalo.me/v2.0/me
- Headers: access_token, appsecret_proof (MANDATORY since 2024-01-01 —
  appsecret_proof = HMAC-SHA256(access_token, ZALO_APP_SECRET) hex digest,
  proving the token was issued for OUR registered Zalo App ID)
- Query carries only non-sensitive `fields` (we request `id` only —
  minimal-identity policy: no name/avatar/phone for F01 login)
- The access token is NEVER placed in the URL/query string.

Unit tests run this against a scripted HTTP double (correct / wrong app /
expired / malformed / network failure) per the verification plan. The live
endpoint smoke check is documented in docs/handover/f01-login-connections/.
Nothing here is claimed as Zalo device evidence (US-049).

The endpoint URL is an allowlisted constant (SEC-13: no user-controlled
URLs). Redirects are followed only inside the same allowlisted host.
Responses are bounded and TLS verification is never disabled.

Transport failure classes (urllib.error.URLError, socket.timeout /
TimeoutError, raw OSError) are mapped by _fetch_token_info to
TemporarilyUnavailable(provider_unreachable) -> 503 for ANY transport
(default or injected double). Mapping is deliberately not a catch-all:
programming errors propagate so they get fixed instead of being reported
as "provider down".
"""

from __future__ import annotations

import hashlib
import hmac
import json
import socket
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional

from family_bridge_core.errors import (
    InputInvalid, NotAuthenticated, TemporarilyUnavailable,
)
from family_bridge_core.protocols import VerifiedIdentity

# Zalo API host allowlist (docs.zaloplatforms.com, checked 2026-10-13).
ZALO_GRAPH_HOSTS = frozenset({"graph.zalo.me", "oauth.zalo.me"})
ACCESS_TOKEN_INFO_PATH = "https://graph.zalo.me/v2.0/me"
REQUEST_TIMEOUT_SECONDS = 10
MAX_RESPONSE_BYTES = 16 * 1024


def appsecret_proof(access_token: str, app_secret: str) -> str:
    """HMAC-SHA256(access_token, app_secret) as lowercase hex (Zalo spec)."""
    return hmac.new(
        app_secret.encode("utf-8"),
        access_token.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


class _AllowlistedRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Refuse redirects to destinations outside the Zalo host allowlist."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        parsed = urllib.parse.urlparse(newurl)
        if parsed.scheme != "https" or parsed.hostname not in ZALO_GRAPH_HOSTS:
            raise InputInvalid({"reason": "destination_not_allowed"})
        return super().redirect_request(req, fp, code, msg, headers, newurl)


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
            # -100/-102/-212/-213: legacy invalid/expired family.
            # 452: live-verified 2026-10-13 — invalid/revoked session key
            # (returned for garbage tokens even with correct request shape).
            if code in {"-100", "-102", "-212", "-213", "452"}:
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
               + urllib.parse.urlencode({"fields": "id"}))
        headers = {
            "access_token": access_token,
            "appsecret_proof": appsecret_proof(access_token, self.app_secret),
        }
        try:
            raw = self._http_get(url, headers)
        except urllib.error.HTTPError as exc:
            # The default transport classifies its own HTTPError (reads the
            # bounded body so Zalo's error codes reach the mapper and never
            # escapes). An injected double raising a bare HTTPError gets the
            # transport verdict instead of a 500.
            raise TemporarilyUnavailable(
                {"reason": "provider_unreachable"}) from exc
        except urllib.error.URLError as exc:
            # Transport failure while establishing the request: DNS failure,
            # connection refused/reset, TLS handshake error, urllib-wrapped
            # timeout. 503 temporarily_unavailable — the provider is
            # unreachable, NOT the caller's fault and NOT a token verdict.
            # (HTTPError is handled above because it subclasses URLError.)
            raise TemporarilyUnavailable(
                {"reason": "provider_unreachable"}) from exc
        except (socket.timeout, TimeoutError, OSError) as exc:
            # Timeout/transport failure while reading the response body —
            # urllib raises bare socket.timeout (== TimeoutError on 3.10+)
            # from .read(), outside the URLError wrapper. Same verdict: 503,
            # no token, no account. OSError also covers raw connection drops.
            # Deliberately NOT a catch-all: programming errors (ValueError,
            # KeyError, our own InputInvalid, ...) still propagate.
            raise TemporarilyUnavailable(
                {"reason": "provider_unreachable"}) from exc
        try:
            payload = json.loads(raw.decode("utf-8")[:MAX_RESPONSE_BYTES])
        except (ValueError, UnicodeDecodeError) as exc:
            raise InputInvalid({"reason": "provider_response_malformed"}) from exc
        if not isinstance(payload, dict):
            raise InputInvalid({"reason": "provider_response_malformed"})
        return payload

    @staticmethod
    def _default_http_get(url: str, headers: Optional[Dict[str, str]] = None
                          ) -> bytes:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme != "https" or parsed.hostname not in ZALO_GRAPH_HOSTS:
            raise InputInvalid({"reason": "destination_not_allowed"})
        merged = {"Accept": "application/json"}
        for key, value in (headers or {}).items():
            if key.lower() in {"accept", "host", "content-length"}:
                continue  # never let injected headers clobber transport basics
            merged[key] = value
        request = urllib.request.Request(url, method="GET", headers=merged)
        opener = urllib.request.build_opener(_AllowlistedRedirectHandler())
        try:
            with opener.open(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
                if response.status != 200:
                    raise TemporarilyUnavailable(
                        {"reason": "provider_unreachable"})
                return response.read(MAX_RESPONSE_BYTES)
        except urllib.error.HTTPError as exc:
            # Zalo signals application errors with 4xx/5xx + JSON body too;
            # read the bounded body so error codes reach the mapper, but a
            # plain unreachable/blocked reply stays a provider error.
            try:
                body = exc.read(MAX_RESPONSE_BYTES)
            except Exception:
                raise TemporarilyUnavailable(
                    {"reason": "provider_unreachable"}) from exc
            if body:
                try:
                    payload = json.loads(body.decode("utf-8"))
                except (ValueError, UnicodeDecodeError):
                    raise TemporarilyUnavailable(
                        {"reason": "provider_unreachable"}) from exc
                if isinstance(payload, dict) and payload.get("error"):
                    return body
            raise TemporarilyUnavailable({"reason": "provider_unreachable"}) from exc
        # URLError / socket.timeout / OSError are deliberately NOT caught here:
        # _fetch_token_info owns the transport-to-503 mapping so that BOTH the
        # default transport and any injected double are classified identically.
