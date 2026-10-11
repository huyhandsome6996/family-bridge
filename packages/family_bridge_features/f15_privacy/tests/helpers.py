"""Shared F15 test helpers (standalone test-only session store)."""

import labgrants.sessions as _lab_sessions


def make_session(user, *, ttl_hours: float = 24) -> tuple:
    raw = _lab_sessions.create_test_session(user, ttl_hours=ttl_hours)
    return raw, None


def auth_header(raw_token: str) -> dict:
    return {"HTTP_AUTHORIZATION": f"Bearer {raw_token}"}
