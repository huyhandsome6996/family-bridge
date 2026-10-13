"""Deletion workflow + restore replay (FL-20, WF-21, SEC-21, US-017).

Truthful outcomes only:
- "completed" requires EVERY requested category hook to report success AND
  the adapter's postcondition check to pass;
- any hook failure/partial => failed_needs_action with per-domain detail;
- cancel allowed only while status=requested (DEC-12 retention still OPEN);
- every transition appends an append-only ledger event;
- restore replay re-applies the LATEST ledger (revocations + deletions)
  idempotently and FAILS CLOSED: missing hooks / errors / missing events
  mark the replay incomplete so operators keep the isolation (AF-06).

Concurrency & scope safety (K5):
- duplicate requests are serialized with a per-user lock (SELECT ... FOR
  UPDATE on the user row) — atomic+exists alone cannot prevent concurrent
  inserts on MySQL;
- the processing cutoff is captured ONCE (first processing attempt) and
  persisted in the request checkpoint; retries/replays never extend the
  scope to items created after that cutoff;
- each category runs in its OWN short transaction (checkpoint after each)
  so a failing hook never poisons the whole batch and locks are never held
  across provider/network calls.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import secrets
import uuid as uuid_module
from typing import Any, Dict, List, Optional

from django.db import transaction

from family_bridge_core.errors import (
    InputInvalid, ModuleUnavailable, NotFound, RevisionConflict,
)

from ..models import (
    DeletionLedgerEvent, DeletionRequest, PrivacyCase,
)
from . import registry

_MAX_CATEGORIES = 10  # allowlist size (models.DeletionRequest.CATEGORIES)

# Reserved keys inside failure_detail (category names never start with "_").
_SCOPE_KEY = "_scope"
_OUTCOMES_KEY = "_outcomes"


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
        if any(not isinstance(c, str) for c in categories):
            raise InputInvalid({"field": "categories",
                                "reason": "must_be_list_of_strings"})
        if len(categories) > _MAX_CATEGORIES:
            raise InputInvalid({"field": "categories",
                                "reason": "too_many_categories",
                                "max": _MAX_CATEGORIES})
        unknown = [c for c in categories
                   if c not in DeletionRequest.CATEGORIES]
        if unknown:
            raise InputInvalid({"field": "categories",
                                "reason": "invalid_categories",
                                "unknown": unknown[:_MAX_CATEGORIES]})
        wanted = sorted(set(categories))

        # Per-user serialization: two concurrent first-requests cannot both
        # pass the exists() check (SQLite tests it logically; MySQL enforces
        # the row lock). Locking the USER row keeps one lock order and no
        # new migration is needed.
        from django.contrib.auth import get_user_model
        User = get_user_model()
        User.objects.select_for_update().get(pk=user.pk)

        open_status = [DeletionRequest.STATUS_REQUESTED,
                       DeletionRequest.STATUS_VERIFIED,
                       DeletionRequest.STATUS_PROCESSING]
        existing = (DeletionRequest.objects
                    .filter(user=user, status__in=open_status)
                    .order_by("-requested_at").first())
        if existing is not None:
            # Two different intents never merge silently: the caller sees
            # the open request's scope and whether it covers their intent.
            return {"request_id": str(existing.pk), "status": existing.status,
                    "duplicate": True,
                    "scope_categories": list(existing.scope_categories),
                    "covers_requested_categories": all(
                        c in existing.scope_categories for c in wanted)}
        receipt_raw = secrets.token_urlsafe(18)
        request = DeletionRequest.objects.create(
            user=user,
            scope_categories=wanted,
            receipt_hash=hashlib.sha256(receipt_raw.encode()).hexdigest(),
        )
        _ledger(target_user_id=str(user.pk), actor_ref=str(user.pk),
                event_type=DeletionLedgerEvent.EVENT_DELETION_REQUESTED,
                payload={"request_id": str(request.pk),
                         "categories": request.scope_categories})
        # Receipt is returned ONCE; only its hash is stored (SEC-19/22).
        return {"request_id": str(request.pk), "status": request.status,
                "receipt": receipt_raw, "duplicate": False}

    # -- owner list (recover after lost response / reopen app) ------------------
    _CURSOR_V2 = "v2|"  # "v2|<requested_at_iso>|<uuid>"

    @classmethod
    def _parse_request_cursor(cls, cursor: str):
        """R12 fix: the cursor carries a timestamp AND a UUID. Both parts are
        validated here (timezone-aware ISO datetime + real UUID) so a
        malformed cursor is a clean 400 ``input_invalid`` — never a 500 from
        a half-parsed value reaching the ORM."""
        if cursor.startswith(cls._CURSOR_V2):
            raw = cursor[len(cls._CURSOR_V2):]
        else:
            # Legacy cursors (issued before the v2 prefix) are still accepted:
            # they were "requested_at_iso|uuid".
            raw = cursor
        try:
            cur_at_raw, cur_id = raw.split("|", 1)
            cur_at = dt.datetime.fromisoformat(cur_at_raw)
        except (ValueError, AttributeError):
            raise InputInvalid({"field": "cursor", "reason": "malformed"})
        if cur_at.tzinfo is None:
            raise InputInvalid({"field": "cursor",
                                "reason": "cursor_time_must_be_tz_aware"})
        try:
            cur_uuid = uuid_module.UUID(cur_id)
        except (ValueError, AttributeError, TypeError):
            raise InputInvalid({"field": "cursor",
                                "reason": "cursor_id_must_be_uuid"})
        return cur_at, str(cur_uuid)

    def list_requests(self, *, user, cursor: Optional[str] = None,
                      limit: int = 20) -> Dict[str, Any]:
        """Owner-only, bounded, stable order (requested_at desc, id desc).
        Cursor = opaque "v2|requested_at_iso|id" of the last row."""
        limit = max(1, min(int(limit), 50))
        qs = (DeletionRequest.objects.filter(user=user)
              .order_by("-requested_at", "-id"))
        if cursor:
            cur_at, cur_id = self._parse_request_cursor(cursor)
            qs = qs.filter(
                requested_at__lt=cur_at) | qs.filter(requested_at=cur_at,
                                                     id__lt=cur_id)
            qs = qs.order_by("-requested_at", "-id")
        rows = list(qs[:limit + 1])
        has_more = len(rows) > limit
        rows = rows[:limit]
        items = [{
            "request_id": str(row.pk),
            "status": row.status,
            "scope_categories": list(row.scope_categories),
            "requested_at": row.requested_at.isoformat(),
            "revision": row.revision,
        } for row in rows]
        next_cursor = None
        if has_more and rows:
            last = rows[-1]
            next_cursor = (f"{self._CURSOR_V2}{last.requested_at.isoformat()}"
                           f"|{last.pk}")
        return {"results": items, "next_cursor": next_cursor,
                "has_more": has_more}

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

    # -- verification (authorized entrypoint; DEC-14/18 gate) -------------------
    @transaction.atomic
    def verify_request(self, *, request_id: str, verifier_ref: str,
                       authorizer=None,
                       actor_id: str = "") -> DeletionRequest:
        """Verified ownership step. The CALLER must already be authorized
        (handler capability privacy.case via services.verification); this
        method re-authorizes with the TRUSTED actor id passed down from the
        view (R07: never an empty actor, never the client verifier_ref) and
        records the transition with the REAL actor as the audit subject; the
        optional ``verifier_ref`` is kept as a bounded, non-PII reference in
        the event payload. It is intentionally NOT reachable from the owner
        API."""
        from .verification import ACTION_VERIFY, authorize_handler_action

        if not authorize_handler_action(actor_id=str(actor_id),
                                        action=ACTION_VERIFY,
                                        request_id=str(request_id),
                                        authorizer=authorizer):
            from family_bridge_core.errors import ModuleUnavailable
            raise ModuleUnavailable({"reason": "handler_not_authorized"})
        if not isinstance(verifier_ref, str) or not (1 <= len(verifier_ref) <= 64):
            raise InputInvalid({"field": "verifier_ref", "reason": "malformed"})
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
        # Audit actor = the authenticated handler (trusted context), never a
        # client-provided string (R07).
        _ledger(target_user_id=str(request.user_id),
                actor_ref=(str(actor_id) if actor_id
                           else verifier_ref[:64]),
                event_type=DeletionLedgerEvent.EVENT_DELETION_REQUESTED,
                payload={"request_id": str(request.pk),
                         "transition": "verified",
                         "verifier_ref": verifier_ref[:64]})
        return request

    # -- processing (phase/checkpoint rework) -----------------------------------
    @transaction.atomic
    def _begin_processing(self, request) -> Dict[str, Any]:
        """Phase A: only verified/failed -> processing; a request already
        stuck in ``processing`` (worker crashed mid-run, R06) RESUMES with
        its persisted scope/checkpoint instead of being rejected forever.
        The cutoff is captured ONCE and persisted in the request checkpoint;
        retries/replays never extend the scope."""
        request = (DeletionRequest.objects.select_for_update()
                   .filter(pk=request.pk).first())
        if request.status not in {DeletionRequest.STATUS_VERIFIED,
                                  DeletionRequest.STATUS_FAILED,
                                  DeletionRequest.STATUS_PROCESSING}:
            raise InputInvalid({"reason": "not_processable",
                                "status": request.status})
        detail = dict(request.failure_detail or {})
        scope = detail.get(_SCOPE_KEY)
        if not isinstance(scope, dict) or "cutoff" not in scope:
            scope = {"cutoff": self._now().isoformat(),
                     "categories": list(request.scope_categories)}
        outcomes = {k: v for k, v in detail.items()
                    if not k.startswith("_") and isinstance(v, dict)}
        request.status = DeletionRequest.STATUS_PROCESSING
        request.revision += 1
        request.failure_detail = {**outcomes, _SCOPE_KEY: scope}
        request.save(update_fields=["status", "revision", "failure_detail"])
        return scope, outcomes

    @transaction.atomic
    def _persist_checkpoint(self, request, outcomes: Dict[str, Any]) -> None:
        """R06 fix: durable per-category progress. Written after EVERY
        category run (short transaction, request row locked), so a crash
        between categories loses at most the one in-flight category and a
        resumed run skips everything already reported ok."""
        request = (DeletionRequest.objects.select_for_update()
                   .filter(pk=request.pk).first())
        scope = (request.failure_detail or {}).get(_SCOPE_KEY, {})
        request.failure_detail = {**outcomes, _SCOPE_KEY: scope}
        request.save(update_fields=["failure_detail"])

    def _run_category(self, *, user_id: str, category: str,
                      cutoff: dt.datetime) -> Dict[str, Any]:
        """Phase B (one short transaction per category): run the hook with
        the persisted cutoff; a crash here never affects other categories."""
        hook = registry.get_deletion_hook(category)
        if hook is None:
            return {"ok": False, "error": "hook_not_registered"}
        try:
            hook_instance = hook() if isinstance(hook, type) else hook
            with transaction.atomic():
                result = hook_instance.apply_user_deletion(
                    user_id=str(user_id), requested_at=cutoff)
            if not isinstance(result, dict) or "ok" not in result:
                return {"ok": False, "error": "hook_result_invalid"}
            return {"ok": bool(result.get("ok")),
                    "detail": str(result.get("detail", ""))[:200]}
        except Exception:
            return {"ok": False, "error": "hook_error"}

    @transaction.atomic
    def _finish_processing(self, request, outcomes: Dict[str, Any],
                           cutoff_iso: Optional[str] = None) -> DeletionRequest:
        """Phase C: truthful final status from the checkpoint + ledger.
        R04 fix: the ``deletion_applied`` event carries the ORIGINAL cutoff
        so restore replay re-applies the SAME scope (never the event time,
        which is later and would widen the deletion)."""
        request = (DeletionRequest.objects.select_for_update()
                   .filter(pk=request.pk).first())
        pending = [c for c in request.scope_categories if c not in outcomes]
        all_ok = all(bool(outcomes.get(c, {}).get("ok")) for c in request.scope_categories)
        scope = (request.failure_detail or {}).get(_SCOPE_KEY, {})
        detail = {**outcomes, _SCOPE_KEY: scope}
        if pending:
            detail["_pending"] = pending
        request.failure_detail = detail
        request.revision += 1
        if all_ok and not pending:
            request.status = DeletionRequest.STATUS_COMPLETED
            request.completed_at = self._now()
        else:
            request.status = DeletionRequest.STATUS_FAILED
        request.save(update_fields=["status", "revision", "failure_detail",
                                    "completed_at"])
        applied_payload = {"request_id": str(request.pk),
                           "categories": request.scope_categories,
                           "outcomes": {k: bool(v.get("ok"))
                                        for k, v in outcomes.items()}}
        if cutoff_iso:
            applied_payload["cutoff"] = str(cutoff_iso)
        _ledger(target_user_id=str(request.user_id), actor_ref="system:deletion",
                event_type=(DeletionLedgerEvent.EVENT_DELETION_APPLIED if all_ok and not pending
                            else DeletionLedgerEvent.EVENT_DELETION_FAILED),
                payload=applied_payload)
        return request

    def process_request(self, *, request_id: str) -> DeletionRequest:
        """3-phase processing: A mark+cutoff (atomic) -> B per-category
        checkpoints (atomic each, progress persisted durably after EVERY
        category — R06) -> C final status + ledger (atomic).
        Retry/resume re-runs only categories that are missing/failed."""
        request = (DeletionRequest.objects.filter(pk=request_id).first())
        if request is None:
            raise NotFound({"reason": "deletion_request_not_found"})
        scope, outcomes = self._begin_processing(request)
        cutoff_raw = scope.get("cutoff")
        try:
            cutoff = dt.datetime.fromisoformat(cutoff_raw)
        except (TypeError, ValueError):
            cutoff = self._now()
        for category in request.scope_categories:
            previous = outcomes.get(category)
            if isinstance(previous, dict) and previous.get("ok"):
                continue  # checkpoint: already done in an earlier attempt
            outcomes[category] = self._run_category(
                user_id=str(request.user_id), category=category, cutoff=cutoff)
            # Durable checkpoint after each category (R06): a crash right
            # after this line resumes WITHOUT re-running finished categories.
            self._persist_checkpoint(request, outcomes)
        return self._finish_processing(request, outcomes,
                                       cutoff_iso=scope.get("cutoff"))

    # -- restore replay (B17 runbook entry point) --------------------------------
    @staticmethod
    def replay_ledger_for_restore(*, target_user_id: str,
                                  after_seq: Optional[int] = None,
                                  max_events: int = 10_000) -> Dict[str, Any]:
        """Apply the LATEST ledger for a user (idempotent) — used by ops after
        restoring a backup so revoked grants/deletions never come back.

        FAIL-CLOSED (AF-06/WF-21): a missing hook, a failed hook result, a
        replay error, a truncated event payload, or a missing original cutoff
        marks the whole replay ``incomplete`` so the operator keeps the backup
        isolated. ``after_seq`` bounds restart; ``max_events`` bounds one run
        (``truncated`` flags a partial pass — the runbook must loop until
        truncated is False).

        Ordering (R05 fix): events are read in **seq** order — the
        append-only sequence is the single authoritative replay order. The
        previous (occurred_at, seq) sort combined with a ``seq >`` resume
        watermark could permanently SKIP events whose business timestamps
        are out of order relative to their insertion order.
        Replay itself never appends new domain events.
        """
        from .revocation import replay_connection_revoked_event
        from .verification import ACTION_PROCESS, authorize_handler_action  # noqa: F401

        bound = max(1, min(int(max_events), 50_000))
        qs = (DeletionLedgerEvent.objects
              .filter(target_user_id=str(target_user_id))
              .order_by("seq"))
        if after_seq is not None:
            qs = qs.filter(seq__gt=int(after_seq))
        events = list(qs[:bound])
        truncated = len(events) >= bound

        applied = 0
        skipped = 0
        failures: List[Dict[str, Any]] = []
        last_seq = None
        for event in events:
            last_seq = event.seq
            if event.event_type == DeletionLedgerEvent.EVENT_GRANT_REVOKED:
                try:
                    outcome = registry.revoke_grant(
                        owner_id=event.target_user_id,
                        item_type=event.payload["item_type"],
                        item_id=event.payload["item_id"],
                        recipient_id=event.payload.get("recipient_id"),
                        actor_ref="system:restore", write_ledger=False)
                    if outcome.get("revoked") or outcome.get("found"):
                        applied += 1
                    else:
                        failures.append({"seq": event.seq,
                                         "reason": "grant_not_found"})
                except ModuleUnavailable as exc:
                    failures.append({"seq": event.seq,
                                     "reason": "provider_missing",
                                     "detail": str(exc.details.get("item_type", ""))})
                except Exception as exc:
                    failures.append({"seq": event.seq, "reason": "replay_error",
                                     "detail": type(exc).__name__})
            elif event.event_type == DeletionLedgerEvent.EVENT_CONNECTION_REVOKED:
                result = replay_connection_revoked_event(event=event)
                applied += result["revoked"]
                for item in result["failed"]:
                    failures.append({"seq": event.seq, "reason": item["reason"],
                                     "item_type": item.get("item_type", ""),
                                     "category": item.get("category", "")})
            elif event.event_type == DeletionLedgerEvent.EVENT_CONSENT_WITHDRAWN:
                from . import ports
                writer = ports.get_consent_writer()
                if writer is None:
                    failures.append({"seq": event.seq,
                                     "reason": "consent_writer_missing"})
                    continue
                purpose = str((event.payload or {}).get("purpose", ""))
                try:
                    writer.withdraw(user_id=str(event.target_user_id),
                                    purpose=purpose)
                    applied += 1
                except Exception as exc:
                    failures.append({"seq": event.seq,
                                     "reason": "consent_withdraw_error",
                                     "detail": type(exc).__name__})
            elif event.event_type == DeletionLedgerEvent.EVENT_DELETION_APPLIED:
                payload = event.payload or {}
                # R04 fix: replay re-applies the ORIGINAL deletion cutoff
                # persisted on the event. The event's own occurred_at is
                # ALWAYS later than the cutoff — using it would widen the
                # deletion to items created after the approved scope.
                # Fail-closed when the cutoff is missing (legacy event).
                cutoff_raw = payload.get("cutoff")
                if not cutoff_raw:
                    failures.append({"seq": event.seq,
                                     "reason": "deletion_cutoff_missing",
                                     "category": ""})
                    continue
                try:
                    cutoff = dt.datetime.fromisoformat(str(cutoff_raw))
                except (TypeError, ValueError):
                    failures.append({"seq": event.seq,
                                     "reason": "deletion_cutoff_malformed",
                                     "category": ""})
                    continue
                for category in payload.get("categories", []):
                    hook = registry.get_deletion_hook(category)
                    if hook is None:
                        failures.append({"seq": event.seq,
                                         "reason": "hook_not_registered",
                                         "category": category})
                        continue
                    try:
                        hook_instance = hook() if isinstance(hook, type) else hook
                        result = hook_instance.apply_user_deletion(
                            user_id=event.target_user_id,
                            requested_at=cutoff)
                        if not (isinstance(result, dict) and result.get("ok")):
                            failures.append({"seq": event.seq,
                                             "reason": "hook_reported_failure",
                                             "category": category})
                            continue
                        applied += 1
                    except Exception as exc:
                        failures.append({"seq": event.seq,
                                         "reason": "hook_replay_error",
                                         "category": category,
                                         "detail": type(exc).__name__})
            else:
                # deletion_requested / deletion_failed / deletion_cancelled:
                # historical markers — counted truthfully as skipped.
                skipped += 1
        return {"target_user_id": str(target_user_id),
                "events_total": len(events), "applied": applied,
                "skipped": skipped, "failures": failures,
                "incomplete": bool(failures) or truncated,
                "truncated": truncated,
                "last_seq": last_seq,
                "next_after_seq": last_seq if (truncated or failures) else None}
