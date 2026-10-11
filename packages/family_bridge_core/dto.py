"""Shared DTOs (dataclasses) used across ports and services.

Keep them small and serializable. Domain models live in feature apps; DTOs
here are the cross-module surface so modules never import each other's models
(B00 rule). UUIDs are carried as str to stay JSON/JS safe; Zalo ids are
always str (never Number).
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

from .timeutils import iso_utc


@dataclass(frozen=True)
class ActorRef:
    """Authenticated principal resolved server-side (never client-supplied)."""
    user_id: str
    role: str                     # student | caregiver | staff | admin | system
    display_name: str = ""        # minimal, optional


@dataclass(frozen=True)
class PageRequest:
    cursor: Optional[str] = None
    page_size: int = 20           # default 20 / max 50 (DSA budget)

    def __post_init__(self) -> None:
        if not 1 <= int(self.page_size) <= 50:
            raise ValueError("page_size must be 1..50")


@dataclass(frozen=True)
class PageResult:
    items: list
    next_cursor: Optional[str]
    has_more: bool

    def to_dict(self, serializer=None) -> Dict[str, Any]:
        items = [serializer(item) for item in self.items] if serializer else list(self.items)
        return {"next": self.next_cursor, "results": items, "has_more": self.has_more}


@dataclass(frozen=True)
class OperationStatus:
    """Outcome lookup envelope for unknown network results (FL-08)."""
    idempotency_key: str
    state: str                    # sent | not_found | pending | failed
    message_id: Optional[str] = None
    created_at: Optional[dt.datetime] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "idempotency_key": self.idempotency_key,
            "state": self.state,
            "message_id": self.message_id,
            "created_at": iso_utc(self.created_at) if self.created_at else None,
        }


@dataclass(frozen=True)
class ErrorEnvelope:
    code: str
    details: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {"error": {"code": self.code, "details": self.details}}
