"""F15 deletion hook for category "ai" (WF-21/SEC-21, frozen contract C9).

Scope: the AUTHOR'S OWN AiSuggestion rows plus the author's AiRefineOperation
claims (R1A2-01 marker). The operation rows hold no sentence content, but
leaving a COMPLETED claim behind would make any later retry of the same key
hit the "completed claim without suggestion" 409 instead of the documented
post-deletion behavior (fresh generation, never resurrection). Idempotent:
re-running deletes 0 rows and still reports ok.
- No restore path: deletion is physical for this category; a pending
  idempotent replay afterwards finds no row and must generate a NEW
  suggestion (never resurrect the deleted one) — covered by tests.
- Outcome dict follows the F15 DeletionHook protocol: {"ok": bool,
  "deleted": int, "detail": str}.
"""

from __future__ import annotations

from typing import Any, Dict

from ..models import AiRefineOperation, AiSuggestion


class AiSuggestionDeletionHook:
    domain = "f04_ai"
    category = "ai"

    def apply_user_deletion(self, *, user_id: str,
                            requested_at=None) -> Dict[str, Any]:
        deleted, _ = AiSuggestion.objects.filter(
            author_id=str(user_id)).delete()
        # Claim markers are cleared with the data they refer to: after
        # deletion the author's keys must be claimable again (fresh
        # generation), never stuck on a completed-but-gone outcome.
        deleted += AiRefineOperation.objects.filter(
            author_id=str(user_id)).delete()[0]
        return {"ok": True, "deleted": deleted,
                "detail": "f04_ai_suggestions_deleted"}
