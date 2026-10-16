"""B16 port registry — session resolver only (capabilities are internal)."""

from __future__ import annotations

from typing import Callable, Optional

_session_resolver: Optional[Callable] = None


def register_session_resolver(fn: Callable) -> None:
    global _session_resolver
    if not callable(fn):
        raise ValueError("session resolver must be callable")
    _session_resolver = fn


def reset_registries() -> None:
    global _session_resolver
    _session_resolver = None


def get_session_resolver() -> Optional[Callable]:
    from family_bridge_core.sessions import resolve_identity_session
    return _session_resolver or resolve_identity_session
