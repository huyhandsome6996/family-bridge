"""F09 production wiring: published-content reader + F01 connection reader.

Port contracts consumed by ActivityService:
  content_reader.list_published(limit) -> [{content_key, kind, title, body,
    audience, revision, status, published_at}] — only B16 status=published
    immutable releases; malformed bodies are skipped (fail closed).
  connection_reader.active_connection_between(user_a, user_b) -> {...}|None

Registered once per process via apps.ready(); lab tests overwrite with test
doubles afterwards (reset_registries).
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

ACTIVITY_CONTENT_KINDS = ("activity", "micro_lesson", "paper_guide")
_ACTIVITY_LIMIT = 50


def _source_minutes(body: Dict[str, Any]) -> Optional[int]:
    """QA 19/10 R06 (production-wiring completion): the activity/lesson
    MINUTES live INSIDE the published body JSON (ContentItem has no
    minutes column), while the content-reader port contract — and
    `_safe_content`/`_safe_minutes` on the service side — read minutes at
    the TOP LEVEL of the raw dict (same shape as the port's test doubles
    in tests/feature-lab/labgrants/f09_fixtures.py).

    Lift a source-provided integer (non-bool) into that slot so the
    pass-through works in production too; the service stays the single
    bounds authority (integer 1..1440 passes, anything else -> None and
    the UI honestly says "chưa được cung cấp" — never a invented default).
    """
    minutes = body.get("minutes")
    if isinstance(minutes, bool) or not isinstance(minutes, int):
        return None
    return minutes


class PublishedContentActivityReader:
    """B16 ContentItem-backed reader for F09 cards/lessons/guides."""

    def list_published(self, limit: int = _ACTIVITY_LIMIT) -> List[Dict[str, Any]]:
        from family_bridge_features.admin_core.models import (
            CONTENT_PUBLISHED, ContentItem,
        )
        bounded = max(1, min(int(limit or _ACTIVITY_LIMIT), _ACTIVITY_LIMIT))
        rows = (ContentItem.objects
                .filter(status=CONTENT_PUBLISHED)
                .filter(kind__in=ACTIVITY_CONTENT_KINDS)
                .order_by("-published_at", "-id")[:bounded])
        out: List[Dict[str, Any]] = []
        for item in rows:
            try:
                body = json.loads(item.body or "")
            except (ValueError, TypeError):
                continue  # fail closed: malformed release never surfaces
            if not isinstance(body, dict):
                continue
            content_key = str(item.content_key or "").strip()
            if not (1 <= len(content_key) <= 64):
                continue
            card: Dict[str, Any] = {
                "content_key": content_key,
                "kind": str(item.kind)[:32],
                "title": str(item.title)[:120],
                "body": body,
                "audience": str(item.audience)[:16],
                "revision": int(item.revision),
                "status": str(item.status),
                "published_at": item.published_at.isoformat()
                if item.published_at else None,
            }
            minutes = _source_minutes(body)
            if minutes is not None:
                card["minutes"] = minutes
            out.append(card)
        return out


class F01ConnectionReader:
    """Same lazy-import idiom as F16/F02 wiring — F01 rows read, never mutated."""

    def active_connection_between(self, *, user_a: str, user_b: str):
        from family_bridge_features.f01_identity.models import (
            CONNECTION_ACTIVE, Connection,
        )
        low_id, high_id = sorted([str(user_a), str(user_b)])
        row = (Connection.objects
               .filter(party_low_id=low_id, party_high_id=high_id,
                       status=CONNECTION_ACTIVE)
               .order_by("-id").first())
        if row is None:
            return None
        return {"connection_id": str(row.id),
                "generation": int(row.generation),
                "relationship_kind": row.relationship_kind,
                "status": row.status}
