"""Bounded pagination helpers (A09).

Stable keyset cursor over (created_at, id): no OFFSET scans, order is
deterministic, and rows inserted between pages cannot shift the window.
Cursor payloads carry no user data (timestamps + row id only, base64url).

Authorization MUST be applied to the queryset BEFORE paging (DSA rule:
filter by authorization first, then paginate).
"""

from __future__ import annotations

import base64
import datetime as dt
from typing import Optional, Tuple

from family_bridge_core.timeutils import UTC

from django.db.models import Q

MAX_PAGE_SIZE = 50
DEFAULT_PAGE_SIZE = 20


def clamp_limit(raw_limit, default: int = DEFAULT_PAGE_SIZE) -> int:
    """Coerce a client-provided limit into [1, MAX_PAGE_SIZE]."""
    try:
        value = int(raw_limit)
    except (TypeError, ValueError):
        return default
    return max(1, min(MAX_PAGE_SIZE, value))


def encode_cursor(*, created_at: dt.datetime, row_id) -> str:
    raw = f"{created_at.astimezone(UTC).isoformat()}|{row_id}"
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii")


def decode_cursor(cursor) -> Optional[Tuple[dt.datetime, str]]:
    """Return (created_at, row_id) or None for an absent/garbled cursor.

    A garbled cursor is treated as absent rather than a 400: the client
    simply restarts from the first page (nothing is hidden or leaked).
    """
    if not cursor or not isinstance(cursor, str):
        return None
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
        created_iso, row_id = raw.rsplit("|", 1)
        created_at = dt.datetime.fromisoformat(created_iso)
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=UTC)
        return created_at, row_id
    except (ValueError, UnicodeDecodeError):
        return None


def apply_keyset_page(queryset, *, cursor, limit: int, descending: bool = False):
    """Slice `queryset` to one bounded page; return (rows, next_cursor).

    `cursor` is the previous response's next_cursor (or None for page 1).
    The queryset MUST already carry its authorization filters and the
    matching order_by("created_at", "id") / ("-created_at", "-id").
    """
    page_size = clamp_limit(limit)
    point = decode_cursor(cursor)
    if point is not None:
        created_at, row_id = point
        if descending:
            queryset = queryset.filter(
                Q(created_at__lt=created_at)
                | (Q(created_at=created_at) & Q(id__lt=row_id)))
        else:
            queryset = queryset.filter(
                Q(created_at__gt=created_at)
                | (Q(created_at=created_at) & Q(id__gt=row_id)))
    rows = list(queryset[: page_size + 1])
    has_more = len(rows) > page_size
    rows = rows[:page_size]
    next_cursor = None
    if has_more and rows:
        last = rows[-1]
        next_cursor = encode_cursor(created_at=last.created_at, row_id=last.pk)
    return rows, next_cursor


__all__ = [
    "MAX_PAGE_SIZE", "DEFAULT_PAGE_SIZE",
    "clamp_limit", "encode_cursor", "decode_cursor", "apply_keyset_page",
]
