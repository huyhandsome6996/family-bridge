"""F15 deletion hook for category "ai" (WF-21/SEC-21, frozen contract C9).

Scope: the AUTHOR'S OWN AiSuggestion rows plus the author's AiRefineOperation
claims (R1A2-01 marker) created BEFORE the persisted request cutoff. Rows
created AFTER the cutoff are NOT in scope — the F15 invariant "retry/replay
never widens the deletion" holds (same contract as the production F15 hooks
in f15_privacy.services.deletion_hooks). The operation rows hold no sentence
content, but leaving a COMPLETED claim behind would make any later retry of
the same key hit the "completed claim without suggestion" 409 instead of the
documented post-deletion behavior (fresh generation, never resurrection).
Idempotent: re-running with the SAME cutoff deletes 0 rows and still reports
ok.
- No restore path: deletion is physical for this category; a pending
  idempotent replay afterwards finds no row and must generate a NEW
  suggestion (never resurrect the deleted one) — covered by tests.
- Outcome dict follows the F15 DeletionHook protocol: {"ok": bool,
  "deleted": int, "detail": str}. "ok" verifies the postcondition honestly
  (MoodDeletionHook idiom): a zero-scope run stays ok, a failed erase
  reports ok=False instead of a blind success.
- Cutoff handling mirrors the F15 production hooks exactly: requested_at is
  a datetime or an ISO-8601 string; anything else (including None/missing)
  raises ValueError — the F15 runner turns that into a truthful failed
  category, never a silently widened deletion.
"""

from __future__ import annotations

import datetime as dt
from typing import Any, Dict

from ..models import AiRefineOperation, AiSuggestion


def _parse_cutoff(requested_at) -> dt.datetime:
    """Same idiom as the F15 production deletion hooks: a datetime passes
    through unchanged, everything else is parsed from ``str()`` as ISO-8601;
    invalid input raises ValueError (fail-loud — never fail-widened)."""
    if isinstance(requested_at, dt.datetime):
        return requested_at
    return dt.datetime.fromisoformat(str(requested_at))


class AiSuggestionDeletionHook:
    domain = "f04_ai"
    category = "ai"

    def apply_user_deletion(self, *, user_id: str,
                            requested_at=None) -> Dict[str, Any]:
        """Delete the author's AiSuggestion + AiRefineOperation rows created
        BEFORE ``requested_at`` (the persisted F15 request cutoff).

        Rows created after the cutoff are NOT in scope: a retry/replay of
        the same request can never widen the deletion. A missing or invalid
        cutoff raises ValueError (F15 hook convention — the runner reports
        a truthful failed category instead of guessing a scope).
        """
        cutoff = _parse_cutoff(requested_at)
        suggestions_qs = AiSuggestion.objects.filter(
            author_id=str(user_id), created_at__lte=cutoff)
        expected_suggestions = suggestions_qs.count()
        deleted_suggestions, _ = suggestions_qs.delete()
        leftover_suggestions = AiSuggestion.objects.filter(
            author_id=str(user_id), created_at__lte=cutoff).exists()
        # Claim markers are cleared with the data they refer to: after
        # deletion the author's keys must be claimable again (fresh
        # generation), never stuck on a completed-but-gone outcome.
        operations_qs = AiRefineOperation.objects.filter(
            author_id=str(user_id), created_at__lte=cutoff)
        expected_operations = operations_qs.count()
        deleted_operations, _ = operations_qs.delete()
        leftover_operations = AiRefineOperation.objects.filter(
            author_id=str(user_id), created_at__lte=cutoff).exists()
        ok = ((expected_suggestions == 0 or
               (deleted_suggestions > 0 and not leftover_suggestions))
              and (expected_operations == 0 or
                   (deleted_operations > 0 and not leftover_operations)))
        return {"ok": ok,
                "deleted": deleted_suggestions + deleted_operations,
                "detail": f"f04_ai_suggestions_deleted: suggestions "
                          f"{deleted_suggestions}/{expected_suggestions}, "
                          f"refine_operations "
                          f"{deleted_operations}/{expected_operations}"}
