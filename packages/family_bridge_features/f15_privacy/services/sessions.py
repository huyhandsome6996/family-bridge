"""Session resolution port for F15.

Production resolution is F01's ``SessionService.resolve_session`` — imported
ABSOLUTELY (``family_bridge_features.f01_identity...``). The historical
relative fallback (``from ..f01_identity import ...``) resolved to
``f15_privacy.f01_identity`` and ALWAYS raised ImportError, silently
disabling every authenticated F15 call; keep the absolute import and let a
missing F01 surface as an honest unauthenticated result.

Tests may still register a test-only resolver via
``register_session_resolver`` (labgrants fixture) — clearly labeled test
fixture, never a production login bypass: the resolver only validates an
opaque bearer token and returns (user, session) or None; issuer/revoker
remains F01's SessionService.
"""

from __future__ import annotations

from typing import Callable, Optional, Tuple

_resolver: Optional[Callable] = None


def register_session_resolver(fn: Callable) -> None:
    global _resolver
    if not callable(fn):
        raise ValueError("resolver must be callable")
    _resolver = fn


def reset_resolver() -> None:
    global _resolver
    _resolver = None


def resolve_session(raw_token: str) -> Optional[Tuple[object, object]]:
    """Returns (user, session) or None. Never logs the token."""
    if _resolver is not None:
        return _resolver(raw_token)
    try:  # production path: F01 real sessions (absolute package import)
        from family_bridge_features.f01_identity.services.identity import SessionService
        session = SessionService.resolve_session(raw_token)
        return (session.user, session) if session else None
    except ImportError:
        return None
