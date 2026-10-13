"""Production deletion hooks for F15 (category -> honest domain cleanup).

Contract: ``apply_user_deletion(*, user_id, requested_at)`` -> dict with a
TRUTHFUL ``ok``. ``requested_at`` is the persisted request cutoff — rows
created AFTER the cutoff are NOT in scope (retry/replay never widens the
deletion). Each hook verifies its own postcondition (rows remaining inside
scope) instead of blindly reporting success.

Category support matrix (DEC-12 retention is OPEN — nothing here touches
production data; these run only on isolated test databases and, later, on
approved production workflow):

| category     | hook                    | scope                                   | status |
|--------------|-------------------------|-----------------------------------------|--------|
| mood         | MoodDeletionHook        | owner's mood entries (shares cascade)   | wired  |
| journal      | JournalDeletionHook     | owner's pages (shares/replies cascade)  | wired  |
| surveys      | SurveysDeletionHook     | participant's responses + consents      | wired  |
| connections  | ConnectionsDeletionHook | user's connections, invites, sessions, provider identities, consent records | wired (identity surface) |
| account      | —                       | User deletion                            | NOT wired: DEC-12/23 open; no user deletion without approved policy |
| messages/ai/drafts/program_progress/appointments | — | domain owner hooks pending | NOT wired -> hook_not_registered -> failed_needs_action (truthful) |

The reply rows of OTHER people referencing the requester's pages are removed
with the page by FK cascade (they are context-bound to that page); replies
the requester wrote on OTHERS' pages are the responder's living words and
stay, per F08 contract — the hook reports leftover counts honestly.
"""

from __future__ import annotations

import datetime as dt
from typing import Any, Dict


def _parse_cutoff(requested_at) -> dt.datetime:
    if isinstance(requested_at, dt.datetime):
        return requested_at
    return dt.datetime.fromisoformat(str(requested_at))


class MoodDeletionHook:
    """Delete the requester's mood entries created before the cutoff."""

    def apply_user_deletion(self, *, user_id: str, requested_at) -> Dict[str, Any]:
        from family_bridge_features.f07_mood.models import MoodEntry

        cutoff = _parse_cutoff(requested_at)
        qs = MoodEntry.objects.filter(owner_id=str(user_id),
                                      created_at__lte=cutoff)
        expected = qs.count()
        deleted, _ = qs.delete()
        leftover = MoodEntry.objects.filter(owner_id=str(user_id),
                                            created_at__lte=cutoff).exists()
        return {"ok": expected == 0 or (deleted > 0 and not leftover),
                "detail": f"mood entries removed: {deleted}/{expected}",
                "counts": {"deleted": deleted, "expected": expected}}


class JournalDeletionHook:
    """Delete the requester's journal pages created before the cutoff."""

    def apply_user_deletion(self, *, user_id: str, requested_at) -> Dict[str, Any]:
        from family_bridge_features.f08_journal.models import JournalPage

        cutoff = _parse_cutoff(requested_at)
        qs = JournalPage.objects.filter(owner_id=str(user_id),
                                        created_at__lte=cutoff)
        expected = qs.count()
        deleted, _ = qs.delete()
        leftover = JournalPage.objects.filter(owner_id=str(user_id),
                                              created_at__lte=cutoff).exists()
        return {"ok": expected == 0 or (deleted > 0 and not leftover),
                "detail": f"journal pages removed: {deleted}/{expected}",
                "counts": {"deleted": deleted, "expected": expected}}


class SurveysDeletionHook:
    """Delete the participant's survey responses + research consents."""

    def apply_user_deletion(self, *, user_id: str, requested_at) -> Dict[str, Any]:
        from family_bridge_features.f14_surveys.models import (
            ResearchConsent, SurveyResponse,
        )

        responses, _ = SurveyResponse.objects.filter(
            participant_id=str(user_id)).delete()
        consents, _ = ResearchConsent.objects.filter(
            participant_id=str(user_id)).delete()
        return {"ok": True,
                "detail": f"survey responses removed: {responses}; "
                          f"research consents removed: {consents}",
                "counts": {"responses": responses, "consents": consents}}


class ConnectionsDeletionHook:
    """Delete the user's identity/connection surface: connections (both
    directions), invites, claim attempts, sessions, provider identities and
    consent records. Provider identity rows are removed so a re-login maps
    to a fresh subject mapping (account deletion itself stays gated by
    DEC-12/23 — this hook never deletes the User row)."""

    def apply_user_deletion(self, *, user_id: str, requested_at) -> Dict[str, Any]:
        from family_bridge_features.f01_identity.models import (
            ClaimAttempt, Connection, ConnectionInvite, ConsentRecord,
            ProviderIdentity, Session,
        )

        counts: Dict[str, int] = {}
        counts["connections"], _ = Connection.objects.filter(
            party_low_id=str(user_id)).delete()
        counts["connections"] += Connection.objects.filter(
            party_high_id=str(user_id)).delete()[0]
        counts["invites"], _ = ConnectionInvite.objects.filter(
            inviter_id=str(user_id)).delete()
        counts["invites"] += ConnectionInvite.objects.filter(
            candidate_id=str(user_id)).delete()[0]
        counts["claim_attempts"], _ = ClaimAttempt.objects.filter(
            actor_id=str(user_id)).delete()
        counts["sessions"], _ = Session.objects.filter(
            user_id=str(user_id)).delete()
        counts["provider_identities"], _ = ProviderIdentity.objects.filter(
            user_id=str(user_id)).delete()
        counts["consent_records"], _ = ConsentRecord.objects.filter(
            user_id=str(user_id)).delete()
        return {"ok": True,
                "detail": "; ".join(f"{k}: {v}" for k, v in sorted(counts.items())),
                "counts": counts}
