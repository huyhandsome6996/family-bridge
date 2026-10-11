"""F08 port registry — prompt provider + connection reader + sessions."""

from __future__ import annotations

from typing import Callable, Optional

_prompt_provider: Optional[Callable] = None
_connection_reader: Optional[Callable] = None
_session_resolver: Optional[Callable] = None


def register_prompt_provider(fn: Callable) -> None:
    global _prompt_provider
    if not (callable(fn) or hasattr(fn, "list_prompts")):
        raise ValueError("prompt provider must implement the port")
    _prompt_provider = fn


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
    global _prompt_provider, _connection_reader, _session_resolver
    _prompt_provider = None
    _connection_reader = None
    _session_resolver = None


def get_prompt_provider() -> Optional[Callable]:
    return _prompt_provider


def get_connection_reader() -> Optional[Callable]:
    return _connection_reader


def get_session_resolver() -> Optional[Callable]:
    return _session_resolver
