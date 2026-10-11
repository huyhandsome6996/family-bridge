"""F12 port registry — staff directory gate + school directory reader."""

from __future__ import annotations

from typing import Callable, Optional

_staff_directory: Optional[Callable] = None
_school_directory: Optional[Callable] = None
_session_resolver: Optional[Callable] = None


def register_staff_directory(fn: Callable) -> None:
    """Returns operators with the appointment capability:
    list_handlers() -> [user_id...] and has_capability(user_id) -> bool.
    Unwired/empty = scheduling disabled (production gate, US-046)."""
    global _staff_directory
    if not (callable(fn) or hasattr(fn, "list_handlers")):
        raise ValueError("staff directory must implement the port")
    _staff_directory = fn


def register_school_directory(fn: Callable) -> None:
    global _school_directory
    if not (callable(fn) or hasattr(fn, "list_public_contacts")):
        raise ValueError("school directory must implement the port")
    _school_directory = fn


def register_session_resolver(fn: Callable) -> None:
    global _session_resolver
    if not callable(fn):
        raise ValueError("session resolver must be callable")
    _session_resolver = fn


def reset_registries() -> None:
    global _staff_directory, _school_directory, _session_resolver
    _staff_directory = None
    _school_directory = None
    _session_resolver = None


def get_staff_directory() -> Optional[Callable]:
    return _staff_directory


def get_school_directory() -> Optional[Callable]:
    return _school_directory


def get_session_resolver() -> Optional[Callable]:
    return _session_resolver
