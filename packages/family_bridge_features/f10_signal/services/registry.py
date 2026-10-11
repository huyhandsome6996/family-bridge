"""F10 port registry — transport + connection reader + session resolver."""

from __future__ import annotations

from typing import Callable, Optional

_transport: Optional[Callable] = None
_connection_reader: Optional[Callable] = None
_session_resolver: Optional[Callable] = None


def register_transport(fn: Callable) -> None:
    global _transport
    if not (callable(fn) or hasattr(fn, "send")):
        raise ValueError("transport must implement the MessageTransport port")
    _transport = fn


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
    global _transport, _connection_reader, _session_resolver
    _transport = None
    _connection_reader = None
    _session_resolver = None


def get_transport() -> Optional[Callable]:
    return _transport


def get_connection_reader() -> Optional[Callable]:
    return _connection_reader


def get_session_resolver() -> Optional[Callable]:
    return _session_resolver
