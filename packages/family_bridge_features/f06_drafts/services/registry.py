"""F06 port registry — per-kind draft sender + session resolver.

Draft senders (per kind) delegate the FINAL send to the one production path:
- kind "text"        -> F05 MessageTransport (B18 wiring; harness double)
- kind "emotion_card"-> F03 CardSendService (B18 wiring; harness double)
Nothing else may send. Unwired kind -> module_unavailable (fail closed) —
never a silent local insert. The pause gate lives ONLY here: help/listening
requests never touch F06 (WF-07).
"""

from __future__ import annotations

from typing import Callable, Dict, Optional

_senders: Dict[str, Callable] = {}
_session_resolver: Optional[Callable] = None
_clock: Optional[Callable] = None


def register_sender(*, kind: str, fn: Callable) -> None:
    if not isinstance(kind, str) or not kind:
        raise ValueError("sender kind required")
    if not callable(fn):
        raise ValueError("sender must be callable")
    _senders[kind] = fn


def register_session_resolver(fn: Callable) -> None:
    global _session_resolver
    if not callable(fn):
        raise ValueError("session resolver must be callable")
    _session_resolver = fn


def register_clock(fn: Callable) -> None:
    """Controlled clock for tests; production falls back to SystemClock."""
    global _clock
    if not callable(fn):
        raise ValueError("clock must be callable")
    _clock = fn


def reset_registries() -> None:
    global _senders, _session_resolver, _clock
    _senders = {}
    _session_resolver = None
    _clock = None


def get_sender(*, kind: str) -> Optional[Callable]:
    return _senders.get(kind)


def get_session_resolver() -> Optional[Callable]:
    from family_bridge_core.sessions import resolve_identity_session
    return _session_resolver or resolve_identity_session


def get_clock() -> Optional[Callable]:
    return _clock
