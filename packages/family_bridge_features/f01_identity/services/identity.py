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

from django.db import IntegrityError

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

    def login_with_zalo_token(self, *, access_token: str):
        """Verify -> map subject -> issue session. Returns (user, raw_token).

        No DB transaction is held open across the provider HTTP call
        (WF-11): verification runs first, provisioning runs in its own
        short transaction, session issuance in another.
        """
        if not isinstance(access_token, str) or not (8 <= len(access_token) <= 2048):
            raise InputInvalid({"field": "access_token", "reason": "malformed"})
        # Provider call OUTSIDE any DB transaction (WF-11).
        try:
            identity = self.verifier.verify(access_token=access_token)
        except TemporarilyUnavailable:
            raise
        if identity.provider != PROVIDER:
            raise InputInvalid({"reason": "unsupported_provider"})
        if str(identity.app_id) != self.app_id:
            # Wrong parent app: refuse, never map the subject.
            raise InputInvalid({"reason": "wrong_app_id"})

        user = self._resolve_user(identity)

        if not user.is_active:
            raise NotAuthenticated({"reason": "user_disabled"})

        raw_token, session = self._issue_session(user)
        return user, raw_token, session

    def _resolve_user(self, identity):
        """Map a verified subject to the internal user (provision if new).

        Concurrent first logins of the same identity: the UNIQUE(provider,
        app_id, provider_subject) constraint decides the winner; the loser
        re-fetches and continues on the winning account — no duplicate user,
        no unhandled 500.
        """
        from ..models import ProviderIdentity

        existing = (ProviderIdentity.objects
                    .select_related("user")
                    .filter(provider=PROVIDER, app_id=self.app_id,
                            provider_subject=identity.provider_subject)
                    .first())
        if existing is not None:
            return existing.user
        try:
            with transaction.atomic():
                User = get_user_model()
                user = User.objects.create_user(
                    username=f"zalo_{self.app_id}_{identity.provider_subject}"[:150],
                    password=secrets.token_urlsafe(32),  # unusable random; login is provider-only
                    first_name="",
                )
                ProviderIdentity.objects.create(
                    user=user, provider=PROVIDER, app_id=self.app_id,
                    provider_subject=identity.provider_subject,
                )
                return user
        except IntegrityError:
            # Lost the provisioning race: another transaction inserted the
            # same identity row first. Roll nothing forward — re-read the
            # winner and continue with it.
            existing = (ProviderIdentity.objects
                        .select_related("user")
                        .filter(provider=PROVIDER, app_id=self.app_id,
                                provider_subject=identity.provider_subject)
                        .first())
            if existing is None:
                raise
            return existing.user

    def _issue_session(self, user):
        from ..models import Session, hash_token

        raw_token = secrets.token_urlsafe(32)
        now = self._now()
        with transaction.atomic():
            session = Session.objects.create(
                user=user,
                token_hash=hash_token(raw_token),
                expires_at=now + dt.timedelta(seconds=self.ttl_seconds),
            )
        return raw_token, session

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
