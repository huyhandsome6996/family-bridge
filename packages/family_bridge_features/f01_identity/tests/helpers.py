"""Shared test helpers for F01 tests."""

import datetime as dt
import uuid

from family_bridge_core.timeutils import UTC

from ..models import Session, hash_token


def accept_service_consent(user, *, purpose: str = "service",
                           version: str = "service-v1") -> None:
    """Record an active current-version acceptance (A05 test fixture).

    API-level create/claim/confirm are gated server-side on service
    consent; tests that exercise those endpoints grant it explicitly here.
    """
    from ..services.identity import record_consent
    record_consent(user=user, purpose=purpose, policy_version=version,
                   decision="accepted")


def make_session(user, *, ttl_hours: float = 24, clock=None) -> tuple:
    """Create a live session directly; returns (raw_token, session)."""
    raw = "test-token-" + user.username + "-" + uuid.uuid4().hex
    now = clock.now() if clock else dt.datetime.now(tz=UTC)
    session = Session.objects.create(
        user=user, token_hash=hash_token(raw),
        expires_at=now + dt.timedelta(hours=ttl_hours))
    return raw, session


def auth_header(raw_token: str) -> dict:
    return {"HTTP_AUTHORIZATION": f"Bearer {raw_token}"}
