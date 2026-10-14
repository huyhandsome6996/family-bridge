"""F07 services: entry CRUD + per-entry share grants + recipient reads.

Port wiring (same pattern as sibling features):
- ConnectionReader (owner F01): share creation requires an ACTIVE
  connection at the CURRENT generation; recipient reads re-check it —
  unlink/revocation takes effect on the very next read (no cache).
- Session resolver: labgrants double standalone; F01 at integration.

The grant model intentionally mirrors the F15 GrantView shape so B18 can
register MoodShareService as the mood grant provider on the F15 policy
registry (item_type="mood_entry") without adaptation."""

from __future__ import annotations

import datetime as dt
from typing import Any, Dict, List, Optional

from django.db import transaction
from django.utils import timezone

from family_bridge_core.errors import (
    InputInvalid, ModuleUnavailable, NotFound, NotAuthorized,
)
from family_bridge_core.timeutils import UTC
from family_bridge_core.validation import MAX_PAGE_SIZE

from ..models import (
    EMOTIONS, MAX_DATE_DAYS_AHEAD, MAX_NOTE_CHARS, MIN_DATE_DAYS_AGO,
    EMOTION_LABELS, MoodEntry, MoodShare,
)
from . import registry

VN_TZ = dt.timezone(dt.timedelta(hours=7), name="Asia/Ho_Chi_Minh")


def _now() -> dt.datetime:
    return dt.datetime.now(tz=UTC)


def parse_entry_date(value: Any) -> dt.date:
    if isinstance(value, dt.date) and not isinstance(value, dt.datetime):
        return value
    if not isinstance(value, str):
        raise InputInvalid({"field": "entry_date", "reason": "must_be_iso_date"})
    try:
        parsed = dt.date.fromisoformat(value[:10])
    except ValueError as exc:
        raise InputInvalid({"field": "entry_date",
                            "reason": "must_be_iso_date"}) from exc
    today_vn = _now().astimezone(VN_TZ).date()
    if parsed > today_vn + dt.timedelta(days=MAX_DATE_DAYS_AHEAD):
        raise InputInvalid({"field": "entry_date", "reason": "date_in_future"})
    if parsed < today_vn - dt.timedelta(days=MIN_DATE_DAYS_AGO):
        raise InputInvalid({"field": "entry_date", "reason": "date_too_old",
                            "max_days": MIN_DATE_DAYS_AGO})
    return parsed


def _require_own_entry(*, owner_id: str, entry_id: str) -> MoodEntry:
    entry = MoodEntry.objects.filter(pk=entry_id).first()
    if entry is None or str(entry.owner_id) != str(owner_id):
        raise NotFound({"reason": "entry_not_found"})
    return entry


class MoodEntryService:
    @transaction.atomic
    def create(self, *, owner_id: str, entry_date, emotion: str,
               note: str = "") -> MoodEntry:
        today_vn = _now().astimezone(VN_TZ).date()
        if entry_date in (None, ""):
            date = today_vn  # server-decided VN day when client omits it
        else:
            date = parse_entry_date(entry_date)
        if emotion not in EMOTIONS:
            raise InputInvalid({"field": "emotion", "reason": "invalid_emotion",
                                "allowed": list(EMOTIONS)})
        if not isinstance(note, str) or len(note) > MAX_NOTE_CHARS:
            raise InputInvalid({"field": "note", "reason": "too_long",
                                "max": MAX_NOTE_CHARS})
        if MoodEntry.objects.filter(owner_id=str(owner_id),
                                    entry_date=date).exists():
            raise InputInvalid({"field": "entry_date",
                                "reason": "entry_already_exists_use_edit",
                                "entry_date": date.isoformat()})
        return MoodEntry.objects.create(owner_id=str(owner_id),
                                        entry_date=date, emotion=emotion,
                                        note=note)

    def get_own(self, *, owner_id: str, entry_id: str) -> MoodEntry:
        return _require_own_entry(owner_id=owner_id, entry_id=entry_id)

    def list_own(self, *, owner_id: str, cursor: Optional[str],
                 page_size: int):
        from family_bridge_core.drf import cursor_paginate
        qs = MoodEntry.objects.filter(owner_id=str(owner_id))
        return cursor_paginate(qs, cursor=cursor, page_size=page_size,
                               timestamp_field="entry_date")

    @transaction.atomic
    def edit(self, *, owner_id: str, entry_id: str, emotion: Optional[str],
             note: Optional[str]) -> MoodEntry:
        entry = _require_own_entry(owner_id=owner_id, entry_id=entry_id)
        if emotion is not None:
            if emotion not in EMOTIONS:
                raise InputInvalid({"field": "emotion",
                                    "reason": "invalid_emotion",
                                    "allowed": list(EMOTIONS)})
            entry.emotion = emotion
        if note is not None:
            if not isinstance(note, str) or len(note) > MAX_NOTE_CHARS:
                raise InputInvalid({"field": "note", "reason": "too_long",
                                    "max": MAX_NOTE_CHARS})
            entry.note = note
        entry.revision += 1  # new revision is NOT shared until re-share
        entry.updated_at = _now()
        entry.save()
        return entry

    def summary(self, *, owner_id: str, days: int = 90) -> List[Dict[str, Any]]:
        """Personal DESCRIPTIVE counts only: no score, no ranking, no
        comparison; bounded window; owner-only."""
        window_end = _now().astimezone(VN_TZ).date()
        window_start = window_end - dt.timedelta(
            days=max(1, min(days, 365)))
        counts = {code: 0 for code in EMOTIONS}
        qs = (MoodEntry.objects.filter(owner_id=str(owner_id),
                                       entry_date__gte=window_start,
                                       entry_date__lte=window_end)
              .values_list("emotion", flat=True))
        for emotion in qs:
            if emotion in counts:
                counts[emotion] += 1
        return [{"emotion": code, "label": EMOTION_LABELS[code],
                 "count": counts[code]}
                for code in EMOTIONS if counts[code] > 0]


class MoodShareService:
    def share(self, *, owner_id: str, entry_id: str,
              recipient_id: str) -> MoodShare:
        entry = _require_own_entry(owner_id=owner_id, entry_id=entry_id)
        if str(recipient_id) == str(owner_id):
            raise InputInvalid({"field": "recipient_id",
                                "reason": "cannot_share_to_self"})
        reader = registry.get_connection_reader()
        if reader is None:
            raise ModuleUnavailable({"reason": "connection_reader_not_wired"})
        connection = reader.active_connection_between(
            user_a=str(owner_id), user_b=str(recipient_id))
        if connection is None:
            raise NotFound({"reason": "no_active_connection"})
        share, created = MoodShare.objects.get_or_create(
            entry=entry, recipient_id=str(recipient_id),
            approved_revision=entry.revision,
            defaults={"owner_id": str(owner_id),
                      "connection_id": str(connection.connection_id),
                      "connection_generation": connection.generation})
        if not created and share.revoked_at is not None:
            # A revoked grant is TERMINAL for this (entry, recipient, revision)
            # (FL-05): re-sharing the same revision would silently revive it.
            # The owner edits the entry (new revision) and shares that.
            raise InputInvalid({"reason": "reshare_after_revoke_requires_edit"})
        return share

    def revoke(self, *, owner_id: str, share_id: str) -> MoodShare:
        share = MoodShare.objects.filter(pk=share_id).first()
        if share is None or str(share.owner_id) != str(owner_id):
            raise NotFound({"reason": "share_not_found"})
        if share.revoked_at is None:
            share.revoked_at = _now()
            share.save(update_fields=["revoked_at"])
            # R10 fix: EVERY revoke entry point is durable — the domain path
            # appends the same ``grant_revoked`` ledger event as the F15 API
            # so a backup restore replays it. ImportError-guarded: standalone
            # runs without f15_privacy keep working (coupling documented).
            try:
                from family_bridge_features.f15_privacy.models import (
                    DeletionLedgerEvent,
                )

                DeletionLedgerEvent.objects.create(
                    target_user_id=str(owner_id), actor_ref=str(owner_id),
                    event_type=DeletionLedgerEvent.EVENT_GRANT_REVOKED,
                    payload={"item_type": "mood_entry",
                             "item_id": str(share.entry_id),
                             "recipient_id": str(share.recipient_id),
                             "entry_point": "f07_domain_service"})
            except ImportError:
                pass
        return share

    def list_shared_by_me(self, *, owner_id: str, entry_id: str):
        return MoodShare.objects.filter(
            owner_id=str(owner_id), entry_id=entry_id,
            revoked_at__isnull=True).select_related("entry")

    def list_shared_with_me(self, *, recipient_id: str):
        """Active grants for the recipient whose revision is STILL current
        (edited entries disappear until re-shared) AND whose recorded
        connection is still the ACTIVE connection at the SAME generation
        (a reconnect never revives stale bindings — F15/WF-04).

        R09 fix: the (connection_id, generation) binding filter runs in SQL
        BEFORE any bound, so stale rows on old connections can no longer
        push valid grants past the list bound. The Python re-check below
        remains as the authoritative second line of defense."""
        from django.db.models import F, Q

        rows = (MoodShare.objects
                .filter(recipient_id=str(recipient_id),
                        revoked_at__isnull=True,
                        approved_revision=models_f7_entry_revision())
                .select_related("entry", "owner")
                .order_by("-created_at", "-id"))
        reader = registry.get_connection_reader()
        if reader is None:
            return []  # fail-closed: cannot verify connection state
        active = {}
        bindings = []
        result = reader.list_active_for_user(user_id=str(recipient_id))
        connections = result[0] if isinstance(result, tuple) else result
        for connection in connections:
            other = connection.party_b if connection.party_a == str(recipient_id) \
                else connection.party_a
            active[str(other)] = connection
            bindings.append(Q(connection_id=str(connection.connection_id),
                              connection_generation=int(connection.generation)))
        if bindings:
            pair_q = bindings[0]
            for q in bindings[1:]:
                pair_q |= q
            rows = rows.filter(pair_q)
        bounded = list(rows[:_LIST_BINDING_BOUND])
        return [row for row in bounded
                if _binding_current(row, owner_id=str(row.owner_id),
                                    recipient_id=str(recipient_id),
                                    active=active)]

    def read_shared(self, *, recipient_id: str, share_id: str) -> Dict[str, Any]:
        """Recipient read path — re-checks EVERYTHING at read time:
        grant unrevoked + revision still current + connection ACTIVE at the
        CURRENT generation AND the grant's recorded connection binding is
        still the live one. Any drift -> 404 (fail closed, no cache)."""
        share = MoodShare.objects.select_related("entry").filter(
            pk=share_id).first()
        if share is None or str(share.recipient_id) != str(recipient_id):
            raise NotFound({"reason": "share_not_found"})
        if share.revoked_at is not None:
            raise NotFound({"reason": "share_not_found"})
        if share.approved_revision != share.entry.revision:
            raise NotFound({"reason": "entry_edited_not_reshared"})
        reader = registry.get_connection_reader()
        if reader is None:
            raise NotFound({"reason": "share_not_found"})
        connection = reader.active_connection_between(
            user_a=str(share.owner_id), user_b=str(recipient_id))
        if connection is None:
            raise NotFound({"reason": "share_not_found"})
        if (str(getattr(connection, "connection_id", ""))
                != str(share.connection_id)
                or int(getattr(connection, "generation", -1))
                != int(share.connection_generation)):
            raise NotFound({"reason": "share_not_found"})
        return {
            "share_id": str(share.id),
            "entry": share.entry.view(),
            "owner_id": str(share.owner_id),
            "shared_at": share.created_at.isoformat(),
        }


def models_f7_entry_revision():
    """F(...) helper keeping the queryset import local for readability."""
    from django.db.models import F
    return F("entry__revision")


_LIST_BINDING_BOUND = 200  # DSA bound before the binding filter


def _binding_current(share, *, owner_id: str, recipient_id: str,
                     active: dict) -> bool:
    """True when the grant's recorded connection is STILL the active
    connection between the pair at the SAME generation."""
    connection = active.get(str(owner_id))
    if connection is None:
        return False
    return (str(getattr(connection, "connection_id", ""))
            == str(share.connection_id)
            and int(getattr(connection, "generation", -1))
            == int(share.connection_generation))
