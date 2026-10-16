"""F04 port registry — AI provider allowlist (branch-independent wiring).

- The AI provider is a SERVER-SIDE registry allowlist (protocol + id); no
  admin-entered URL/key ever reaches this module. Keys live in env/secret
  store inside the provider implementation (B18 wiring), never here.
- No provider registered == AI off: the service fails closed with
  module_unavailable and manual writing remains the working path (US-033).
- Nothing here logs sentence content (SEC-22).
"""

from __future__ import annotations

from typing import Callable, Optional

_ai_provider: Optional[Callable] = None
_session_resolver: Optional[Callable] = None


def register_ai_provider(fn: Callable) -> None:
    global _ai_provider
    if not (callable(fn) or hasattr(fn, "refine")):
        raise ValueError("ai provider must implement the refine port")
    _ai_provider = fn


def register_session_resolver(fn: Callable) -> None:
    global _session_resolver
    if not callable(fn):
        raise ValueError("session resolver must be callable")
    _session_resolver = fn


def reset_registries() -> None:
    global _ai_provider, _session_resolver
    _ai_provider = None
    _session_resolver = None


def get_ai_provider() -> Optional[Callable]:
    return _ai_provider


def get_session_resolver() -> Optional[Callable]:
    from family_bridge_core.sessions import resolve_identity_session
    return _session_resolver or resolve_identity_session
