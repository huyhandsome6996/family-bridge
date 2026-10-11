"""Identity service: server-side Zalo verification -> internal UUID session.

Contract (WF-01, SEC-01/02, US-011):
- The client posts a Zalo access token obtained via SDK; the backend calls
  the IdentityVerifier port (production: ZaloPlatformVerifier with real HTTP;
  tests: scripted fake). The client's zalo id/name/phone/role are NEVER
  trusted.
- Verified subject maps to an internal UUID via ProviderIdentity
  UNIQUE(provider, app_id, provider_subject). First login provisions a
  minimal user (no role grants, no admin).
- Session tokens are random 32-byte urlsafe strings, stored hashed, TTL 24h
  (P-04 provisional), revocable server-side. Disabled/restricted users are
  refused.
- Consent is recorded per purpose/version and never implied by login (WF-17).
"""

from __future__ import annotations

import secrets
import datetime as dt
from typing import Optional

from django.contrib.auth import get_user_model
from django.db import transaction

from family_bridge_core.errors import (
    InputInvalid, NotAuthenticated, TemporarilyUnavailable,
)
from family_bridge_core.protocols import IdentityVerifier
from family_bridge_core.timeutils import UTC

SESSION_TTL_SECONDS = 24 * 3600  # P-04 provisional (DEC-14 open)

PROVIDER = "zalo"


class SessionService:
    def __init__(self, *, verifier: IdentityVerifier, app_id: str,
                 clock=None, ttl_seconds: int = SESSION_TTL_SECONDS) -> None:
        self.verifier = verifier
        self.app_id = str(app_id)
        self.clock = clock
        self.ttl_seconds = ttl_seconds

    def _now(self) -> dt.datetime:
        return self.clock.now() if self.clock else dt.datetime.now(tz=UTC)

    @transaction.atomic
    def login_with_zalo_token(self, *, access_token: str):
        """Verify -> map subject -> issue session. Returns (user, raw_token)."""
        if not isinstance(access_token, str) or not (8 <= len(access_token) <= 2048):
            raise InputInvalid({"field": "access_token", "reason": "malformed"})
        try:
            identity = self.verifier.verify(access_token=access_token)
        except TemporarilyUnavailable:
            raise
        if identity.provider != PROVIDER:
            raise InputInvalid({"reason": "unsupported_provider"})
        if str(identity.app_id) != self.app_id:
            # Wrong parent app: refuse, never map the subject.
            raise InputInvalid({"reason": "wrong_app_id"})

        User = get_user_model()
        from ..models import ProviderIdentity, Session, hash_token

        existing = (ProviderIdentity.objects
                    .select_related("user")
                    .filter(provider=PROVIDER, app_id=self.app_id,
                            provider_subject=identity.provider_subject)
                    .first())
        if existing is None:
            user = User.objects.create_user(
                username=f"zalo_{self.app_id}_{identity.provider_subject}"[:150],
                password=secrets.token_urlsafe(32),  # unusable random; login is provider-only
                first_name="",
            )
            ProviderIdentity.objects.create(
                user=user, provider=PROVIDER, app_id=self.app_id,
                provider_subject=identity.provider_subject,
            )
        else:
            user = existing.user

        if not user.is_active:
            raise NotAuthenticated({"reason": "user_disabled"})

        raw_token = secrets.token_urlsafe(32)
        now = self._now()
        session = Session.objects.create(
            user=user,
            token_hash=hash_token(raw_token),
            expires_at=now + dt.timedelta(seconds=self.ttl_seconds),
        )
        return user, raw_token, session

    @staticmethod
    def resolve_session(raw_token: str):
        """Bearer token -> live Session or None. Never logs the token."""
        if not raw_token:
            return None
        from ..models import Session, hash_token
        session = (Session.objects.select_related("user")
                   .filter(token_hash=hash_token(raw_token)).first())
        if session is None or not session.is_live:
            return None
        if not session.user.is_active:
            return None
        return session

    @staticmethod
    def revoke_by_token(raw_token: str) -> bool:
        from ..models import Session, hash_token
        session = Session.objects.filter(token_hash=hash_token(raw_token)).first()
        if session is None:
            return False
        return session.revoke()

    @staticmethod
    def revoke_all_for_user(user_id) -> int:
        from .models import Session
        count = 0
        for session in Session.objects.filter(user_id=user_id, revoked_at__isnull=True):
            count += 1 if session.revoke() else 0
        return count


def record_consent(*, user, purpose: str, policy_version: str,
                   decision: str, now: Optional[dt.datetime] = None):
    """Explicit consent per purpose/version (WF-17). Never implied."""
    from ..models import ConsentRecord

    if purpose not in ConsentRecord.PURPOSES:
        raise InputInvalid({"field": "purpose", "reason": "invalid_enum"})
    if decision not in {"accepted", "declined"}:
        raise InputInvalid({"field": "decision", "reason": "invalid_enum"})
    if not isinstance(policy_version, str) or not (1 <= len(policy_version) <= 32):
        raise InputInvalid({"field": "policy_version", "reason": "malformed"})
    return ConsentRecord.objects.create(
        user=user, purpose=purpose, policy_version=policy_version,
        decision=decision, recorded_at=now or dt.datetime.now(tz=UTC),
    )


def has_active_consent(user_id, purpose: str) -> bool:
    from ..models import ConsentRecord
    latest = ConsentRecord.latest_active(user_id, purpose)
    return bool(latest and latest.decision == "accepted")
