"""F05 port registry: connection reader + reply-context validator.

Branch-independent wiring (same pattern as F15):
- integration: register F01's InviteService (ConnectionReader) and F15's
  policy-backed validator;
- standalone harness runs: test doubles under tests/feature-lab/labgrants.
"""

from __future__ import annotations

from typing import Callable, Optional

_connection_reader: Optional[Callable] = None
_context_validator: Optional[Callable] = None


def register_connection_reader(fn: Callable) -> None:
    global _connection_reader
    # Accept callables OR objects implementing the ConnectionReader port.
    if not (callable(fn) or hasattr(fn, "active_connection_between")):
        raise ValueError("connection reader must implement the port")
    _connection_reader = fn


def register_context_validator(fn: Callable) -> None:
    global _context_validator
    if not (callable(fn) or hasattr(fn, "validate")):
        raise ValueError("context validator must be callable")
    _context_validator = fn


def reset_registries() -> None:
    global _connection_reader, _context_validator, _quick_reply_provider
    global _session_resolver
    _connection_reader = None
    _context_validator = None
    _quick_reply_provider = None
    _session_resolver = None


def get_connection_reader() -> Optional[Callable]:
    global _connection_reader
    if _connection_reader is not None:
        return _connection_reader
    try:  # integration path
        from family_bridge_features.f01_identity.services.invites import InviteService
        service = InviteService()
        return service
    except ImportError:
        return None


def get_context_validator() -> Optional[Callable]:
    return _context_validator


# --- quick reply templates (published content via provider port) -----------

_quick_reply_provider: Optional[Callable] = None


def register_quick_reply_provider(fn: Callable) -> None:
    global _quick_reply_provider
    if not (callable(fn) or hasattr(fn, "list_templates")):
        raise ValueError("quick reply provider must implement the port")
    _quick_reply_provider = fn


def get_quick_reply_provider() -> Optional[Callable]:
    global _quick_reply_provider
    return _quick_reply_provider


# --- session resolver (branch-independent) ----------------------------------

_session_resolver: Optional[Callable] = None


def register_session_resolver(fn: Callable) -> None:
    global _session_resolver
    if not callable(fn):
        raise ValueError("session resolver must be callable")
    _session_resolver = fn



def get_session_resolver() -> Optional[Callable]:
    from family_bridge_core.sessions import resolve_identity_session
    return _session_resolver or resolve_identity_session
