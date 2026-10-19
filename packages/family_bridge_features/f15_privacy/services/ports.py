"""F15 runtime ports: connection reader, consent writer, handler authorizer.

Production implementations are registered ONCE at app startup by
``services.wiring.configure_production_wiring()`` (explicit allowlist inside
the F15 package — never from client/admin config, WF-22). Tests may register
replacements and call ``reset_ports()`` between cases (TEST-ONLY).

Fail-closed rule: every ``get_*`` returning None means "port not wired" and
callers MUST deny / answer 503 ``module_unavailable`` — never fake success.
"""

from __future__ import annotations

from typing import Callable, Optional

_connection_reader: Optional[Callable] = None
_consent_writer: Optional[Callable] = None
_handler_authorizer: Optional[Callable] = None


def register_connection_reader(reader: Callable) -> None:
    """Reader must implement the ConnectionReader port surface."""
    global _connection_reader
    if not (callable(reader) or hasattr(reader, "active_connection_between")):
        raise ValueError("connection reader must implement the port")
    _connection_reader = reader


def register_consent_writer(writer: Callable) -> None:
    """Writer must implement ``withdraw(*, user_id: str, purpose: str)``."""
    global _consent_writer
    if not (callable(writer) or callable(getattr(writer, "withdraw", None))):
        raise ValueError("consent writer must implement withdraw(user_id, purpose)")
    _consent_writer = writer


def register_handler_authorizer(authorizer: Callable) -> None:
    """Authorizer must implement ``authorize(*, actor_id: str, action: str,
    request_id: str) -> bool`` (production: B16 capability privacy.case)."""
    global _handler_authorizer
    if not (callable(authorizer) or callable(getattr(authorizer, "authorize", None))):
        raise ValueError("authorizer must implement authorize(actor_id, action, request_id)")
    _handler_authorizer = authorizer


def reset_ports() -> None:
    """TEST-ONLY: clear all port registrations."""
    global _connection_reader, _consent_writer, _handler_authorizer
    _connection_reader = None
    _consent_writer = None
    _handler_authorizer = None


def get_connection_reader() -> Optional[Callable]:
    return _connection_reader


def get_consent_writer() -> Optional[Callable]:
    return _consent_writer


def get_handler_authorizer() -> Optional[Callable]:
    return _handler_authorizer
