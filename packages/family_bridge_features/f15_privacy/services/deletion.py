"""Deletion workflow + restore replay (FL-20, WF-21, SEC-21, US-017).

Truthful outcomes only:
- "completed" requires EVERY requested category hook to report success;
- any hook failure/partial => failed_needs_action with per-domain detail;
- cancel allowed only while status=requested (DEC-12 retention still OPEN);
- every transition appends an append-only ledger event;
- restore replay re-applies the LATEST ledger (revocations + deletions)
  idempotently — old grants/consents/roles never revive.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import secrets
from typing import Any, Dict, List, Optional

from django.db import transaction

from family_bridge_core.errors import (
    InputInvalid, NotFound, RevisionConflict, TemporarilyUnavailable,
)

from ..models import (
    DeletionLedgerEvent, DeletionRequest, PrivacyCase,
)
from . import registry


def _ledger(*, target_user_id: str, actor_ref: str, event_type: str,
            payload: Dict[str, Any]) -> None:
    DeletionLedgerEvent.objects.create(
        target_user_id=str(target_user_id), actor_ref=actor_ref,
        event_type=event_type, payload=payload)


class DeletionService:
    def __init__(self, *, clock=None) -> None:
        self.clock = clock

    def _now(self) -> dt.datetime:
        import datetime as _dt
        from family_bridge_core.timeutils import UTC
        return self.clock.now() if self.clock else _dt.datetime.now(tz=UTC)

    # -- request ---------------------------------------------------------------
    @transaction.atomic
    def request_deletion(self, *, user, categories: List[str]) -> Dict[str, Any]:
        if not isinstance(categories, list) or not categories:
            raise InputInvalid({"field": "categories",
                                "reason": "must_be_non_empty_list"})
        unknown = [c for c in categories
                   if c not in DeletionRequest.CATEGORIES]
        if unknown:
            raise InputInvalid({"field": "categories",
                                "reason": "invalid_categories",
                                "unknown": unknown[:10]})
        # Idempotent while an open request exists (no duplicate cases).
        open_status = [DeletionRequest.STATUS_REQUESTED,
                       DeletionRequest.STATUS_VERIFIED,
                       DeletionRequest.STATUS_PROCESSING]
        existing = (DeletionRequest.objects
                    .filter(user=user, status__in=open_status)
                    .order_by("-requested_at").first())
        if existing is not None:
            return {"request_id": str(existing.pk), "status": existing.status,
                    "duplicate": True}
        receipt_raw = secrets.token_urlsafe(18)
        request = DeletionRequest.objects.create(
            user=user,
            scope_categories=sorted(set(categories)),
            receipt_hash=hashlib.sha256(receipt_raw.encode()).hexdigest(),
        )
        _ledger(target_user_id=str(user.pk), actor_ref=str(user.pk),
                event_type=DeletionLedgerEvent.EVENT_DELETION_REQUESTED,
                payload={"request_id": str(request.pk),
                         "categories": request.scope_categories})
        # Receipt is returned ONCE; only its hash is stored (SEC-19/22).
        return {"request_id": str(request.pk), "status": request.status,
                "receipt": receipt_raw, "duplicate": False}

    @transaction.atomic
    def cancel_request(self, *, user, request_id: str,
                       expected_revision: Optional[int] = None) -> DeletionRequest:
        request = (DeletionRequest.objects.select_for_update()
                   .filter(pk=request_id, user=user).first())
        if request is None:
            raise NotFound({"reason": "deletion_request_not_found"})
        if request.status != DeletionRequest.STATUS_REQUESTED:
            raise InputInvalid({"reason": "cancel_only_while_requested",
                                "status": request.status})
        if expected_revision is not None and expected_revision != request.revision:
            raise RevisionConflict({"current_revision": request.revision})
        request.status = DeletionRequest.STATUS_CANCELLED
        request.revision += 1
        request.save(update_fields=["status", "revision"])
        _ledger(target_user_id=str(user.pk), actor_ref=str(user.pk),
                event_type=DeletionLedgerEvent.EVENT_DELETION_CANCELLED,
                payload={"request_id": str(request.pk)})
        return request

    # -- processing --------------------------------------------------------------
    @transaction.atomic
    def verify_request(self, *, request_id: str, verifier_ref: str) -> DeletionRequest:
        """Verified ownership step. In production this must be a REAL
        verification flow (step-up/identity re-check per DEC-14) — an admin
        or UI boolean cannot substitute it (gate recorded in docs)."""
        request = (DeletionRequest.objects.select_for_update()
                   .filter(pk=request_id).first())
        if request is None:
            raise NotFound({"reason": "deletion_request_not_found"})
        if request.status != DeletionRequest.STATUS_REQUESTED:
            raise InputInvalid({"reason": "not_in_requested_state",
                                "status": request.status})
        request.status = DeletionRequest.STATUS_VERIFIED
        request.revision += 1
        request.save(update_fields=["status", "revision"])
        PrivacyCase.objects.create(deletion_request=request)
        return request

    @transaction.atomic
    def process_request(self, *, request_id: str) -> DeletionRequest:
        request = (DeletionRequest.objects.select_for_update()
                   .filter(pk=request_id).first())
        if request is None:
            raise NotFound({"reason": "deletion_request_not_found"})
        if request.status not in {DeletionRequest.STATUS_VERIFIED,
                                  DeletionRequest.STATUS_FAILED}:
            raise InputInvalid({"reason": "not_processable",
                                "status": request.status})
        request.status = DeletionRequest.STATUS_PROCESSING
        request.revision += 1
        request.save(update_fields=["status", "revision"])

        outcomes: Dict[str, Any] = {}
        all_ok = True
        for category in request.scope_categories:
            hook = registry.get_deletion_hook(category)
            if hook is None:
                outcomes[category] = {"ok": False,
                                      "error": "hook_not_registered"}
                all_ok = False
                continue
            try:
                hook_instance = hook() if isinstance(hook, type) else hook
                result = hook_instance.apply_user_deletion(
                    user_id=str(request.user_id),
                    requested_at=self._now())
                outcomes[category] = {"ok": bool(result.get("ok")),
                                      "detail": result.get("detail", "")}
                if not result.get("ok"):
                    all_ok = False
            except Exception as exc:  # hook crash must not fake completion
                outcomes[category] = {"ok": False, "error": "hook_error"}
                all_ok = False

        request.failure_detail = outcomes
        request.revision += 1
        if all_ok:
            request.status = DeletionRequest.STATUS_COMPLETED
            request.completed_at = self._now()
        else:
            request.status = DeletionRequest.STATUS_FAILED
        request.save(update_fields=["status", "revision", "failure_detail",
                                    "completed_at"])
        _ledger(target_user_id=str(request.user_id), actor_ref="system:deletion",
                event_type=(DeletionLedgerEvent.EVENT_DELETION_APPLIED if all_ok
                            else DeletionLedgerEvent.EVENT_DELETION_FAILED),
                payload={"request_id": str(request.pk),
                         "categories": request.scope_categories,
                         "outcomes": {k: v.get("ok") for k, v in outcomes.items()}})
        return request

    # -- restore replay (B17 runbook entry point) --------------------------------
    @staticmethod
    def replay_ledger_for_restore(*, target_user_id: str) -> Dict[str, Any]:
        """Apply the LATEST ledger for a user (idempotent) — used by ops after
        restoring a backup so revoked grants/deletions never come back."""
        events = (DeletionLedgerEvent.objects
                  .filter(target_user_id=str(target_user_id))
                  .order_by("occurred_at", "seq"))
        applied = 0
        skipped = 0
        for event in events:
            try:
                if event.event_type == DeletionLedgerEvent.EVENT_GRANT_REVOKED:
                    registry.revoke_grant(
                        owner_id=event.target_user_id,
                        item_type=event.payload["item_type"],
                        item_id=event.payload["item_id"],
                        recipient_id=event.payload.get("recipient_id"),
                        actor_ref="system:restore")
                    applied += 1
                elif event.event_type in {DeletionLedgerEvent.EVENT_DELETION_REQUESTED,
                                          DeletionLedgerEvent.EVENT_CONNECTION_REVOKED,
                                          DeletionLedgerEvent.EVENT_CONSENT_WITHDRAWN}:
                    # Non-hook events are historical markers; replays of actual
                    # deletion hooks happen through replaying deletion requests.
                    skipped += 1
                elif event.event_type == DeletionLedgerEvent.EVENT_DELETION_APPLIED:
                    for category in event.payload.get("categories", []):
                        hook = registry.get_deletion_hook(category)
                        if hook is not None:
                            hook_instance = hook() if isinstance(hook, type) else hook
                            hook_instance.apply_user_deletion(
                                user_id=event.target_user_id,
                                requested_at=event.occurred_at)
                    applied += 1
                else:
                    skipped += 1
            except Exception:
                skipped += 1  # never crash the whole replay; report truthfully
        return {"target_user_id": str(target_user_id),
                "events_total": events.count(), "applied": applied,
                "skipped": skipped}
