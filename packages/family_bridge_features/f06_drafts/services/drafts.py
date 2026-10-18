"""Draft + pause service (US-030/US-034). Server clock only (DEC-03).

Guards summary:
- create/edit: kind allowlist, bounds, no AI-linkage fields; edit bumps
  revision, invalidates previews, NEVER moves an existing pause deadline.
- pause: 300s fixed from server now; re-pause returns the SAME deadline
  (no reset/extension); pause allowed only while editing/paused.
- preview: the 300s gate applies to a draft the author actually paused
  (C8) UNTIL the deadline passes — an edit while the pause is still
  running does NOT lift the gate (R03, QA 18/10: pause còn 299s thì
  edit -> preview -> confirm đều 200 = lọt cooldown). Guard is keyed on
  the FUTURE DEADLINE (server clock), not on status: currently paused
  or edited-back-to-editing while now < deadline -> CooldownActive
  (299 blocks, 300 passes — controlled-clock tests); never paused
  (deadline None) or expired / cancel-paused (deadline cleared) ->
  previews immediately, no forced wait. Binds (revision, recipient,
  payload hash); does not send, does not create jobs.
- confirm-send: requires an unused preview matching CURRENT revision and
  recipient; re-checks the pause gate with the same deadline-keyed C8
  semantics (R03: edit does NOT lift the gate — only deadline expiry or
  an explicit cancel-pause does; expiry never auto-sends but a manual
  confirm after the deadline is allowed); delegates to the kind
  sender port (connection/idempotency guards live in the sender); consumes
  the preview; marks the draft sent. Failure -> truthful error, draft
  unchanged.
- cancel-pause: user-initiated back to editing, deadline cleared.
- discard: author-only; apply_user_deletion hook removes all user drafts.
"""

from __future__ import annotations

import datetime as dt
from typing import Any, Dict, Optional

from django.db import transaction

from family_bridge_core.errors import (
    CooldownActive, InputInvalid, ModuleUnavailable, NotFound, PreviewStale,
)
from family_bridge_core.idempotency import send_payload_hash
from family_bridge_core.timeutils import UTC
from family_bridge_core.validation import MAX_TEXT_CHARS

from ..models import (
    KINDS, PAUSE_SECONDS, STATUS_DISCARDED, STATUS_EDITING, STATUS_PAUSED,
    STATUS_SENT, Draft, DraftPreview,
)
from . import registry


def _require_own_draft(*, author_id: str, draft_id: str) -> Draft:
    draft = Draft.objects.filter(pk=draft_id).first()
    if draft is None or str(draft.author_id) != str(author_id):
        raise NotFound({"reason": "draft_not_found"})
    return draft


def _validate_content(*, kind: str, body: str, title: str,
                      card_id: str, card_version, recipient_id: str) -> None:
    if kind not in KINDS:
        raise InputInvalid({"field": "kind", "reason": "kind_not_allowed",
                            "allowed": list(KINDS)})
    if not isinstance(body, str) or not body.strip():
        raise InputInvalid({"field": "body", "reason": "empty"})
    if len(body) > MAX_TEXT_CHARS:
        raise InputInvalid({"field": "body", "reason": "too_long",
                            "max": MAX_TEXT_CHARS})
    if len(title or "") > 200:
        raise InputInvalid({"field": "title", "reason": "too_long", "max": 200})
    if kind == "emotion_card":
        if not card_id:
            raise InputInvalid({"field": "card_id", "reason": "required_for_card"})
        if not isinstance(card_version, int) or card_version < 1:
            raise InputInvalid({"field": "card_version", "reason": "required_for_card"})
    if recipient_id and len(recipient_id) > 64:
        raise InputInvalid({"field": "recipient_id", "reason": "too_long"})


def _deadline_guard(draft: Draft, now: dt.datetime) -> None:
    """C8 pause contract (server clock only, DEC-03) + R03 fence.

    The 300s cooldown is an OPT-IN gate that runs until the recorded
    deadline passes. It is keyed on the FUTURE DEADLINE — not on the
    paused STATUS — because `edit` flips status back to editing while
    intentionally KEEPING the deadline; keying on status would let the
    author bypass the cooldown via edit -> preview -> confirm (QA R03:
    pause còn 299s vẫn gửi được). Paths that pass while now < deadline:
    NONE — preview/confirm both raise CooldownActive. Paths that lift
    the gate: deadline expiry (now >= deadline — manual confirm allowed,
    nothing auto-sends) and the EXPLICIT cancel-pause (user action that
    clears the deadline). A draft that never paused has deadline None
    and never waits ("pause_not_started" is not an error state).
    """
    if draft.pause_deadline_at is None:
        return  # no pause chosen (or explicitly cancelled) -> no cooldown
    if now < draft.pause_deadline_at:
        raise CooldownActive({
            "reason": "pause_in_progress",
            "deadline": draft.pause_deadline_at.isoformat(),
            "remaining_seconds": int(
                (draft.pause_deadline_at - now).total_seconds()),
        })


def build_service() -> "DraftService":
    """One service factory for views/tests: uses the registered clock when
    present (controlled tests), else the system clock."""
    clock = registry.get_clock()
    return DraftService(clock=clock) if clock is not None else DraftService()


class DraftService:
    def __init__(self, *, clock=None) -> None:
        self.clock = clock

    def _now(self) -> dt.datetime:
        if self.clock is not None:
            return self.clock.now()
        return dt.datetime.now(tz=UTC)

    # -- CRUD ------------------------------------------------------------------
    def create(self, *, author_id: str, kind: str, body: str, title: str = "",
               card_id: str = "", card_version: Optional[int] = None,
               recipient_id: str = "") -> Draft:
        _validate_content(kind=kind, body=body, title=title, card_id=card_id,
                          card_version=card_version, recipient_id=recipient_id)
        return Draft.objects.create(
            author_id=str(author_id), kind=kind, body=body,
            title=(title or "")[:200], card_id=card_id or "",
            card_version=card_version, recipient_id=recipient_id or "")

    def get_own(self, *, author_id: str, draft_id: str) -> Draft:
        return _require_own_draft(author_id=author_id, draft_id=draft_id)

    def list_own(self, *, author_id: str, limit: int = 20):
        return (Draft.objects.filter(author_id=str(author_id))
                .exclude(status__in=(STATUS_DISCARDED, STATUS_SENT))
                .order_by("-updated_at", "-id")[: max(1, min(limit, 20))])

    @transaction.atomic
    def edit(self, *, author_id: str, draft_id: str, body: str,
             title: str = "", card_id: str = "",
             card_version: Optional[int] = None,
             recipient_id: str = "") -> Draft:
        draft = _require_own_draft(author_id=author_id, draft_id=draft_id)
        if draft.status in (STATUS_SENT, STATUS_DISCARDED):
            raise InputInvalid({"reason": "draft_not_editable"})
        _validate_content(kind=draft.kind, body=body, title=title,
                          card_id=card_id, card_version=card_version,
                          recipient_id=recipient_id)
        draft.body = body
        draft.title = (title or "")[:200]
        draft.card_id = card_id or ""
        draft.card_version = card_version
        draft.recipient_id = recipient_id or ""
        draft.revision += 1            # invalidates every existing preview
        draft.status = STATUS_EDITING  # deadline intentionally NOT cleared:
        draft.updated_at = self._now()  # editing never resets cooldown
        draft.save()
        return draft

    @transaction.atomic
    def discard(self, *, author_id: str, draft_id: str) -> Draft:
        draft = _require_own_draft(author_id=author_id, draft_id=draft_id)
        draft.status = STATUS_DISCARDED
        draft.updated_at = self._now()
        draft.save(update_fields=["status", "updated_at"])
        return draft

    # -- pause -----------------------------------------------------------------
    @transaction.atomic
    def start_pause(self, *, author_id: str, draft_id: str) -> Draft:
        draft = _require_own_draft(author_id=author_id, draft_id=draft_id)
        if draft.status in (STATUS_SENT, STATUS_DISCARDED):
            raise InputInvalid({"reason": "draft_not_editable"})
        now = self._now()
        if (draft.status == STATUS_PAUSED
                and draft.pause_deadline_at is not None):
            # No reset, no extension — the ORIGINAL deadline stands.
            return draft
        draft.status = STATUS_PAUSED
        draft.pause_started_at = now
        draft.pause_deadline_at = now + dt.timedelta(seconds=PAUSE_SECONDS)
        draft.updated_at = now
        draft.save()
        return draft

    @transaction.atomic
    def cancel_pause(self, *, author_id: str, draft_id: str) -> Draft:
        draft = _require_own_draft(author_id=author_id, draft_id=draft_id)
        draft.status = STATUS_EDITING
        draft.pause_started_at = None
        draft.pause_deadline_at = None
        draft.updated_at = self._now()
        draft.save()
        return draft

    # -- preview / confirm -------------------------------------------------------
    @transaction.atomic
    def make_preview(self, *, author_id: str, draft_id: str) -> Dict[str, Any]:
        draft = _require_own_draft(author_id=author_id, draft_id=draft_id)
        now = self._now()
        _deadline_guard(draft, now)
        payload_hash = send_payload_hash(
            kind=draft.kind, recipient_id=draft.recipient_id, body=draft.body,
            reply_to=None, context_revision=None)
        # Previous previews for the same revision/recipient are superseded.
        DraftPreview.objects.filter(draft=draft, used=False).update(used=True)
        preview = DraftPreview.objects.create(
            draft=draft, revision=draft.revision,
            recipient_id=draft.recipient_id, payload_hash_hex=payload_hash)
        # Shape stability: "deadline" mirrors the paused-state only (None
        # when no pause is active — same parity as the shared mock adapter).
        return {"preview_id": str(preview.id), "revision": draft.revision,
                "recipient_id": draft.recipient_id,
                "deadline": (draft.pause_deadline_at.isoformat()
                             if draft.pause_deadline_at else None),
                "server_time": now.isoformat()}

    @transaction.atomic
    def confirm_send(self, *, author_id: str, draft_id: str,
                     preview_id: str) -> Dict[str, Any]:
        draft = _require_own_draft(author_id=author_id, draft_id=draft_id)
        now = self._now()
        if draft.status == STATUS_SENT or draft.sent_message_id:
            raise InputInvalid({"reason": "draft_already_sent"})
        preview = DraftPreview.objects.select_for_update().filter(
            pk=preview_id, draft=draft).first()
        if preview is None:
            raise NotFound({"reason": "preview_not_found"})
        if preview.used:
            raise PreviewStale({"reason": "preview_already_used"})
        if preview.revision != draft.revision:
            raise PreviewStale({"reason": "draft_changed_after_preview"})
        if preview.recipient_id != draft.recipient_id:
            raise PreviewStale({"reason": "recipient_changed_after_preview"})
        # Pause gate last before the send: time check on the server clock.
        _deadline_guard(draft, now)
        if not draft.recipient_id:
            raise InputInvalid({"field": "recipient_id", "reason": "required"})

        sender = registry.get_sender(kind=draft.kind)
        if sender is None:
            raise ModuleUnavailable({"reason": "sender_not_wired",
                                     "kind": draft.kind})
        result = sender(author_id=str(draft.author_id), draft=draft)
        message_id = str(result.get("message_id", "")) if isinstance(
            result, dict) else str(result)
        preview.used = True
        preview.save(update_fields=["used"])
        draft.status = STATUS_SENT
        draft.sent_message_id = message_id
        draft.updated_at = now
        draft.save()
        return {"message_id": message_id, "draft_id": str(draft.id),
                "status": "sent"}

    # -- deletion hook (F15/WF-21 wiring at B18) ------------------------------
    @staticmethod
    def apply_user_deletion(*, user_id: str) -> Dict[str, Any]:
        previews, _ = (DraftPreview.objects
                       .filter(draft__author_id=str(user_id)).delete())
        drafts, _ = (Draft.objects.filter(author_id=str(user_id)).delete())
        return {"domain": "f06_drafts", "drafts_deleted": drafts,
                "previews_deleted": previews}
