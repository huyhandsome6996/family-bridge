"""F07 port registry — connection reader + session resolver."""

from __future__ import annotations

from typing import Callable, Optional

_connection_reader: Optional[Callable] = None
_session_resolver: Optional[Callable] = None


def register_connection_reader(fn: Callable) -> None:
    global _connection_reader
    if not (callable(fn) or hasattr(fn, "active_connection_between")):
        raise ValueError("connection reader must implement the port")
    _connection_reader = fn


def register_session_resolver(fn: Callable) -> None:
    global _session_resolver
    if not callable(fn):
        raise ValueError("session resolver must be callable")
    _session_resolver = fn


def reset_registries() -> None:
    global _connection_reader, _session_resolver
    _connection_reader = None
    _session_resolver = None


def get_connection_reader() -> Optional[Callable]:
    return _connection_reader


def get_session_resolver() -> Optional[Callable]:
    from family_bridge_core.sessions import resolve_identity_session
    return _session_resolver or resolve_identity_session
