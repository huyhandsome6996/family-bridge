"""F07 test helpers."""

import labgrants.sessions as _lab_sessions


def make_session(user, *, ttl_hours: float = 24) -> tuple:
    return _lab_sessions.create_test_session(user, ttl_hours=ttl_hours), None


def auth_header(raw_token: str) -> dict:
    return {"HTTP_AUTHORIZATION": f"Bearer {raw_token}"}
