"""F14 port registry — form provider + research policy reader."""

from __future__ import annotations

from typing import Callable, Optional

_form_provider: Optional[Callable] = None
_policy_reader: Optional[Callable] = None
_session_resolver: Optional[Callable] = None


def register_form_provider(fn: Callable) -> None:
    """Published survey forms:
    list_forms() -> [{form_key, revision, title, audience, cohort, phase:
      "pre"|"post"|"pre_post", questions: [{q_key, kind, required,
      choices?}]}] — typed, versioned; NO text question kinds."""
    global _form_provider
    if not (callable(fn) or hasattr(fn, "list_forms")):
        raise ValueError("form provider must implement the port")
    _form_provider = fn


def register_policy_reader(fn: Callable) -> None:
    """ResearchPolicyReader port (B00 protocols). Unset policy -> no live
    cohort reports (DEC-15); tests register a synthetic policy."""
    global _policy_reader
    if not (callable(fn) or hasattr(fn, "current_policy")):
        raise ValueError("policy reader must implement the port")
    _policy_reader = fn


def register_session_resolver(fn: Callable) -> None:
    global _session_resolver
    if not callable(fn):
        raise ValueError("session resolver must be callable")
    _session_resolver = fn


def reset_registries() -> None:
    global _form_provider, _policy_reader, _session_resolver
    _form_provider = None
    _policy_reader = None
    _session_resolver = None


def get_form_provider() -> Optional[Callable]:
    return _form_provider


def get_policy_reader() -> Optional[Callable]:
    return _policy_reader


def get_session_resolver() -> Optional[Callable]:
    from family_bridge_core.sessions import resolve_identity_session
    return _session_resolver or resolve_identity_session
