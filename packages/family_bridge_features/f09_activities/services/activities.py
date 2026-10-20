"""F09 service: published catalog, private progress, two-sided invites."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from django.db import transaction

from family_bridge_core.errors import (
    InputInvalid, ModuleUnavailable, NotFound,
)
from family_bridge_core.timeutils import UTC

from ..models import (
    INVITE_PENDING, PROGRESS_STATUSES, ActivityProgress, SharedActivityInvite,
)
from . import registry

CONTENT_KINDS = ("activity", "micro_lesson")
AUDIENCES = ("student", "caregiver", "joint", "neutral")

MAX_MINUTES = 24 * 60  # one day bound; activity minutes are honest metadata


def _now():
    import datetime as dt
    return dt.datetime.now(tz=UTC)


def _safe_body(raw_body: Any) -> Dict[str, Any]:
    """QA 19/10 R06: bounded, TYPED body for the detail view — never a
    Python repr string, never innerHTML-fed. Only known fields survive,
    each bounded, so malformed/untrusted content cannot smuggle structure:
      {goal?: str<=300, steps?: [str<=500]x10, share?: str<=300,
       text?: str<=2000}  (text = plain-string bodies, kept honest)
    """
    if isinstance(raw_body, str):
        text = raw_body.strip()[:2000]
        return {"text": text} if text else {}
    if not isinstance(raw_body, dict):
        return {}
    out: Dict[str, Any] = {}
    goal = raw_body.get("goal")
    if isinstance(goal, str) and goal.strip():
        out["goal"] = goal.strip()[:300]
    steps = raw_body.get("steps")
    if isinstance(steps, list):
        cleaned = [str(step).strip()[:500] for step in steps
                   if isinstance(step, str) and step.strip()]
        if cleaned:
            out["steps"] = cleaned[:10]
    share = raw_body.get("share")
    if isinstance(share, str) and share.strip():
        out["share"] = share.strip()[:300]
    return out


def _safe_minutes(raw_minutes: Any) -> Optional[int]:
    """QA 19/10 R06: minutes are source metadata — pass the value through
    when the source provides a sane integer, else None (the UI then says
    "chưa được cung cấp" instead of inventing a default like 1 minute)."""
    if isinstance(raw_minutes, bool) or not isinstance(raw_minutes, int):
        return None
    if not 1 <= raw_minutes <= MAX_MINUTES:
        return None
    return raw_minutes


def _safe_content(raw: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, dict):
        return None
    for key in ("content_key", "kind", "revision", "title", "audience",
                "status"):
        if key not in raw:
            return None
    if raw.get("status") != "published":
        return None
    if raw.get("kind") not in CONTENT_KINDS:
        return None
    return {
        "content_key": str(raw["content_key"])[:64],
        "kind": str(raw["kind"])[:16],
        "revision": int(raw["revision"]),
        "title": str(raw["title"])[:120],
        "body": _safe_body(raw.get("body")),
        "audience": str(raw["audience"])[:16],
        "minutes": _safe_minutes(raw.get("minutes")),
    }


def _connection_generation(connection) -> Optional[int]:
    """Normalize the connection-reader result (production wiring returns a
    dict; test doubles may return an attribute view) to an int generation,
    or None when the reader exposes no usable generation."""
    if connection is None:
        return None
    raw = (connection.get("generation")
           if isinstance(connection, dict)
           else getattr(connection, "generation", None))
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


class ActivityService:
    def catalog(self, *, kind: Optional[str] = None,
                audience: Optional[str] = None) -> List[Dict[str, Any]]:
        reader = registry.get_content_reader()
        if reader is None:
            return []
        out: List[Dict[str, Any]] = []
        for raw in (reader.list_published(limit=50) or []):
            card = _safe_content(raw)
            if card is None:
                continue
            if kind and card["kind"] != kind:
                continue
            if audience and card["audience"] not in (audience, "neutral",
                                                     "joint"):
                continue
            out.append(card)
        return out[:50]

    def _published_card(self, content_key: str,
                        revision: int) -> Dict[str, Any]:
        reader = registry.get_content_reader()
        if reader is None:
            raise ModuleUnavailable({"reason": "content_reader_unwired"})
        # R3-analog of F02: progress rows and invites PIN (content_key,
        # content_revision). When newer releases push that exact revision
        # out of the bounded catalog window (50), the pin must STILL be
        # resolvable — providers MAY expose an exact single-row getter.
        # Fallback stays the bounded catalog scan (<=50) for test doubles.
        getter = getattr(reader, "get_published", None)
        if callable(getter):
            raw = getter(content_key=str(content_key), revision=int(revision))
            card = _safe_content(raw) if raw is not None else None
            if (card and card["content_key"] == str(content_key)
                    and card["revision"] == int(revision)):
                return card
            raise NotFound({"reason": "content_not_published"})
        for raw in (reader.list_published(limit=50) or []):
            card = _safe_content(raw)
            if (card and card["content_key"] == str(content_key)
                    and card["revision"] == int(revision)):
                return card
        raise NotFound({"reason": "content_not_published"})

    # -- private progress ------------------------------------------------------
    @transaction.atomic
    def mark_progress(self, *, participant_id: str, content_key: str,
                      content_revision: int, status: str) -> ActivityProgress:
        if status not in PROGRESS_STATUSES:
            raise InputInvalid({"field": "status",
                                "reason": "invalid_status"})
        self._published_card(content_key, content_revision)
        progress, _ = ActivityProgress.objects.update_or_create(
            participant_id=str(participant_id), content_key=str(content_key),
            defaults={"content_revision": int(content_revision),
                      "status": status, "updated_at": _now()})
        return progress

    def list_progress(self, *, participant_id: str):
        return (ActivityProgress.objects.filter(
            participant_id=str(participant_id)).order_by("-updated_at")[:50])

    # -- two-sided invites -------------------------------------------------------
    def _require_live_connection(self, *, user_a: str, user_b: str,
                                 pinned_generation: Optional[int]):
        """QA 19/10 R03: shared-activity state needs the connection to be
        active RIGHT NOW at the SAME generation the invite was created
        under. Unlink -> no_active_connection; reconnect creates a NEW
        generation -> connection_changed, so an old invite can never be
        revived on the new connection."""
        reader = registry.get_connection_reader()
        if reader is None:
            raise ModuleUnavailable(
                {"reason": "connection_reader_not_wired"})
        connection = reader.active_connection_between(user_a=str(user_a),
                                                      user_b=str(user_b))
        if connection is None:
            raise InputInvalid({"reason": "no_active_connection"})
        generation = _connection_generation(connection)
        if (pinned_generation is not None and generation is not None
                and generation != int(pinned_generation)):
            raise InputInvalid({"reason": "connection_changed",
                                "invite_generation":
                                    int(pinned_generation),
                                "connection_generation": generation})
        return connection

    @transaction.atomic
    def invite(self, *, inviter_id: str, invitee_id: str, content_key: str,
               content_revision: int) -> SharedActivityInvite:
        if str(invitee_id) == str(inviter_id):
            raise InputInvalid({"field": "invitee_id",
                                "reason": "cannot_invite_self"})
        self._published_card(content_key, content_revision)
        reader = registry.get_connection_reader()
        if reader is None:
            raise ModuleUnavailable(
                {"reason": "connection_reader_not_wired"})
        connection = reader.active_connection_between(
            user_a=str(inviter_id), user_b=str(invitee_id))
        if connection is None:
            raise NotFound({"reason": "no_active_connection"})
        generation = _connection_generation(connection)
        stale = (SharedActivityInvite.objects.select_for_update().filter(
            content_key=str(content_key), inviter_id=str(inviter_id),
            invitee_id=str(invitee_id), status=INVITE_PENDING).first())
        if stale is not None:
            same_generation = (
                stale.connection_generation is not None
                and generation is not None
                and int(stale.connection_generation) == generation)
            if same_generation:
                return stale  # idempotent re-invite on the same connection
            # Pending invite from an older/unknown generation: it must NOT
            # be reused across generations — close it honestly (history
            # kept) and open the new one pinned to the current generation.
            stale.status = "cancelled"
            stale.updated_at = _now()
            stale.save(update_fields=["status", "updated_at"])
        invite = SharedActivityInvite.objects.create(
            content_key=str(content_key),
            content_revision=int(content_revision),
            inviter_id=str(inviter_id), invitee_id=str(invitee_id),
            connection_generation=generation,
            status=INVITE_PENDING)
        return invite

    def _require_party(self, invite_id: str,
                       viewer_id: str) -> SharedActivityInvite:
        invite = SharedActivityInvite.objects.filter(pk=invite_id).first()
        if (invite is None or str(viewer_id) not in
                (str(invite.inviter_id), str(invite.invitee_id))):
            raise NotFound({"reason": "invite_not_found"})
        return invite

    def list_invites(self, *, viewer_id: str):
        from django.db.models import Q
        return (SharedActivityInvite.objects
                .filter(Q(inviter_id=str(viewer_id))
                        | Q(invitee_id=str(viewer_id)))
                .order_by("-updated_at")[:50])

    @transaction.atomic
    def respond(self, *, invitee_id: str, invite_id: str,
                decision: str) -> SharedActivityInvite:
        """INVITEE-only accept/decline — the inviter cannot tick for them.
        QA 19/10 R03: accepting shared-activity state requires the pair's
        connection to be active at the invite's generation right now;
        after unlink the accept is refused (state untouched) and after a
        reconnect the old invite is never revived. Declining stays
        possible — the recipient can always close a stale invite
        honestly."""
        invite = self._require_party(invite_id, str(invitee_id))
        if str(invite.invitee_id) != str(invitee_id):
            raise NotFound({"reason": "invite_not_found"})
        if invite.status != INVITE_PENDING:
            return invite  # one-way
        if decision == "accept":
            self._require_live_connection(
                user_a=invite.inviter_id, user_b=invite.invitee_id,
                pinned_generation=invite.connection_generation)
            invite.status = "accepted"
        elif decision == "decline":
            invite.status = "declined"
        else:
            raise InputInvalid({"field": "decision",
                                "reason": "invalid_decision"})
        invite.updated_at = _now()
        invite.save()
        return invite

    @transaction.atomic
    def set_own_response(self, *, actor_id: str, invite_id: str,
                         response_status: str) -> SharedActivityInvite:
        """Each participant records THEIR OWN response — never the other
        side's. invitee must have accepted first; inviter free-form.
        QA 19/10 R03: recording a shared response is part of the JOINT
        activity, so it also requires the connection to still be active at
        the invite's generation (unlink stops further shared updates;
        history stays readable)."""
        invite = self._require_party(invite_id, str(actor_id))
        if response_status not in PROGRESS_STATUSES:
            raise InputInvalid({"field": "response_status",
                                "reason": "invalid_status"})
        is_invitee = str(invite.invitee_id) == str(actor_id)
        is_inviter = str(invite.inviter_id) == str(actor_id)
        if not (is_invitee or is_inviter):
            raise NotFound({"reason": "invite_not_found"})
        if is_invitee and invite.status != "accepted":
            raise InputInvalid({"reason": "invite_not_accepted"})
        self._require_live_connection(
            user_a=invite.inviter_id, user_b=invite.invitee_id,
            pinned_generation=invite.connection_generation)
        if is_invitee:
            invite.invitee_response = response_status
        else:
            invite.inviter_response = response_status
        invite.updated_at = _now()
        invite.save()
        return invite

    @transaction.atomic
    def cancel(self, *, inviter_id: str, invite_id: str) -> SharedActivityInvite:
        invite = self._require_party(invite_id, str(inviter_id))
        if str(invite.inviter_id) != str(inviter_id):
            raise NotFound({"reason": "invite_not_found"})
        if invite.status != INVITE_PENDING:
            raise InputInvalid({"reason": "invite_not_cancellable"})
        invite.status = "cancelled"
        invite.updated_at = _now()
        invite.save()
        return invite
