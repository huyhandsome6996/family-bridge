"""F07 deletion hook — category "mood", registered on the F15 deletion
machinery at app startup (apps.py).

Hook protocol (f15 services/deletion.process_request): a class/module with
apply_user_deletion(*, user_id, requested_at) returning {"ok": bool,
"detail": str}. Idempotent: running it again deletes 0 rows and still ok.

Scope (mood domain ONLY):
- MoodEntry rows OWNED by the user are deleted (their share grants cascade).
- MoodShare rows where the user was the RECIPIENT are revoked (the entries
  belong to other people — their data is untouched, the user just loses the
  read right), matching "deletion removes MY data, not other people's".
"""

from __future__ import annotations

import datetime as dt

F07_DOMAIN = "f07_mood"


def apply_user_deletion(*, user_id: str, requested_at: dt.datetime) -> dict:
    from ..models import MoodEntry, MoodShare

    entries_qs = MoodEntry.objects.filter(owner_id=str(user_id))
    entry_count = entries_qs.count()
    entries_qs.delete()  # share grants of these entries cascade with them
    grants_revoked = MoodShare.objects.filter(
        recipient_id=str(user_id), revoked_at__isnull=True).update(
        revoked_at=requested_at)
    return {"ok": True,
            "detail": (f"f07_mood: entries deleted={entry_count} "
                       f"(cascade incl. their grants), "
                       f"received grants revoked={grants_revoked}")}


class MoodDeletionHook:
    """Class form so both call shapes (class or instance) work."""
    apply_user_deletion = staticmethod(apply_user_deletion)
