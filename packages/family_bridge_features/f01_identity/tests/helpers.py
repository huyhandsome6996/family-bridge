"""Shared test helpers for F01 tests."""

import datetime as dt

from family_bridge_core.timeutils import UTC

from ..models import Session, hash_token


def make_session(user, *, ttl_hours: float = 24, clock=None) -> tuple:
    """Create a live session directly; returns (raw_token, session)."""
    raw = "test-token-" + user.username + "-" + dt.datetime.now(tz=UTC).isoformat()
    now = clock.now() if clock else dt.datetime.now(tz=UTC)
    session = Session.objects.create(
        user=user, token_hash=hash_token(raw),
        expires_at=now + dt.timedelta(hours=ttl_hours))
    return raw, session


def auth_header(raw_token: str) -> dict:
    return {"HTTP_AUTHORIZATION": f"Bearer {raw_token}"}
