"""F03 port registry — branch-independent wiring (same pattern as F05/F15).

Ports consumed by this module (owners noted in family_bridge_core.protocols):
- MessageTransport (owner F05): the ONE send path. Standalone harness runs
  register a port-conform test double (labgrants.f03_fixtures); B18 wires
  f05_inbox.services.transport.MessageTransportService. Nothing here imports
  another feature's implementation.
- CardProvider (published card catalog): owner B16 content lifecycle at
  integration; test double in labgrants.
- ConnectionReader (owner F01): recipient-side view check (DEC-13 mirror).
- Session resolver: F01 at integration; labgrants double standalone.
"""

from __future__ import annotations

from typing import Callable, Optional

_transport: Optional[Callable] = None
_card_provider: Optional[Callable] = None
_connection_reader: Optional[Callable] = None
_session_resolver: Optional[Callable] = None


def register_transport(fn: Callable) -> None:
    global _transport
    if not (callable(fn) or hasattr(fn, "send")):
        raise ValueError("transport must implement the MessageTransport port")
    _transport = fn


def register_card_provider(fn: Callable) -> None:
    global _card_provider
    if not (callable(fn) or hasattr(fn, "get_card")):
        raise ValueError("card provider must implement the port")
    _card_provider = fn


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
    global _transport, _card_provider, _connection_reader, _session_resolver
    _transport = None
    _card_provider = None
    _connection_reader = None
    _session_resolver = None


def get_transport() -> Optional[Callable]:
    return _transport


def get_card_provider() -> Optional[Callable]:
    return _card_provider


def get_connection_reader() -> Optional[Callable]:
    return _connection_reader


def get_session_resolver() -> Optional[Callable]:
    from family_bridge_core.sessions import resolve_identity_session
    return _session_resolver or resolve_identity_session
