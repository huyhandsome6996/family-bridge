"""Session resolution port for F15 (branch-independent).

B15 branches from the B00 baseline where F01's code is not present. To stay
runnable standalone AND integrable later, the resolver is registered:

- Integration (B18 / combined runs): register F01's SessionService.resolve_session
  (auto-detected via import when available).
- Harness standalone runs: tests register a test-only resolver
  (labgrants.sessions.resolve_session) — clearly labeled test fixture.

Never a production login bypass: the resolver only validates an opaque
bearer token and returns (user, session_ref) or None; issuer/revoker remains
F01's SessionService.
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
    try:  # integration path: F01 present
        from ..f01_identity.services.identity import SessionService
        session = SessionService.resolve_session(raw_token)
        return (session.user, session) if session else None
    except ImportError:
        return None
