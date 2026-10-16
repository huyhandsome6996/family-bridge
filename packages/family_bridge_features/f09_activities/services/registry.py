"""F09 port registry — published content reader + connection reader."""

from __future__ import annotations

from typing import Callable, Optional

_content_reader: Optional[Callable] = None
_connection_reader: Optional[Callable] = None
_session_resolver: Optional[Callable] = None


def register_content_reader(fn: Callable) -> None:
    """PublishedContentReader port (owner B16 at integration; test double
    standalone). Only published immutable revisions come through."""
    global _content_reader
    if not (callable(fn) or hasattr(fn, "list_published")):
        raise ValueError("content reader must implement the port")
    _content_reader = fn


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
    global _content_reader, _connection_reader, _session_resolver
    _content_reader = None
    _connection_reader = None
    _session_resolver = None


def get_content_reader() -> Optional[Callable]:
    return _content_reader


def get_connection_reader() -> Optional[Callable]:
    return _connection_reader


def get_session_resolver() -> Optional[Callable]:
    from family_bridge_core.sessions import resolve_identity_session
    return _session_resolver or resolve_identity_session
