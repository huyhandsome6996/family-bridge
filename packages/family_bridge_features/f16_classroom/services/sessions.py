"""Session resolution port cho F16 (pattern-copy tu f15 services/sessions).

F16 khong tu phat token: bearer session do F01 cap sau khi xac minh. O
tich hop that, resolver nay auto-detect SessionService.resolve_session cua
F01. Harness doc lap co the dang ky resolver test qua
register_session_resolver (khong bao gio la bypass dang nhap production).

Resolver chi xac thuc token bearer mo va tra (user, session) hoac None.
"""

from __future__ import annotations

from typing import Callable, Optional, Tuple

_resolver: Optional[Callable] = None


def register_session_resolver(fn: Callable) -> None:
    global _resolver
    if not callable(fn):
        raise ValueError("resolver must be callable")
    _resolver = fn


def reset_resolver() -> None:
    global _resolver
    _resolver = None


def resolve_session(raw_token: str) -> Optional[Tuple[object, object]]:
    """Returns (user, session) or None. Never logs the token."""
    if _resolver is not None:
        return _resolver(raw_token)
    try:  # integration path: F01 present
        # Import TUYET DOI: pattern "..f01_identity" tu f15/f05 nam trong
        # <app>/services/ chi leo MOT cap (len <app>.f01_identity — sai) va
        # la latent bug tren main; import day du khong phu thuoc do sau file.
        from family_bridge_features.f01_identity.services.identity import (
            SessionService,
        )
        session = SessionService.resolve_session(raw_token)
        return (session.user, session) if session else None
    except ImportError:
        return None
