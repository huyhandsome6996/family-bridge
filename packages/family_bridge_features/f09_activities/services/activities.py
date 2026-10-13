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


def _now():
    import datetime as dt
    return dt.datetime.now(tz=UTC)


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
        "body": str(raw.get("body", ""))[:2000],
        "audience": str(raw["audience"])[:16],
        "minutes": raw.get("minutes", 1),
    }


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
        if reader.active_connection_between(user_a=str(inviter_id),
                                            user_b=str(invitee_id)) is None:
            raise NotFound({"reason": "no_active_connection"})
        from django.db import IntegrityError
        try:
            with transaction.atomic():
                invite, _ = SharedActivityInvite.objects.get_or_create(
                    content_key=str(content_key),
                    content_revision=int(content_revision),
                    inviter_id=str(inviter_id), invitee_id=str(invitee_id),
                    status=INVITE_PENDING,
                    defaults={})
                return invite
        except IntegrityError:
            invite = SharedActivityInvite.objects.filter(
                content_key=str(content_key),
                inviter_id=str(inviter_id), invitee_id=str(invitee_id),
                status=INVITE_PENDING,
            ).first()
            if invite is not None:
                return invite
            raise

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
        """INVITEE-only accept/decline — the inviter cannot tick for them."""
        invite = self._require_party(invite_id, str(invitee_id))
        if str(invite.invitee_id) != str(invitee_id):
            raise NotFound({"reason": "invite_not_found"})
        if invite.status != INVITE_PENDING:
            return invite  # one-way
        if decision == "accept":
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
        side's. invitee must have accepted first; inviter free-form."""
        invite = self._require_party(invite_id, str(actor_id))
        if response_status not in PROGRESS_STATUSES:
            raise InputInvalid({"field": "response_status",
                                "reason": "invalid_status"})
        is_invitee = str(invite.invitee_id) == str(actor_id)
        is_inviter = str(invite.inviter_id) == str(actor_id)
        if is_invitee and invite.status != "accepted":
            raise InputInvalid({"reason": "invite_not_accepted"})
        if is_invitee:
            invite.invitee_response = response_status
        elif is_inviter:
            invite.inviter_response = response_status
        else:
            raise NotFound({"reason": "invite_not_found"})
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
