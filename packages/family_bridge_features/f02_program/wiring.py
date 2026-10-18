"""F02 production wiring (US-036/US-044): published-content program provider
+ F01 connection reader, registered at Django startup via apps.ready().

Fail-closed principle (task 2.3):
- Only admin_core ContentItem rows with kind="f02_program" AND
  status="published" surface as programs (B16 lifecycle: publish = immutable
  release; edits require clone_draft -> publish with revision+1).
- Malformed/unvalidatable bodies are SKIPPED (never surfaced), so a broken
  draft can never render as content; no published content at all -> catalog
  empty and weeks/agreement endpoints 503 program_content_unwired? No — the
  provider IS wired; empty published set yields NotFound program_not_published
  on enroll/weeks (honest "chưa phát hành", không fake success).
- Bounded: query limited (ORDER BY published_at DESC, LIMIT 20), payload
  trimmed by the same bounds as the service (_safe_program).

Connection reader (for the week-4 family agreement): reads F01 Connection
rows lazily (import inside methods, same idiom as F16 proposals.py) — the
pair identity stays F01-owned; F02 only consumes (party_low, party_high,
status=active, generation).
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

PROGRAM_CONTENT_KIND = "f02_program"
_PROGRAM_LIMIT = 20
_WEEK_COUNT_EXPECTED = 4  # scope: exactly four weeks (never widen to 8)


def _parse_weeks(body: Dict[str, Any]) -> Optional[List[Dict[str, Any]]]:
    weeks_raw = body.get("weeks")
    if not isinstance(weeks_raw, list) or len(weeks_raw) != _WEEK_COUNT_EXPECTED:
        return None
    seen: set = set()
    weeks: List[Dict[str, Any]] = []
    for week in weeks_raw:
        if not isinstance(week, dict):
            return None
        week_no = week.get("week_no")
        if isinstance(week_no, bool) or not isinstance(week_no, int) \
                or not 1 <= week_no <= 8 or week_no in seen:
            return None
        seen.add(week_no)
        title = week.get("title")
        if not isinstance(title, str) or not (1 <= len(title) <= 120):
            return None
        goals = week.get("goals") or []
        if not isinstance(goals, list) or len(goals) > 6 or \
                any(not isinstance(g, str) or len(g) > 200 for g in goals):
            return None
        student_guide = week.get("student_guide", "")
        caregiver_guide = week.get("caregiver_guide", "")
        if not isinstance(student_guide, str) or not isinstance(caregiver_guide, str) \
                or len(student_guide) > 4000 or len(caregiver_guide) > 4000:
            return None
        joint_keys = week.get("joint_activity_keys") or []
        if not isinstance(joint_keys, list) or len(joint_keys) > 6 or \
                any(not isinstance(k, str) or not (1 <= len(k) <= 64)
                    for k in joint_keys):
            return None
        weeks.append({
            "week_no": week_no,
            "title": title,
            "goals": [str(g)[:200] for g in goals],
            "student_guide": student_guide,
            "caregiver_guide": caregiver_guide,
            "joint_activity_keys": [str(k)[:64] for k in joint_keys],
        })
    if {w["week_no"] for w in weeks} != {1, 2, 3, 4}:
        return None
    return weeks


def _parse_agreement(body: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    agreement = body.get("agreement")
    if not isinstance(agreement, dict):
        return None
    revision = agreement.get("revision")
    if isinstance(revision, bool) or not isinstance(revision, int) or revision < 1:
        return None
    title = agreement.get("title", "")
    if not isinstance(title, str) or len(title) > 120:
        return None
    commitments = agreement.get("commitments") or []
    if not isinstance(commitments, list) or len(commitments) > 10 or \
            any(not isinstance(c, str) or not (1 <= len(c) <= 200)
                for c in commitments):
        return None
    return {"revision": revision, "title": str(title)[:120],
            "commitments": [str(c)[:200] for c in commitments]}


def _row_to_program(item) -> Optional[Dict[str, Any]]:
    """Parse one admin_core ContentItem row into the provider program dict,
    or None (fail closed) when the release is malformed/invalid — same
    validation for both the bounded catalog list and the exact lookup."""
    try:
        body = json.loads(item.body or "")
    except (ValueError, TypeError):
        return None  # fail closed: malformed release never surfaces
    if not isinstance(body, dict):
        return None
    weeks = _parse_weeks(body)
    agreement = _parse_agreement(body)
    if weeks is None or agreement is None:
        return None
    content_key = str(item.content_key or "").strip()
    if not (1 <= len(content_key) <= 64):
        return None
    return {
        "program_key": content_key,
        "revision": int(item.revision),
        "title": str(item.title)[:120],
        # Port contract: chỉ published đi qua đây (caller đã filter status)
        # — khai báo đúng trạng thái để _safe_program của service
        # xác thực như với mọi provider khác.
        "status": "published",
        "weeks": weeks,
        "agreement": agreement,
    }


class PublishedContentProgramProvider:
    """Port implementation backed by B16 admin_core ContentItem.

    Mapping: one ContentItem row = one immutable program revision.
      content_key -> program_key, revision -> ContentItem.revision,
      title -> title, body (JSON) -> {weeks[4], agreement{revision,title,
      commitments[]}}.

    Two bounded read paths:
    - list_programs(): catalog window, newest first, LIMIT _PROGRAM_LIMIT
      (the service additionally pages to 10) — for browse/enroll choices.
    - get_program(): EXACT (content_key, revision) match, at most one
      candidate row — so an enrollment pinned to an OLD revision stays
      readable no matter how many newer releases push it out of the
      catalog window (R3). No unbounded scan, no history download.
    """

    def list_programs(self) -> List[Dict[str, Any]]:
        from family_bridge_features.admin_core.models import (
            CONTENT_PUBLISHED, ContentItem,
        )
        rows = (ContentItem.objects
                .filter(kind=PROGRAM_CONTENT_KIND, status=CONTENT_PUBLISHED)
                .order_by("-published_at", "-id")[:_PROGRAM_LIMIT])
        out: List[Dict[str, Any]] = []
        for item in rows:
            program = _row_to_program(item)
            if program is not None:
                out.append(program)
        return out

    def get_program(self, *, program_key: str, revision: int) -> Optional[Dict[str, Any]]:
        from family_bridge_features.admin_core.models import (
            CONTENT_PUBLISHED, ContentItem,
        )
        key = str(program_key or "").strip()
        if not (1 <= len(key) <= 64):
            return None
        try:
            rev = int(revision)
        except (TypeError, ValueError):
            return None
        if rev < 1:
            return None
        row = (ContentItem.objects
               .filter(kind=PROGRAM_CONTENT_KIND, status=CONTENT_PUBLISHED,
                       content_key=key, revision=rev)
               .order_by("-published_at", "-id").first())
        if row is None:
            return None
        return _row_to_program(row)


class F01ConnectionReader:
    """Connection reader port backed by F01 Connection (lazy import — F16
    idiom). Returns plain dicts; F02 never mutates F01 rows."""

    def active_connection_between(self, *, user_a: str, user_b: str):
        from family_bridge_features.f01_identity.models import (
            CONNECTION_ACTIVE, RELATIONSHIP_PRIMARY, Connection,
        )
        low_id, high_id = sorted([str(user_a), str(user_b)])
        row = (Connection.objects
               .filter(party_low_id=low_id, party_high_id=high_id,
                       relationship_kind=RELATIONSHIP_PRIMARY,
                       status=CONNECTION_ACTIVE)
               .order_by("-id").first())
        if row is None:
            return None
        return {"connection_id": str(row.id),
                "generation": int(row.generation),
                "relationship_kind": row.relationship_kind,
                "status": row.status}

    def active_connection_for(self, *, user_id: str):
        from family_bridge_features.f01_identity.models import (
            CONNECTION_ACTIVE, RELATIONSHIP_PRIMARY, Connection,
        )
        row = (Connection.objects
               .filter(status=CONNECTION_ACTIVE,
                       relationship_kind=RELATIONSHIP_PRIMARY)
               .filter(models_q_active_for(str(user_id)))
               .order_by("-id").first())
        if row is None:
            return None
        other = (str(row.party_high_id)
                 if str(row.party_low_id) == str(user_id)
                 else str(row.party_low_id))
        return {"connection_id": str(row.id),
                "generation": int(row.generation),
                "relationship_kind": row.relationship_kind,
                "counterpart_id": other,
                "status": row.status}


def models_q_active_for(user_id: str):
    from django.db.models import Q
    return Q(party_low_id=user_id) | Q(party_high_id=user_id)
