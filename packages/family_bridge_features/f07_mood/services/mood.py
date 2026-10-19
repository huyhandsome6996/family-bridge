"""F07 services: entry CRUD + per-entry share grants + recipient reads.

Port wiring (same pattern as sibling features):
- ConnectionReader (owner F01): share creation requires an ACTIVE
  connection at the CURRENT generation; recipient reads re-check it —
  unlink/revocation takes effect on the very next read (no cache).
- Session resolver: labgrants double standalone; F01 at integration.

The grant model intentionally mirrors the F15 GrantView shape so the
mood grant provider (services/grant_provider.py) registers as the
item_type="mood_entry" provider on the F15 policy registry without
adaptation.

Authorization invariants (fail closed everywhere):
- Every recipient read re-verifies: grant unrevoked + revision still
  current + connection STILL ACTIVE with the SAME identity and generation
  recorded at share time. Missing/erroring provider denies the read.
- Re-share after revoke/edit/reconnect is an explicit new confirmation:
  it re-validates the connection NOW and rebinds the grant to the CURRENT
  connection; revoked grants never revive on their own.
"""

from __future__ import annotations

import datetime as dt
import re
from typing import Any, Dict, List, Optional, Tuple

from django.db import transaction
from django.db.utils import IntegrityError

from family_bridge_core.errors import (
    InputInvalid, ModuleUnavailable, NotFound, PreviewStale,
)
from family_bridge_core.timeutils import UTC

from ..models import (
    EMOTIONS, MAX_DATE_DAYS_AHEAD, MAX_NOTE_CHARS, MIN_DATE_DAYS_AGO,
    EMOTION_LABELS, MoodEntry, MoodShare,
)
from . import registry

VN_TZ = dt.timezone(dt.timedelta(hours=7), name="Asia/Ho_Chi_Minh")

MAX_OWNED_SHARE_ROWS = 50  # bounded per-entry grant listing (DSA-05)


def _now() -> dt.datetime:
    return dt.datetime.now(tz=UTC)


# R05 fix: the API publishes "YYYY-MM-DD" — the WHOLE string must match.
# No silent truncation (the old value[:10] turned "2026-10-19-not-a-date"
# and timestamps into a valid day). A separate date/datetime object is
# still accepted (internal callers), but any JSON string must be exact.
_ISO_DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")


def parse_entry_date(value: Any) -> dt.date:
    if isinstance(value, dt.date) and not isinstance(value, dt.datetime):
        return value
    if not isinstance(value, str):
        raise InputInvalid({"field": "entry_date", "reason": "must_be_iso_date"})
    if not _ISO_DATE_RE.fullmatch(value):
        raise InputInvalid({"field": "entry_date",
                            "reason": "must_be_iso_date"})
    try:
        parsed = dt.date.fromisoformat(value)
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


def _require_reader():
    """Authorization dependency: a MISSING connection reader is a hard
    failure for any sharing decision (fail closed, never read-through)."""
    reader = registry.get_connection_reader()
    if reader is None:
        raise ModuleUnavailable({"reason": "connection_reader_not_wired"})
    return reader


class MoodEntryService:
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
        try:
            with transaction.atomic():
                return MoodEntry.objects.create(owner_id=str(owner_id),
                                                entry_date=date,
                                                emotion=emotion, note=note)
        except IntegrityError as exc:
            # Lost a real concurrent-create race (two devices, same day):
            # the UNIQUE constraint is the authority, the loser gets the
            # same business recovery path as the sequential duplicate.
            raise InputInvalid({
                "field": "entry_date",
                "reason": "entry_already_exists_use_edit",
                "entry_date": date.isoformat(),
            }) from exc

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
        # R02 fix: two concurrent edits must never reuse one revision.
        # _require_own_entry stays the (patchable) ownership gate; the row
        # is then re-read UNDER LOCK inside this transaction so the
        # read-modify-write of `revision` serializes on MySQL (InnoDB
        # SELECT ... FOR UPDATE). Both edit and share lock the SAME single
        # row first -> consistent lock order, no deadlock, no network
        # calls while the lock is held.
        entry = _require_own_entry(owner_id=owner_id, entry_id=entry_id)
        entry = MoodEntry.objects.select_for_update().get(pk=entry.pk)
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
    def share(self, *, owner_id: str, entry_id: str, recipient_id: str,
              expected_revision: Optional[int] = None) -> MoodShare:
        """Share EXACTLY this entry with ONE currently-connected recipient.

        expected_revision pins the version the owner previewed/confirmed;
        a mismatch is a 409 stale error — the current revision is NEVER
        shared silently when the owner confirmed an older one.
        Re-share after revoke/reconnect is an explicit new confirmation:
        the connection is re-validated NOW and the grant rebinds to the
        current connection identity/generation (revoked grants never
        revive without this explicit call)."""
        # Existence/ownership fail first (patchable gate, 404 semantics),
        # but the REVISION the grant pins must be decided under the row
        # lock — otherwise a concurrent edit could commit a new revision
        # between the check and the grant write (R02: unapproved content
        # became readable under a reused revision).
        entry = _require_own_entry(owner_id=owner_id, entry_id=entry_id)
        if str(recipient_id) == str(owner_id):
            raise InputInvalid({"field": "recipient_id",
                                "reason": "cannot_share_to_self"})
        if expected_revision is not None and (
                isinstance(expected_revision, bool) or not isinstance(
                    expected_revision, int) or expected_revision < 1):
            raise InputInvalid({"field": "expected_revision",
                                "reason": "must_be_positive_int"})
        reader = _require_reader()
        try:
            with transaction.atomic():
                locked = MoodEntry.objects.select_for_update().get(pk=entry.pk)
                if expected_revision is not None and (
                        expected_revision != locked.revision):
                    raise PreviewStale({
                        "reason": "stale_revision",
                        "field": "expected_revision",
                        "expected_revision": expected_revision,
                        "current_revision": locked.revision,
                    })
                connection = reader.active_connection_between(
                    user_a=str(owner_id), user_b=str(recipient_id))
                if connection is None:
                    raise NotFound({"reason": "no_active_connection"})
                current_conn_id = str(getattr(connection, "connection_id", ""))
                current_generation = int(getattr(connection, "generation", 0) or 0)
                share, created = MoodShare.objects.get_or_create(
                    entry=locked, recipient_id=str(recipient_id),
                    approved_revision=locked.revision,
                    defaults={"owner_id": str(owner_id),
                              "connection_id": current_conn_id,
                              "connection_generation": current_generation})
                if not created:
                    # Explicit re-share of an existing (entry, recipient,
                    # revision) grant: reactivate a revoked row ONLY here
                    # (owner action), and always rebind to the CURRENT
                    # connection identity/generation.
                    share.revoked_at = None
                    share.connection_id = current_conn_id
                    share.connection_generation = current_generation
                    share.save(update_fields=["revoked_at", "connection_id",
                                              "connection_generation"])
        except IntegrityError as exc:
            raise InputInvalid({
                "reason": "share_conflict_retry",
            }) from exc
        return share

    def revoke(self, *, owner_id: str, share_id: str) -> MoodShare:
        share = MoodShare.objects.filter(pk=share_id).first()
        if share is None or str(share.owner_id) != str(owner_id):
            raise NotFound({"reason": "share_not_found"})
        if share.revoked_at is None:
            share.revoked_at = _now()
            share.save(update_fields=["revoked_at"])
        return share

    @staticmethod
    def _connections_current(reader, shares) -> Dict[str, Dict[str, bool]]:
        """For each share row, decide whether its stored connection binding
        matches the CURRENT active connection for that pair. One reader
        lookup per distinct (owner, recipient) PAIR (R03 fix: the lookup
        depends on both sides; caching by recipient_id alone reused the
        first owner's verdict for every other owner sharing with the same
        recipient and silently dropped their grants from the list).
        Bounded by the page size (<= 50 distinct pairs)."""
        verdicts: Dict[str, Dict[str, bool]] = {}
        cache: Dict[Tuple[str, str], Any] = {}
        for share in shares:
            owner_key = str(share.owner_id)
            recipient_key = str(share.recipient_id)
            pair = (owner_key, recipient_key)
            if pair not in cache:
                cache[pair] = reader.active_connection_between(
                    user_a=owner_key, user_b=recipient_key)
            connection = cache[pair]
            ok = (
                connection is not None
                and str(getattr(connection, "connection_id", ""))
                == str(share.connection_id)
                and int(getattr(connection, "generation", 0) or 0)
                == int(share.connection_generation)
            )
            verdicts.setdefault(recipient_key, {})[str(share.pk)] = ok
        return verdicts

    def list_shared_by_me(self, *, owner_id: str, entry_id: str):
        """Owner's per-entry grants with their TRUE status: active /
        stale_revision / revoked / unlinked. Stale or revoked rows are
        listed (bounded) but never labeled as still readable."""
        reader = _require_reader()
        rows = list(MoodShare.objects.filter(
            owner_id=str(owner_id), entry_id=entry_id)
            .select_related("entry").order_by("-created_at")[:MAX_OWNED_SHARE_ROWS])
        if not rows:
            return rows
        entry = rows[0].entry
        verdicts = self._connections_current(reader, rows)
        for row in rows:
            if row.revoked_at is not None:
                row.share_status = "revoked"
            elif row.approved_revision != entry.revision:
                row.share_status = "stale_revision"
            elif not verdicts.get(str(row.recipient_id), {}).get(str(row.pk)):
                row.share_status = "unlinked"
            else:
                row.share_status = "active"
        return rows

    def list_shared_with_me(self, *, recipient_id: str,
                            cursor: Optional[str] = None,
                            page_size: int = 20):
        """Active grants for the recipient that are STILL readable: revision
        current + connection still the one bound at share time. Filtered in
        the DB first (recipient/revoked/revision), connection re-checked per
        row on the bounded page; cursor pagination keeps the list bounded."""
        from family_bridge_core.drf import cursor_paginate
        from django.db.models import F
        reader = _require_reader()
        qs = (MoodShare.objects
              .filter(recipient_id=str(recipient_id),
                      revoked_at__isnull=True,
                      approved_revision=F("entry__revision"))
              .select_related("entry", "owner"))
        rows, next_cursor = cursor_paginate(qs, cursor=cursor,
                                            page_size=page_size,
                                            timestamp_field="created_at")
        if rows:
            verdicts = self._connections_current(reader, rows)
            rows = [row for row in rows
                    if verdicts.get(str(row.recipient_id), {})
                              .get(str(row.pk))]
        return rows, next_cursor

    def read_shared(self, *, recipient_id: str, share_id: str) -> Dict[str, Any]:
        """Recipient read path — re-checks EVERYTHING at read time, fail
        closed on any drift or missing dependency:
        grant unrevoked + revision still current + connection ACTIVE with
        the SAME identity AND generation bound at share time."""
        share = MoodShare.objects.select_related("entry").filter(
            pk=share_id).first()
        if share is None or str(share.recipient_id) != str(recipient_id):
            raise NotFound({"reason": "share_not_found"})
        if share.revoked_at is not None:
            raise NotFound({"reason": "share_not_found"})
        if share.approved_revision != share.entry.revision:
            raise NotFound({"reason": "entry_edited_not_reshared"})
        reader = _require_reader()
        connection = reader.active_connection_between(
            user_a=str(share.owner_id), user_b=str(recipient_id))
        if connection is None:
            raise NotFound({"reason": "share_not_found"})
        if (str(getattr(connection, "connection_id", ""))
                != str(share.connection_id)
                or int(getattr(connection, "generation", 0) or 0)
                != int(share.connection_generation)):
            # Old grant over a dead connection id/generation: reconnecting
            # the same two people creates a NEW connection and must NOT
            # revive grants made against the previous one.
            raise NotFound({"reason": "share_not_found"})
        return {
            "share_id": str(share.id),
            "entry": share.entry.view(),
            "owner_id": str(share.owner_id),
            "shared_at": share.created_at.isoformat(),
        }
