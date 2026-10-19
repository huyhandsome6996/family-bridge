"""F07 deletion hook — category "mood", registered on the F15 deletion
machinery at app startup (apps.py, per-item fallback; F15 owns the slot and
force-registers its wrapper over this implementation when present, P1-1).

This module is the SINGLE domain implementation of the merged hook
(P1-2 fix, QA-1): the F15 cutoff policy + the F07 received-grants revocation
in one place, so no build can register a "mood" hook that ignores the
request cutoff anymore.

Hook protocol (f15 services/deletion.process_request): a class/module with
apply_user_deletion(*, user_id, requested_at) returning {"ok": bool,
"detail": str}. Idempotent: running it again with the SAME cutoff deletes 0
rows and still ok.

Scope (mood domain ONLY, cutoff-filtered — F15 invariant "retry/replay
never widens the deletion", same idiom as the production F15 hooks and the
f04 "ai" hook):
- MoodEntry rows OWNED by the user and created BEFORE the cutoff are deleted
  (their share grants cascade).
- MoodShare rows where the user was the RECIPIENT and created BEFORE the
  cutoff are revoked (the entries belong to other people — their data is
  untouched, the user just loses the read right), matching "deletion
  removes MY data, not other people's". Grants received AFTER the cutoff
  are out of scope: a retry/replay with the original cutoff never revokes
  them (restore replay keeps the original scope).
- requested_at is the persisted request cutoff (datetime or ISO-8601
  string); anything else — including None — raises ValueError (fail-loud;
  the F15 runner reports a truthful failed category, never a widened
  deletion).
- "ok" verifies the postcondition honestly (MoodDeletionHook idiom): a
  zero-scope run stays ok, a failed erase reports ok=False instead of a
  blind success.
"""

from __future__ import annotations

import datetime as dt
from typing import Any, Dict


def _parse_cutoff(requested_at) -> dt.datetime:
    """Same idiom as the F15 production deletion hooks: a datetime passes
    through unchanged, everything else is parsed from ``str()`` as ISO-8601;
    invalid input raises ValueError (fail-loud — never fail-widened)."""
    if isinstance(requested_at, dt.datetime):
        return requested_at
    return dt.datetime.fromisoformat(str(requested_at))


F07_DOMAIN = "f07_mood"


def apply_user_deletion(*, user_id: str, requested_at) -> dict:
    from ..models import MoodEntry, MoodShare

    cutoff = _parse_cutoff(requested_at)

    entries_qs = MoodEntry.objects.filter(owner_id=str(user_id),
                                          created_at__lte=cutoff)
    expected_entries = entries_qs.count()
    entries_qs.delete()  # share grants of these entries cascade with them
    entries_left = MoodEntry.objects.filter(
        owner_id=str(user_id), created_at__lte=cutoff).count()
    # Truthful per-domain count: the queryset delete() return value also
    # counts CASCADEd share rows, so the "entries deleted" number is derived
    # from the in-scope rows themselves, never from the cascade total.
    deleted_entries = expected_entries - entries_left

    grants_qs = MoodShare.objects.filter(
        recipient_id=str(user_id), revoked_at__isnull=True,
        created_at__lte=cutoff)
    expected_grants = grants_qs.count()
    grants_revoked = grants_qs.update(revoked_at=cutoff)
    leftover_grants = MoodShare.objects.filter(
        recipient_id=str(user_id), revoked_at__isnull=True,
        created_at__lte=cutoff).exists()

    ok = ((expected_entries == 0 or
           (deleted_entries > 0 and entries_left == 0))
          and (expected_grants == 0 or
               (grants_revoked > 0 and not leftover_grants)))
    return {"ok": ok,
            "detail": (f"f07_mood: entries deleted={deleted_entries} "
                       f"(cascade incl. their grants), "
                       f"received grants revoked={grants_revoked}"),
            "counts": {"entries": deleted_entries,
                       "received_grants_revoked": grants_revoked}}


class MoodDeletionHook:
    """Class form so both call shapes (class or instance) work."""
    apply_user_deletion = staticmethod(apply_user_deletion)
