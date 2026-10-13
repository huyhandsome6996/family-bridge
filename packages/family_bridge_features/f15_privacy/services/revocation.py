"""Connection revocation integrated with F15 privacy (K3).

F01's ``POST /api/v1/connections/{id}/revoke`` stays the ONLY client-facing
disconnect endpoint. This module is the F15-side adapter that the F01 view
(or the integration composition) invokes in the same transaction so that:

1. the F01 connection flips to revoked (status/revision, generation kept);
2. every live grant between the two parties across registered providers is
   revoked in the SAME transaction (rights die at commit — no TTL/job);
3. TWO ``connection_revoked`` ledger events are appended (one per party) so
   restore replay for either side re-revokes the affected grants and a
   reconnect can never silently revive the other side's grants.

Lock order (MySQL-safe, single direction): connection row (select_for_update)
-> grants update. No network/provider calls inside the transaction.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from django.db import transaction

from ..models import DeletionLedgerEvent

_GRANT_REF_LIMIT = 50  # per event; overflow flagged truthfully


def _build_connection_event_payload(*, connection, grants: List[Dict[str, Any]],
                                    other_party: str) -> Dict[str, Any]:
    payload = {
        "connection_id": str(connection.id),
        "generation": int(connection.generation),
        "other_party_id": str(other_party),
        "grant_refs": grants[:_GRANT_REF_LIMIT],
        "grant_refs_truncated": len(grants) > _GRANT_REF_LIMIT,
    }
    return payload


@transaction.atomic
def revoke_connection_with_privacy(*, actor, connection_id: str) -> Dict[str, Any]:
    """Revoke the connection (F01 service) + dependent grants + ledger.

    Returns a truthful summary dict. Raises ``NotFound`` through the F01
    service when the connection does not exist / the actor is not a party.
    """
    from family_bridge_features.f01_identity.services.invites import InviteService

    # Import late + lock the connection row first (single lock order).
    from family_bridge_features.f01_identity.models import Connection

    connection = (Connection.objects.select_for_update()
                  .filter(pk=connection_id).first())
    if connection is None or not connection.involves(str(actor.pk)):
        from family_bridge_core.errors import NotFound
        raise NotFound({"reason": "connection_not_found"})
    was_active = connection.status == "active"
    other_party = str(connection.other_party(str(actor.pk)))

    # 1) F01 owns the connection semantics (idempotent, generation kept).
    connection = InviteService().revoke_connection(
        actor=actor, connection_id=str(connection.id))

    # 2) Dependent grants across registered providers die in the same tx.
    from . import adapters

    revoked_grants: List[Dict[str, Any]] = []
    if was_active:
        revoked_grants = adapters.revoke_grants_between(
            user_a=str(actor.pk), user_b=other_party)

    # 3) Ledger: one event per party so replay protects BOTH sides (only on
    # the actual transition — repeated calls on a revoked connection are
    # idempotent and write nothing).
    base_payload = None
    if was_active:
        base_payload = _build_connection_event_payload(
            connection=connection, grants=revoked_grants, other_party=other_party)
        for target in {str(actor.pk), other_party}:
            DeletionLedgerEvent.objects.create(
                target_user_id=target,
                actor_ref=str(actor.pk),
                event_type=DeletionLedgerEvent.EVENT_CONNECTION_REVOKED,
                payload=base_payload)

    return {
        "connection_id": str(connection.id),
        "status": connection.status,
        "generation": connection.generation,
        "grants_revoked": len(revoked_grants),
        "grant_refs_truncated": bool(base_payload and
                                     base_payload["grant_refs_truncated"]),
    }


def replay_connection_revoked_event(*, event) -> Dict[str, Any]:
    """Re-apply one ``connection_revoked`` ledger event during restore.

    Idempotent: re-revoking already-revoked grants changes nothing. Each
    payload ref carries its owner_id — this per-party replay processes only
    the refs OWNED by the event's target (the other party's event covers the
    rest). Grants are re-revoked via the registry WITHOUT writing new
    grant_revoked events (replay must not multiply events).
    """
    from . import registry

    payload = event.payload or {}
    revoked = 0
    failed: List[Dict[str, Any]] = []
    for ref in payload.get("grant_refs", [])[:_GRANT_REF_LIMIT]:
        owner_id = str(ref.get("owner_id") or event.target_user_id)
        if owner_id != str(event.target_user_id):
            continue  # owned by the other party: replayed via their event
        try:
            outcome = registry.revoke_grant(
                owner_id=owner_id,
                item_type=ref["item_type"], item_id=ref["item_id"],
                recipient_id=ref.get("recipient_id"),
                actor_ref="system:restore", write_ledger=False)
            if outcome.get("revoked"):
                revoked += 1
            elif not outcome.get("found"):
                # Provider unknown or grant table unavailable -> honest miss.
                failed.append({"item_type": ref.get("item_type"),
                               "reason": "grant_not_found_or_provider_missing"})
        except Exception:
            failed.append({"item_type": ref.get("item_type"),
                           "reason": "replay_error"})
    return {"revoked": revoked, "failed": failed}
