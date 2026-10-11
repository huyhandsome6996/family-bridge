"""TEST-ONLY session resolver for standalone feature runs (harness fixture).

Mirrors F01 Session semantics minimally: hashed token, TTL, revoke.
The model lives in labgrants.models so Django registers it.
"""

import datetime as dt

from family_bridge_core.timeutils import UTC

from .models import TestSession, hash_token


def create_test_session(user, *, ttl_hours: float = 24) -> str:
    raw = "f15-standalone-" + dt.datetime.now(tz=UTC).isoformat() + user.username
    TestSession.objects.create(
        user=user, token_hash=hash_token(raw),
        expires_at=dt.datetime.now(tz=UTC) + dt.timedelta(hours=ttl_hours))
    return raw


def resolve_session(raw_token: str):
    if not raw_token:
        return None
    session = TestSession.objects.filter(token_hash=hash_token(raw_token)).first()
    if session is None:
        return None
    now = dt.datetime.now(tz=UTC)
    if session.revoked_at is not None or session.expires_at <= now \
            or not session.user.is_active:
        return None
    return (session.user, session)


def auth_header(raw_token: str) -> dict:
    return {"HTTP_AUTHORIZATION": f"Bearer {raw_token}"}
