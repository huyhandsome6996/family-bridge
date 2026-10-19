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
| mood         | MoodDeletionHook        | owner's mood entries (shares cascade) + received grants revoked, all created before the cutoff | wired (P1-2: merged with the F07 received-grants revocation) |
| journal      | JournalDeletionHook     | owner's pages (shares/replies cascade)  | wired  |
| surveys      | SurveysDeletionHook     | responses + consents created before the cutoff | wired |
| connections  | ConnectionsDeletionHook | user's connections, invites, claim attempts created before the cutoff | wired (R04: identity surface split out) |
| account      | —                       | User deletion + identity surface (sessions, provider identities, consent records) | NOT wired: DEC-12/23 open; identity reset is an ACCOUNT-policy action, not a connections action (R04) |
| messages/ai/drafts/program_progress/appointments | — | domain owner hooks pending | NOT wired -> hook_not_registered -> failed_needs_action (truthful) |

The reply rows of OTHER people referencing the requester's pages are removed
with the page by FK cascade (they are context-bound to that page); replies
the requester wrote on OTHERS' pages are the responder's living words and
stay, per F08 contract — the hook reports leftover counts honestly.

R04 fix on the connections hook: it previously ALSO deleted sessions,
provider identities and consent records regardless of the approved cutoff —
unlinking a relationship silently reset the identity surface. Removing the
identity surface is an ACCOUNT-policy decision (DEC-12/23 still OPEN), so it
is no longer part of the connections category; every table this hook touches
is now filtered by the approved cutoff.
"""

from __future__ import annotations

import datetime as dt
from typing import Any, Dict


def _parse_cutoff(requested_at) -> dt.datetime:
    if isinstance(requested_at, dt.datetime):
        return requested_at
    return dt.datetime.fromisoformat(str(requested_at))


class MoodDeletionHook:
    """F15-owned registry slot for deletion category "mood" (P1-1/P1-2).

    The DOMAIN behavior lives in ONE implementation — the F07 hook
    (``f07_mood.services.deletion.apply_user_deletion``) — which follows the
    same F15 cutoff idiom as every other production hook: entries owned by
    the requester and created BEFORE the cutoff are deleted, grants the
    requester RECEIVED (the F07 behavior part) and created before the cutoff
    are revoked, and a retry/replay with the SAME cutoff never widens the
    scope. This wrapper exists so the registered dotted path stays inside
    f15_privacy (F15 owns the slot when present in the build and force-
    registers it over any earlier standalone registration, P1-1) while the
    standalone-F07 builds register the very same implementation directly —
    one merged hook, registered exactly once per build."""

    def apply_user_deletion(self, *, user_id: str, requested_at) -> Dict[str, Any]:
        from family_bridge_features.f07_mood.services.deletion import (
            apply_user_deletion as f07_apply_user_deletion,
        )

        return f07_apply_user_deletion(user_id=str(user_id),
                                       requested_at=requested_at)


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
    """Delete the participant's survey responses + research consents created
    before the cutoff (R04: previously deleted rows regardless of the
    approved scope)."""

    def apply_user_deletion(self, *, user_id: str, requested_at) -> Dict[str, Any]:
        from family_bridge_features.f14_surveys.models import (
            ResearchConsent, SurveyResponse,
        )

        cutoff = _parse_cutoff(requested_at)
        responses_qs = SurveyResponse.objects.filter(
            participant_id=str(user_id), submitted_at__lte=cutoff)
        expected_responses = responses_qs.count()
        deleted_responses, _ = responses_qs.delete()
        leftover_responses = SurveyResponse.objects.filter(
            participant_id=str(user_id), submitted_at__lte=cutoff).exists()
        consents_qs = ResearchConsent.objects.filter(
            participant_id=str(user_id), updated_at__lte=cutoff)
        expected_consents = consents_qs.count()
        deleted_consents, _ = consents_qs.delete()
        leftover_consents = ResearchConsent.objects.filter(
            participant_id=str(user_id), updated_at__lte=cutoff).exists()
        ok = ((expected_responses == 0 or
               (deleted_responses > 0 and not leftover_responses))
              and (expected_consents == 0 or
                   (deleted_consents > 0 and not leftover_consents)))
        return {"ok": ok,
                "detail": f"survey responses removed: {deleted_responses}/"
                          f"{expected_responses}; research consents removed: "
                          f"{deleted_consents}/{expected_consents}",
                "counts": {"responses": deleted_responses,
                           "consents": deleted_consents}}


class ConnectionsDeletionHook:
    """Delete the user's CONNECTION surface created before the cutoff:
    connections (both directions), invites, claim attempts. Sessions,
    provider identities and consent records are the IDENTITY/ACCOUNT
    surface — R04: they are no longer deleted by the connections category
    (removing them without an approved account policy silently reset a
    user's login and consent state just because a relationship was
    unlinked). They stay gated behind DEC-12/23 (account hook, not wired)."""

    def apply_user_deletion(self, *, user_id: str, requested_at) -> Dict[str, Any]:
        from family_bridge_features.f01_identity.models import (
            ClaimAttempt, Connection, ConnectionInvite,
        )

        cutoff = _parse_cutoff(requested_at)
        counts: Dict[str, int] = {}

        connections_qs = Connection.objects.filter(
            models_q_pair(user_id), created_at__lte=cutoff)
        expected_connections = connections_qs.count()
        deleted_connections = connections_qs.delete()[0]
        leftover_connections = Connection.objects.filter(
            models_q_pair(user_id), created_at__lte=cutoff).exists()
        counts["connections"] = deleted_connections

        invites_a = ConnectionInvite.objects.filter(
            inviter_id=str(user_id), created_at__lte=cutoff)
        invites_b = ConnectionInvite.objects.filter(
            candidate_id=str(user_id), created_at__lte=cutoff)
        expected_invites = invites_a.count() + invites_b.count()
        deleted_invites = invites_a.delete()[0] + invites_b.delete()[0]
        leftover_invites = (
            ConnectionInvite.objects.filter(
                inviter_id=str(user_id), created_at__lte=cutoff).exists()
            or ConnectionInvite.objects.filter(
                candidate_id=str(user_id), created_at__lte=cutoff).exists())
        counts["invites"] = deleted_invites

        claims_qs = ClaimAttempt.objects.filter(
            actor_id=str(user_id), attempted_at__lte=cutoff)
        expected_claims = claims_qs.count()
        deleted_claims = claims_qs.delete()[0]
        leftover_claims = ClaimAttempt.objects.filter(
            actor_id=str(user_id), attempted_at__lte=cutoff).exists()
        counts["claim_attempts"] = deleted_claims

        ok = ((expected_connections == 0 or
               (deleted_connections > 0 and not leftover_connections))
              and (expected_invites == 0 or
                   (deleted_invites > 0 and not leftover_invites))
              and (expected_claims == 0 or
                   (deleted_claims > 0 and not leftover_claims)))
        return {"ok": ok,
                "detail": "; ".join(f"{k}: {v}" for k, v in sorted(counts.items())),
                "counts": counts}


def models_q_pair(user_id: str):
    """Q object covering both canonical directions of the pair."""
    from django.db.models import Q

    return Q(party_low_id=str(user_id)) | Q(party_high_id=str(user_id))
