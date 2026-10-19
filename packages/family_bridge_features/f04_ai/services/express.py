"""AI expression service (US-029/US-033).

Refine flow (explicit user action only):
1. Consent gate (SERVER-SIDE, BEFORE the provider call): effective consent
   for purpose `ai_processing` at the CURRENT policy version via F01
   has_active_consent(). Missing/declined/withdrawn/old-version -> 403
   ConsentRequired with provider_calls=0. Accept/discard are NOT gated.
2. AI off / provider unwired / kill switch -> module_unavailable (503);
   manual writing is unaffected (nothing else in the app depends on AI).
3. Payload to the provider is MINIMAL: only the author-selected sentence
   (single `text` param) + purpose tag. Never history, journals, other
   users' data, or any context beyond the chosen sentence.
4. Provider output is UNTRUSTED TEXT: bounded, stored as data, rendered as
   text; never executed, never parsed as instructions, never auto-sent.
5. Idempotency: same author+key returns the SAME suggestion without a
   second provider call; same key different payload (including a different
   input_revision) -> 409. Double-charge guard (R1A2-01): a per-(author,key)
   AiRefineOperation claim is inserted INFLIGHT in a short atomic BEFORE the
   provider call — a concurrent same-key request never calls the provider a
   second time. A same-payload loser of the claim race does NOT fail hard:
   it waits a BOUNDED window (<= 2s, no locks held) for the in-flight
   winner to finalize and then replays the winner's stored outcome; only if
   the winner does not settle within the bound does it receive
   409 slot_unavailable(refine_in_progress) (the client retries later and
   lands on the replay). The unique (author, key) suggestion constraint
   remains the last layer: a finalize race catches IntegrityError and
   returns the winner's row (replay) instead of a second stored operation.
6. Transaction phases (C6): validate + consent + replay-check -> short
   atomic claim (AiRefineOperation) -> provider call OUTSIDE every
   transaction.atomic -> short atomic finalize (suggestion insert + claim
   COMPLETED). Provider/network I/O never runs inside a transaction or row
   lock. Claim IDENTITY fencing (N02, QA 18/10): the request captures the
   pk + payload hash of ITS OWN claim at claim time and finalize locks THAT
   row by pk — never "any INFLIGHT row with the same author+key". A key
   reused after an F15 deletion or a TTL reclaim belongs to a NEW generation
   with its own row; the old request's late result is fenced (dropped, 503
   refine_result_discarded_after_deletion), never stored onto the new
   generation's claim.
7. Provider failure modes map to truthful statuses: timeout/outage/quota ->
   temporarily_unavailable (503) with reason; malformed/oversized/truncated
   output -> temporarily_unavailable(provider_output_invalid|_truncated).
   Response-unknown (timeout after send) is NEVER retried automatically.
8. accept/discard are author-only, one-way; they NEVER send anything.
"""

from __future__ import annotations

import datetime as dt
import time
from typing import Any, Dict, Optional

from django.db import IntegrityError, transaction

from family_bridge_core.errors import (
    ConsentRequired, DuplicateKeyPayloadMismatch, InputInvalid,
    ModuleUnavailable, NotFound, SlotUnavailable, TemporarilyUnavailable,
)
from family_bridge_core.idempotency import send_payload_hash
from family_bridge_core.timeutils import UTC
from family_bridge_core.validation import MAX_TEXT_CHARS

from ..models import (
    PURPOSES, STATUSES, STATUS_ACCEPTED, STATUS_DISCARDED, STATUS_SUGGESTED,
    STATUS_COMPLETED, STATUS_INFLIGHT, AiRefineOperation, AiSuggestion,
)
from . import registry

# R1A2-02: the transport deadline is owned by the WIRED provider
# (GeminiProvider.timeout_seconds, bound from GEMINI_TIMEOUT_SECONDS in
# settings via wiring). Passing None lets provider.refine fall back to that
# wired value instead of a hard-coded constant overriding it.

# R1A2-01: an INFLIGHT AiRefineOperation older than this TTL is treated as
# outcome-unknown garbage (the owning request died before finalize) and may
# be reclaimed by the user's DELIBERATE retry. 60s covers any sane provider
# deadline (max 30s) plus scheduling slack; the client is expected to surface
# 409 slot_unavailable and let the user retry — the retry is user-initiative,
# never an automatic re-send (C6: response-unknown is never auto-retried).
REFINE_OPERATION_TTL_SECONDS = 60

# F04-T07 (MySQL race evidence, task 2-c): a same-payload request that loses
# the claim race waits for the in-flight winner to finalize instead of
# failing hard. DSA bounds (documented for review):
# - REFINE_CLAIM_WAIT_STEP_SECONDS (0.1s) between settlement polls — each
#   poll is one cheap indexed SELECT in autocommit; NO row lock is held
#   while waiting, so the winner's finalize is never blocked by the waiter.
# - REFINE_CLAIM_WAIT_TOTAL_SECONDS (2.0s) maximum total wait per request —
#   deliberately ~30x below the 60s reclaim TTL, so the wait can NEVER
#   reclaim another request's claim and can NEVER cause a second provider
#   call: the waiter only replays the winner's already-stored outcome (C6
#   preserved — no automatic resend, no double charge) or, past the bound,
#   fails with the truthful 409 slot_unavailable(refine_in_progress) that
#   the compose UI already treats as "busy, try again".
REFINE_CLAIM_WAIT_STEP_SECONDS = 0.1
REFINE_CLAIM_WAIT_TOTAL_SECONDS = 2.0

# Frozen contract C2/C3: optional author-client revision tag.
INPUT_REVISION_MAX = 2147483647
CONSENT_PURPOSE_AI = "ai_processing"


class _ProviderFailed(Exception):
    def __init__(self, reason: str) -> None:
        self.reason = reason


class _RefineFencedByDeletion(Exception):
    """R02 (QA 18/10) + N02 identity fence: the claim row THIS request owns
    is gone at finalize time — the F15 deletion committed, or a TTL reclaim
    replaced the row with a new generation. The spent provider result must
    be DROPPED, never persisted as a suggestion and never attributed to the
    next generation's claim."""

    def __init__(self, reason: str = "claim_row_missing") -> None:
        super().__init__(reason)
        self.reason = reason


class _RefineClaimIdentityMismatch(Exception):
    """N02 defense-in-depth: under the finalize row lock the claim's stored
    payload hash no longer matches THIS request's payload — the identity
    binding (claim_pk <-> payload_hash) is broken out-of-band. Refuse to
    store anything: an old result must never land on a different
    generation's claim."""


def validate_input_revision(value: Any) -> Optional[int]:
    """None (legacy payload) or a positive int within the DB-safe range."""
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int):
        raise InputInvalid({"field": "input_revision",
                            "reason": "must_be_integer"})
    if value < 1:
        raise InputInvalid({"field": "input_revision",
                            "reason": "must_be_positive"})
    if value > INPUT_REVISION_MAX:
        raise InputInvalid({"field": "input_revision",
                            "reason": "too_large", "max": INPUT_REVISION_MAX})
    return value


class AiExpressService:
    # -- consent gate (C4) ------------------------------------------------------
    @staticmethod
    def _consent_granted(author_id: str) -> bool:
        """Fail closed: only a verified CURRENT-version ai_processing
        consent lets refine proceed."""
        try:
            from family_bridge_features.f01_identity.services.identity import (
                has_active_consent,
            )
        except ImportError:
            return False
        return has_active_consent(author_id, CONSENT_PURPOSE_AI)

    @classmethod
    def _require_consent(cls, author_id: str) -> None:
        if not cls._consent_granted(author_id):
            raise ConsentRequired(
                {"reason": "ai_processing_consent_required",
                 "purpose": CONSENT_PURPOSE_AI})

    # -- provider ---------------------------------------------------------------
    @staticmethod
    def _kill_switch_active(provider) -> bool:
        guard = getattr(provider, "kill_switch_active", None)
        return bool(guard()) if callable(guard) else False

    def _call_provider(self, *, text: str, purpose: str) -> Dict[str, Any]:
        provider = registry.get_ai_provider()
        if provider is None:
            raise ModuleUnavailable({"reason": "ai_unavailable_or_off"})
        if self._kill_switch_active(provider):
            raise ModuleUnavailable({"reason": "ai_unavailable_or_off"})
        try:
            result = provider.refine(text=text, purpose=purpose,
                                     timeout_seconds=None)
        except Exception as exc:
            # Provider failures map to truthful 503 with the specific reason
            # (outage/timeout/quota) when the provider marks it via the
            # fb_provider_reason attribute; unknown crashes stay generic.
            reason = getattr(exc, "fb_provider_reason",
                             "provider_unexpected_failure")
            raise TemporarilyUnavailable({"reason": reason}) from exc
        if not isinstance(result, dict) or "suggested_text" not in result:
            raise TemporarilyUnavailable(
                {"reason": "provider_output_invalid"})
        suggested = result.get("suggested_text")
        if not isinstance(suggested, str) or not suggested.strip():
            raise TemporarilyUnavailable({"reason": "provider_output_invalid"})
        if len(suggested) > MAX_TEXT_CHARS:
            raise TemporarilyUnavailable(
                {"reason": "provider_output_invalid"})
        return {
            "suggested_text": suggested,
            "provider_id": str(result.get("provider_id", "unknown"))[:64],
            "model_revision": str(result.get("model_revision", "unknown"))[:64],
            "prompt_revision": str(result.get("prompt_revision", "unknown"))[:32],
        }

    # -- refine operation claim (R1A2-01: one provider call per key) ----------
    def _claim_refine_operation(self, *, author_id: str, idempotency_key: str,
                                payload_hash: str):
        """Claim the per-(author, key) operation slot in a SHORT atomic.

        Returns the claim IDENTITY (dict {"claim_pk", "payload_hash"}) when
        this request owns a FRESH claim and may proceed to the provider
        call; returns an AiSuggestion when the operation already reached a
        completed outcome with the same payload (replay — the caller must
        return it without any provider call). The caller must carry the
        identity through Phase 3 and present it at finalize: the finalize
        fence (N02) validates pk + payload hash under lock so a reused or
        TTL-reclaimed key can never inherit an older request's result.

        Concurrent same-key loser (F04-T07, MySQL evidence): against a
        FRESH (< TTL) INFLIGHT claim of the SAME payload this request does
        not fail hard — it polls the claim (bounded, lock-free) until the
        winner finalizes and then replays the winner's stored outcome.
        DSA bounds: poll step 0.1s (REFINE_CLAIM_WAIT_STEP_SECONDS), total
        wait <= 2.0s (REFINE_CLAIM_WAIT_TOTAL_SECONDS), at most 3 claim
        create attempts. The bound is far below the 60s TTL, so the wait
        never reclaims another request's claim and never triggers a second
        provider call — C6 (no automatic resend) and the one-provider-call
        guarantee stay intact. A different-payload INFLIGHT claim can never
        replay, so it fails fast (409) without waiting.

        Raises:
        - SlotUnavailable (409): the same-payload winner did not settle
          within the bounded wait (still mid-flight), or the claim slot kept
          changing hands past the create-attempt bound; the client retries
          later and lands on the replay.
        - DuplicateKeyPayloadMismatch (409): the claim/result belongs to a
          different payload, or the claim is COMPLETED while its suggestion
          row is gone (strange state — never silently re-run the key).
        """
        author_id = str(author_id)
        wait_deadline = (dt.datetime.now(tz=UTC)
                         + dt.timedelta(seconds=REFINE_CLAIM_WAIT_TOTAL_SECONDS))
        for _ in range(3):  # bounded: stale reclamation retries at most once
            try:
                with transaction.atomic():
                    row = AiRefineOperation.objects.create(
                        author_id=author_id,
                        idempotency_key=idempotency_key,
                        payload_hash_hex=payload_hash,
                        status=STATUS_INFLIGHT)
                # N02: claimed — capture THIS generation's identity so the
                # finalize fence can re-lock exactly this row by pk.
                return {"claim_pk": str(row.pk),
                        "payload_hash": payload_hash}
            except IntegrityError:
                op = AiRefineOperation.objects.filter(
                    author_id=author_id,
                    idempotency_key=idempotency_key).first()
                if op is None:
                    # Insert lost a razor-thin race against a concurrent
                    # stale-claim delete (or the winner's INSERT is not
                    # committed/visible yet); re-attempt the claim.
                    continue
                if op.status == STATUS_COMPLETED:
                    return self._replay_completed(
                        author_id=author_id, idempotency_key=idempotency_key,
                        payload_hash=payload_hash)
                # INFLIGHT claim.
                age = (dt.datetime.now(tz=UTC)
                       - op.created_at).total_seconds()
                if age >= REFINE_OPERATION_TTL_SECONDS:
                    # Outcome-unknown reconciliation: the owning request died
                    # between claim and finalize (no suggestion row exists —
                    # the replay check already missed). The USER deliberately
                    # retried after the TTL window (never an automatic
                    # resend), so the stale slot is reclaimed here. Same
                    # payload proceeds; a different payload must never
                    # silently overwrite another payload's claim -> 409.
                    if op.payload_hash_hex != payload_hash:
                        raise DuplicateKeyPayloadMismatch(
                            {"reason": "same_key_different_payload"}) from None
                    AiRefineOperation.objects.filter(
                        pk=op.pk, status=STATUS_INFLIGHT).delete()
                    # Loop re-attempts the create; a concurrent reclaimer
                    # wins the unique slot and this request sees its fresh
                    # claim.
                    continue
                # FRESH INFLIGHT: another request for the same key is
                # mid-flight (provider wait + finalize). Same payload ->
                # bounded wait for its settlement, then replay; different
                # payload can never replay -> fail fast (409, unchanged).
                if op.payload_hash_hex != payload_hash:
                    raise SlotUnavailable(
                        {"reason": "refine_in_progress"}) from None
                while dt.datetime.now(tz=UTC) < wait_deadline:
                    time.sleep(REFINE_CLAIM_WAIT_STEP_SECONDS)
                    op = AiRefineOperation.objects.filter(
                        author_id=author_id,
                        idempotency_key=idempotency_key).first()
                    if op is None:
                        # The claim row vanished mid-wait (F15 deletion, or
                        # the user's deliberate TTL reclaim): re-attempt the
                        # claim as a new generation (bounded by the outer
                        # create-attempt loop).
                        break
                    if op.status == STATUS_COMPLETED:
                        return self._replay_completed(
                            author_id=author_id,
                            idempotency_key=idempotency_key,
                            payload_hash=payload_hash)
                    # Still INFLIGHT — and necessarily far from the TTL (the
                    # wait bound is ~30x smaller than it): keep polling.
                else:
                    # Bound expired while the winner is still mid-flight:
                    # truthful 409, no reclaim, no second provider call.
                    raise SlotUnavailable(
                        {"reason": "refine_in_progress"}) from None
                # Claim row vanished mid-wait -> re-attempt the claim.
                continue
        raise SlotUnavailable({"reason": "refine_in_progress"}) from None

    @staticmethod
    def _replay_completed(*, author_id: str, idempotency_key: str,
                          payload_hash: str):
        """Resolve a COMPLETED claim into its replay (or a truthful 409)."""
        winner = AiSuggestion.objects.filter(
            author_id=author_id, idempotency_key=idempotency_key).first()
        if winner is None:
            # Strange state (claim completed but its suggestion was deleted
            # out-of-band, e.g. manually): refuse the key reuse instead of
            # faking a fresh operation.
            raise DuplicateKeyPayloadMismatch(
                {"reason": "duplicate_key_state_mismatch"}) from None
        if winner.payload_hash_hex != payload_hash:
            raise DuplicateKeyPayloadMismatch(
                {"reason": "same_key_different_payload"}) from None
        return winner  # replay of the finished operation

    # -- refine (phase-separated: NO atomic around the provider call) -----------
    def refine(self, *, author_id: str, original_text: str, purpose: str,
               idempotency_key: str,
               input_revision: Optional[int] = None) -> AiSuggestion:
        # Phase 1: validate + consent + replay-check (no provider I/O yet).
        if purpose not in PURPOSES:
            raise InputInvalid({"field": "purpose", "reason": "purpose_not_allowed",
                                "allowed": list(PURPOSES)})
        if not isinstance(original_text, str) or not original_text.strip():
            raise InputInvalid({"field": "original_text", "reason": "empty"})
        if len(original_text) > MAX_TEXT_CHARS:
            raise InputInvalid({"field": "original_text",
                                "reason": "too_long", "max": MAX_TEXT_CHARS})
        input_revision = validate_input_revision(input_revision)

        payload_hash = send_payload_hash(kind="ai_refine", recipient_id="",
                                         body=original_text, reply_to=None,
                                         context_revision=input_revision)

        self._require_consent(str(author_id))

        existing = AiSuggestion.objects.filter(
            author_id=str(author_id), idempotency_key=idempotency_key).first()
        if existing is not None:
            if existing.payload_hash_hex != payload_hash:
                raise DuplicateKeyPayloadMismatch(
                    {"reason": "same_key_different_payload"})
            return existing  # replay: NO second provider call

        # Phase 2: claim the operation slot (R1A2-01, short atomic). A replay
        # here means the operation already finished with the same payload.
        # Otherwise keep the claim IDENTITY: finalize must fence on exactly
        # this row (pk + payload hash), never on author+key alone (N02).
        claim_identity = self._claim_refine_operation(
            author_id=str(author_id), idempotency_key=idempotency_key,
            payload_hash=payload_hash)
        if isinstance(claim_identity, AiSuggestion):
            return claim_identity  # replay of the finished operation
        claim_pk = claim_identity["claim_pk"]

        # Phase 3: provider/network I/O — deliberately OUTSIDE any
        # transaction.atomic (probe-tested: connection.in_atomic_block False).
        result = self._call_provider(text=original_text, purpose=purpose)

        # Phase 4: finalize recheck (C6/F04-T08) — consent and kill switch are
        # re-verified at finalize time; a revoke/kill during the provider wait
        # must NOT bury the provider result as a stored suggestion. The
        # provider call itself is already spent (billed) — that is exactly
        # why nothing may be persisted from it afterwards.
        provider_now = registry.get_ai_provider()
        if provider_now is None or self._kill_switch_active(provider_now):
            raise ModuleUnavailable({"reason": "ai_unavailable_or_off"})
        if not self._consent_granted(str(author_id)):
            raise ConsentRequired(
                {"reason": "ai_processing_consent_required",
                 "purpose": CONSENT_PURPOSE_AI})

        # Phase 5: short atomic finalize — the suggestion insert and the
        # claim's COMPLETED transition commit together; the DB unique
        # constraints are the last race guards. Losing a finalize race replays
        # the winner, never 500s and never creates a second stored operation
        # for the same key.
        #
        # R02 + N02 identity fence (QA 18/10): the claim row is re-verified
        # UNDER LOCK inside this same atomic — by PK, the exact row THIS
        # request claimed, never "any INFLIGHT row with the same author+key".
        # The F15 deletion hook deletes the author's AiSuggestion +
        # AiRefineOperation rows atomically (frozen contract C9), and the TTL
        # reclaim replaces a stale row with a NEW generation row (same key,
        # new pk). If our row is gone or its identity no longer matches, the
        # result is fenced: NOTHING is stored (deletion completed ->
        # suggestion count stays 0) and the next generation's INFLIGHT claim
        # is never completed on our behalf. Locking the claim row first means
        # a deletion racing THIS finalize blocks on the row lock and then
        # deletes both rows — the fence cannot be interleaved into a
        # resurrected row.
        try:
            with transaction.atomic():
                claim = (AiRefineOperation.objects.select_for_update()
                         .filter(pk=claim_pk).first())
                if claim is None:
                    # Outcome of the deletion/reclaim race: OUR claim row no
                    # longer exists (deleted, or replaced by a new generation
                    # after the TTL). The provider call is already spent
                    # (billed) — exactly why nothing may be persisted from
                    # it afterwards (C6 analog of the consent/kill-switch
                    # finalize recheck).
                    raise _RefineFencedByDeletion()
                if claim.payload_hash_hex != payload_hash:
                    # N02: identity binding broken (hash differs under lock)
                    # — this row belongs to a different payload generation;
                    # never write our result onto it.
                    raise _RefineClaimIdentityMismatch()
                if claim.status != STATUS_INFLIGHT:
                    # Our OWN row already reached COMPLETED (a twin finalize
                    # holding the same identity won the race): replay the
                    # stored outcome honestly — never store a second row and
                    # never touch any other claim.
                    winner = AiSuggestion.objects.filter(
                        author_id=str(author_id),
                        idempotency_key=idempotency_key).first()
                    if (winner is None
                            or winner.payload_hash_hex != payload_hash):
                        raise TemporarilyUnavailable(
                            {"reason": "refine_race_unresolved"})
                    return winner
                suggestion = AiSuggestion.objects.create(
                    author_id=str(author_id), purpose=purpose,
                    status=STATUS_SUGGESTED,
                    original_text=original_text,
                    suggested_text=result["suggested_text"],
                    provider_id=result["provider_id"],
                    model_revision=result["model_revision"],
                    prompt_revision=result["prompt_revision"],
                    idempotency_key=idempotency_key,
                    payload_hash_hex=payload_hash,
                    input_revision=input_revision,
                )
                claim.status = STATUS_COMPLETED
                claim.updated_at = dt.datetime.now(tz=UTC)
                claim.save(update_fields=["status", "updated_at"])
                return suggestion
        except _RefineFencedByDeletion:
            # Truthful 503: the operation no longer exists (deletion
            # completed, or the key was TTL-reclaimed into a new generation)
            # — the request must NOT create a suggestion after deletion, and
            # a late result must never land on the next generation's claim.
            raise ModuleUnavailable(
                {"reason": "refine_result_discarded_after_deletion"}) from None
        except _RefineClaimIdentityMismatch:
            # N02 defense-in-depth: the locked row's payload identity no
            # longer matches this request. Drop the result; nothing stored.
            raise ModuleUnavailable(
                {"reason": "refine_claim_identity_mismatch"}) from None
        except IntegrityError:
            winner = AiSuggestion.objects.filter(
                author_id=str(author_id),
                idempotency_key=idempotency_key).first()
            if winner is None:
                # SEC (review S2): do NOT re-raise the original IntegrityError.
                # Its exception chain carries the failed SQL statement whose
                # bound params include original_text — Django's 500 handling
                # could put that author-private sentence into server logs.
                # Surface a truthful 503 instead; nothing was stored.
                raise TemporarilyUnavailable(
                    {"reason": "refine_race_unresolved"}) from None
            if winner.payload_hash_hex != payload_hash:
                raise DuplicateKeyPayloadMismatch(
                    {"reason": "same_key_different_payload"}) from None
            # Replay of the concurrent winner: reconcile ONLY OUR OWN claim
            # row (by pk — N02) so the marker reflects the reached outcome.
            # The old author+key+INFLIGHT update would also complete a NEW
            # generation's claim created after a deletion/TTL reclaim — the
            # same steal path the finalize fence closes.
            AiRefineOperation.objects.filter(
                pk=claim_pk, status=STATUS_INFLIGHT).update(
                status=STATUS_COMPLETED, updated_at=dt.datetime.now(tz=UTC))
            return winner  # replay of the concurrent winner: no second row

    def _get_own(self, *, author_id: str, suggestion_id: str) -> AiSuggestion:
        suggestion = AiSuggestion.objects.filter(pk=suggestion_id).first()
        if suggestion is None or str(suggestion.author_id) != str(author_id):
            raise NotFound({"reason": "suggestion_not_found"})
        return suggestion

    def get_own(self, *, author_id: str, suggestion_id: str) -> AiSuggestion:
        return self._get_own(author_id=author_id, suggestion_id=suggestion_id)

    def list_own(self, *, author_id: str, limit: int = 20):
        return (AiSuggestion.objects.filter(author_id=str(author_id))
                .order_by("-created_at", "-id")[: max(1, min(limit, 20))])

    @transaction.atomic
    def decide(self, *, author_id: str, suggestion_id: str,
               decision: str) -> AiSuggestion:
        if decision not in (STATUS_ACCEPTED, STATUS_DISCARDED):
            raise InputInvalid({"field": "decision", "reason": "invalid_decision"})
        suggestion = self._get_own(author_id=author_id,
                                   suggestion_id=suggestion_id)
        if suggestion.status != STATUS_SUGGESTED:
            return suggestion  # one-way, idempotent
        suggestion.status = decision
        suggestion.decided_at = dt.datetime.now(tz=UTC)
        suggestion.save(update_fields=["status", "decided_at"])
        return suggestion

    def status(self) -> Dict[str, Any]:
        """Truthful availability: provider wired AND kill switch inactive.
        Nothing about quality or approval."""
        provider = registry.get_ai_provider()
        if provider is None or self._kill_switch_active(provider):
            return {"ai_enabled": False}
        return {"ai_enabled": True}
