"""F11 port registry — transport, invite connector, session resolver."""

from __future__ import annotations

from typing import Callable, Optional

_transport: Optional[Callable] = None
_invite_connector: Optional[Callable] = None
_session_resolver: Optional[Callable] = None


def register_transport(fn: Callable) -> None:
    global _transport
    if not (callable(fn) or hasattr(fn, "send")):
        raise ValueError("transport must implement the MessageTransport port")
    _transport = fn


def register_invite_connector(fn: Callable) -> None:
    """F01 ConnectionInvitation adapter at integration (B18); test double
    standalone. Ensures the supporter is reachable via the normal bilateral
    invite flow — f11 never creates its own identity/user table."""
    global _invite_connector
    if not (callable(fn) or hasattr(fn, "ensure_backup_connection")):
        raise ValueError("invite connector must implement the port")
    _invite_connector = fn


def register_session_resolver(fn: Callable) -> None:
    global _session_resolver
    if not callable(fn):
        raise ValueError("session resolver must be callable")
    _session_resolver = fn


def reset_registries() -> None:
    global _transport, _invite_connector, _session_resolver
    _transport = None
    _invite_connector = None
    _session_resolver = None


def get_transport() -> Optional[Callable]:
    return _transport


def get_invite_connector() -> Optional[Callable]:
    return _invite_connector


def get_session_resolver() -> Optional[Callable]:
    return _session_resolver
