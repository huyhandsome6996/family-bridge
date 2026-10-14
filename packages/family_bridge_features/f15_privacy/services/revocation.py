"""Connection revocation integrated with F15 privacy (K3).

F01's ``POST /api/v1/connections/{id}/revoke`` stays the ONLY client-facing
disconnect endpoint. This module is the F15-side adapter that the F01 view
(or the integration composition) invokes in the same transaction so that:

1. the F01 connection flips to revoked (status/revision, generation kept);
2. every live grant between the two parties across registered providers is
   revoked in the SAME transaction (rights die at commit — no TTL/job);
3. TWO ``connection_revoked`` ledger events are appended (one per party) so
   restore replay for either side re-revokes the affected grants AND the
   connection row itself; a reconnect can never silently revive the other
   side's grants.

R08 fix (ledger payload bounds): the event NO LONGER carries per-grant refs
(a 50-grant relationship previously overflowed the 8 KiB ledger payload cap
and rolled the whole unlink back). The payload instead carries the EXACT
revocation scope — (connection_id, generation, other_party_id) — which is a
complete, byte-bounded description: replay re-revokes every grant still bound
to that connection identity+generation for the event's target party, plus the
connection row itself. Payload size is O(1) regardless of grant count; no
grant is ever dropped from scope for being too numerous.

Legacy events written by the previous schema (``grant_refs`` list, possibly
``grant_refs_truncated``) are still replayable: refs are processed per party
as before, and a truncated ref list is FAIL-CLOSED (reported as incomplete
evidence — replay must not claim completion from partial scope).

Lock order (MySQL-safe, single direction): connection row (select_for_update)
-> grants update. No network/provider calls inside the transaction.
"""

from __future__ import annotations

from typing import Any, Dict, List

from django.db import transaction

from ..models import DeletionLedgerEvent

# Kept for legacy-payload compatibility (replay of pre-R08 events).
_GRANT_REF_LIMIT = 50


def _build_connection_event_payload(*, connection, grants_revoked: int,
                                    other_party: str) -> Dict[str, Any]:
    """O(1) byte-bounded payload: the revocation scope is the connection
    identity + generation. Replay re-revokes exactly this scope."""
    return {
        "connection_id": str(connection.id),
        "generation": int(connection.generation),
        "other_party_id": str(other_party),
        "grants_revoked": int(grants_revoked),
        "scope": "connection_identity_generation",
    }


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
    #    R08 fix: revoke is counted from the actual UPDATE rows (no 50-ref
    #    snapshot mismatch — every live grant between the pair is revoked
    #    and the count reflects exactly what changed).
    from . import adapters

    grants_revoked = 0
    if was_active:
        grants_revoked = adapters.revoke_grants_between(
            user_a=str(actor.pk), user_b=other_party)

    # 3) Ledger: one event per party so replay protects BOTH sides (only on
    #    the actual transition — repeated calls on a revoked connection are
    #    idempotent and write nothing).
    if was_active:
        for target in {str(actor.pk), other_party}:
            payload = _build_connection_event_payload(
                connection=connection, grants_revoked=grants_revoked,
                other_party=str(connection.other_party(target)))
            DeletionLedgerEvent.objects.create(
                target_user_id=target,
                actor_ref=str(actor.pk),
                event_type=DeletionLedgerEvent.EVENT_CONNECTION_REVOKED,
                payload=payload)

    return {
        "connection_id": str(connection.id),
        "status": connection.status,
        "generation": connection.generation,
        "revoked_at": (connection.revoked_at.isoformat()
                       if connection.revoked_at else None),
        "grants_revoked": grants_revoked,
    }


def _revoke_grants_for_target(*, target_user_id: str, other_party_id: str,
                              connection_id: str, generation: int) -> Dict[str, Any]:
    """Re-revoke the target party's OWN grants bound to the given connection
    identity+generation (one direction of the pair: owner=target). Used by
    replay; never writes new ledger events. Idempotent."""
    from . import adapters

    revoked = 0
    failed: List[Dict[str, Any]] = []
    for item_type, provider in adapters.all_providers().items():
        try:
            if hasattr(provider, "revoke_grants_between"):
                kwargs = {"user_a": str(target_user_id),
                          "user_b": str(other_party_id)}
                # Exact-scope filter when the provider supports it (R05/R08:
                # replay never touches grants of a DIFFERENT connection).
                if _supports_kwargs(provider.revoke_grants_between,
                                    {"connection_id", "connection_generation"}):
                    kwargs.update(connection_id=str(connection_id),
                                  connection_generation=int(generation))
                    changed = provider.revoke_grants_between(**kwargs)
                else:
                    changed = provider.revoke_grants_between(**kwargs)
                revoked += int(changed)
        except Exception:
            failed.append({"item_type": item_type,
                           "reason": "grant_replay_error",
                           "category": item_type})
    return {"revoked": revoked, "failed": failed}


def _supports_kwargs(func, names) -> bool:
    import inspect

    try:
        parameters = inspect.signature(func).parameters
    except (TypeError, ValueError):
        return False
    return all(n in parameters
               or any(parameters[p].kind is inspect.Parameter.VAR_KEYWORD
                      for p in parameters)
               for n in names)


def replay_connection_revoked_event(*, event) -> Dict[str, Any]:
    """Re-apply one ``connection_revoked`` ledger event during restore.

    R05 fix — the replay now covers the FULL revocation scope:
    1. the connection ROW itself is re-revoked (the previous implementation
       only re-revoked grants, so a restored backup showed the relationship
       as active while the ledger said it was revoked);
    2. grants bound to that connection identity+generation are re-revoked
       for the event's target party (the other party's event covers theirs);
    3. a legacy payload with ``grant_refs_truncated`` is fail-closed: a
       truncated ref list is incomplete evidence and must report
       ``incomplete`` — never a clean pass;
    4. a missing connection row is a failure (fail-closed), not silence.

    Idempotent: re-revoking already-revoked rows changes nothing. Grants are
    re-revoked via the registry/adapters WITHOUT writing new grant_revoked
    events (replay must not multiply events).
    """
    payload = event.payload or {}
    revoked = 0
    failed: List[Dict[str, Any]] = []

    connection_id = str(payload.get("connection_id") or "")
    generation = payload.get("generation")
    other_party_id = str(payload.get("other_party_id") or "")

    # Legacy payload (pre-R08): per-grant refs, bounded, possibly truncated.
    if "grant_refs" in payload:
        for ref in (payload.get("grant_refs") or [])[:_GRANT_REF_LIMIT]:
            owner_id = str(ref.get("owner_id") or event.target_user_id)
            if owner_id != str(event.target_user_id):
                continue  # owned by the other party: replayed via their event
            from . import registry
            try:
                outcome = registry.revoke_grant(
                    owner_id=owner_id,
                    item_type=ref["item_type"], item_id=ref["item_id"],
                    recipient_id=ref.get("recipient_id"),
                    actor_ref="system:restore", write_ledger=False)
                if outcome.get("revoked"):
                    revoked += 1
                elif not outcome.get("found"):
                    failed.append({"item_type": ref.get("item_type"),
                                   "reason": "grant_not_found_or_provider_missing",
                                   "category": ref.get("item_type", "")})
            except Exception:
                failed.append({"item_type": ref.get("item_type"),
                               "reason": "replay_error",
                               "category": ref.get("item_type", "")})
        if payload.get("grant_refs_truncated"):
            # Fail-closed: the event cannot prove the full revocation scope.
            failed.append({"item_type": "",
                           "reason": "grant_refs_truncated_incomplete_evidence",
                           "category": ""})

    # Current payload: connection-identity scope.
    if connection_id and generation is not None:
        import uuid as _uuid

        from family_bridge_features.f01_identity.models import Connection

        try:
            connection_pk = str(_uuid.UUID(connection_id))
        except (ValueError, AttributeError, TypeError):
            connection_pk = None
        connection = (Connection.objects.filter(pk=connection_pk).first()
                      if connection_pk else None)
        if connection is None:
            # The connection row should exist (rows are never deleted); a
            # missing row is an anomaly the operator must see (fail-closed).
            failed.append({"item_type": "", "category": "",
                           "reason": "connection_row_missing"})
        else:
            if (int(connection.generation) == int(generation)
                    and connection.status == "active"):
                # Direct row flip (idempotent, no actor, no new events):
                # replay is a system restore action, not a user unlink.
                connection.status = "revoked"
                from django.utils import timezone as _tz
                connection.revoked_at = _tz.now()
                connection.save(update_fields=["status", "revoked_at"])
                revoked += 1
            if other_party_id:
                grants = _revoke_grants_for_target(
                    target_user_id=str(event.target_user_id),
                    other_party_id=other_party_id,
                    connection_id=connection_id,
                    generation=int(generation))
                revoked += grants["revoked"]
                failed.extend(grants["failed"])

    return {"revoked": revoked, "failed": failed}
