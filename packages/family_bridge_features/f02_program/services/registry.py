"""F02 port registry — program content provider (B16 lifecycle at B18)."""

from __future__ import annotations

from typing import Callable, Optional

_program_provider: Optional[Callable] = None
_session_resolver: Optional[Callable] = None


def register_program_provider(fn: Callable) -> None:
    """Returns published programs:
    list_programs() -> [{program_key, revision, title, weeks[1..4]:
      {week_no, title, goals[], student_guide, caregiver_guide,
       joint_activity_keys[]}, agreement: {revision, title, commitments[]}}]
    Only status=published immutable revisions; test double in labgrants."""
    global _program_provider
    if not (callable(fn) or hasattr(fn, "list_programs")):
        raise ValueError("program provider must implement the port")
    _program_provider = fn


def register_session_resolver(fn: Callable) -> None:
    global _session_resolver
    if not callable(fn):
        raise ValueError("session resolver must be callable")
    _session_resolver = fn


def reset_registries() -> None:
    global _program_provider, _session_resolver
    _program_provider = None
    _session_resolver = None


def get_program_provider() -> Optional[Callable]:
    return _program_provider


def get_session_resolver() -> Optional[Callable]:
    from family_bridge_core.sessions import resolve_identity_session
    return _session_resolver or resolve_identity_session
