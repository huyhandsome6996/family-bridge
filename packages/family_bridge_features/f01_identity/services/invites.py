"""Invite + connection service (US-013, FL-02/03, SEC-06/15, WF-08).

Flow: inviter creates code (raw shown ONCE, SHA-256 stored) -> candidate
claims (binds candidate, candidate_confirmed_at) -> inviter confirms the
bound candidate -> Connection activates in ONE transaction with canonical
pair + generation. Decline/cancel/expiry never activate. Reconnection is a
new invite with generation = last_generation + 1; revoked grants/history do
not revive (F15 owns grants; F01 exposes ConnectionReader).
"""

from __future__ import annotations

import datetime as dt
import hashlib
import secrets
from typing import Optional

from django.db import transaction
from django.db.models import Q

from family_bridge_core.errors import (
    InputInvalid, NotAuthorized, NotFound, RevisionConflict, RateLimited,
)
from family_bridge_core.timeutils import UTC

from ..models import (
    CONNECTION_ACTIVE, CONNECTION_REVOKED,
    INVITE_ACTIVE, INVITE_AWAITING, INVITE_CANCELED, INVITE_DECLINED,
    INVITE_EXPIRED, INVITE_PENDING, RELATIONSHIP_BACKUP, RELATIONSHIP_PRIMARY,
    Connection, ConnectionInvite, hash_token,
)

INVITE_TTL_SECONDS = 7 * 24 * 3600   # P-03 provisional (DEC-17 open)
CLAIM_RATE_LIMIT_PER_HOUR = 30       # anti brute-force (SEC-14)

_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no I/1/O/0 confusion


class InviteService:
    def __init__(self, *, clock=None, ttl_seconds: int = INVITE_TTL_SECONDS) -> None:
        self.clock = clock
        self.ttl_seconds = ttl_seconds

    def _now(self) -> dt.datetime:
        return self.clock.now() if self.clock else dt.datetime.now(tz=UTC)

    # -- create ---------------------------------------------------------------
    @transaction.atomic
    def create_invite(self, *, inviter, relationship_kind: str):
        if relationship_kind not in (RELATIONSHIP_PRIMARY, RELATIONSHIP_BACKUP):
            raise InputInvalid({"field": "relationship_kind", "reason": "invalid_enum"})
        now = self._now()
        raw_code = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(12))
        invite = ConnectionInvite.objects.create(
            inviter=inviter,
            code_hash=hash_token(raw_code),
            relationship_kind=relationship_kind,
            status=INVITE_PENDING,
            expires_at=now + dt.timedelta(seconds=self.ttl_seconds),
        )
        # Open invitations for the same pair/kind are closed to keep one live
        # invite per inviter+kind (prevents ambiguous confirm targets).
        (ConnectionInvite.objects
         .filter(inviter=inviter, relationship_kind=relationship_kind,
                 status__in=[INVITE_PENDING, INVITE_AWAITING])
         .exclude(pk=invite.pk)
         .update(status=INVITE_CANCELED, closed_at=now))
        return invite, raw_code

    # -- claim (candidate side) ----------------------------------------------
    @transaction.atomic
    def claim_invite(self, *, candidate, raw_code: str,
                     rate_guard: Optional[ClaimRateGuard] = None):
        """Candidate binds themselves and confirms. Rate-limited when guard given."""
        if rate_guard is not None:
            rate_guard.check_and_record(actor_id=str(candidate.pk), now=self._now())
        if not isinstance(raw_code, str):
            raise NotFound({"reason": "invalid_or_expired_code"})
        normalized = raw_code.strip().upper()
        if not normalized:
            raise NotFound({"reason": "invalid_or_expired_code"})
        code_hash = hash_token(normalized)
        now = self._now()

        invite = (ConnectionInvite.objects
                  .select_for_update()
                  .filter(code_hash=code_hash)
                  .first())
        if invite is None or invite.is_expired(now):
            # Anti-enumeration: same reply for unknown/expired/closed codes.
            raise NotFound({"reason": "invalid_or_expired_code"})
        if invite.status in {INVITE_DECLINED, INVITE_CANCELED, INVITE_EXPIRED}:
            raise NotFound({"reason": "invalid_or_expired_code"})
        if str(invite.inviter_id) == str(candidate.pk):
            raise InputInvalid({"reason": "self_connect_denied"})
        if invite.candidate_id is not None and str(invite.candidate_id) != str(candidate.pk):
            # single-use: another candidate already claimed
            raise NotFound({"reason": "invalid_or_expired_code"})
        if self._pair_has_active_connection(invite.inviter_id, candidate.pk):
            raise InputInvalid({"reason": "already_connected"})
        if invite.status == INVITE_AWAITING:
            # Same candidate re-claim: idempotent replay.
            return invite
        invite.candidate = candidate
        invite.candidate_confirmed_at = now
        invite.status = INVITE_AWAITING
        invite.revision += 1
        invite.save(update_fields=["candidate", "candidate_confirmed_at",
                                   "status", "revision"])
        return invite

    # -- confirm (inviter side) ----------------------------------------------
    @transaction.atomic
    def inviter_confirm(self, *, inviter, invite_id: str,
                        expected_revision: Optional[int] = None):
        """Inviter confirms the bound candidate; activates the connection."""
        now = self._now()
        invite = (ConnectionInvite.objects
                  .select_for_update()
                  .filter(pk=invite_id).first())
        if invite is None or str(invite.inviter_id) != str(inviter.pk):
            # Not the inviter's invitation -> do not leak existence.
            raise NotFound({"reason": "invite_not_found"})
        if invite.is_expired(now):
            if invite.status not in {INVITE_DECLINED, INVITE_CANCELED}:
                invite.status = INVITE_EXPIRED
                invite.closed_at = now
                invite.save(update_fields=["status", "closed_at"])
            raise NotFound({"reason": "invalid_or_expired_code"})
        if invite.status == INVITE_PENDING:
            raise InputInvalid({"reason": "candidate_not_claimed_yet"})
        if invite.status != INVITE_AWAITING:
            raise InputInvalid({"reason": "invite_not_confirmable",
                                "status": invite.status})
        if expected_revision is not None and expected_revision != invite.revision:
            raise RevisionConflict({"current_revision": invite.revision})
        if self._pair_has_active_connection(invite.inviter_id, invite.candidate_id):
            raise InputInvalid({"reason": "already_connected"})

        invite.inviter_confirmed_at = now
        invite.status = INVITE_ACTIVE
        invite.revision += 1
        invite.save(update_fields=["inviter_confirmed_at", "status", "revision"])

        generation = self._next_generation(invite.inviter_id, invite.candidate_id)
        low_id, high_id = sorted([str(invite.inviter_id), str(invite.candidate_id)])
        from django.contrib.auth import get_user_model
        from django.db import IntegrityError
        User = get_user_model()
        try:
            connection = Connection.objects.create(
                party_low=User.objects.get(pk=low_id),
                party_high=User.objects.get(pk=high_id),
                invite=invite,
                relationship_kind=invite.relationship_kind,
                status=CONNECTION_ACTIVE,
                generation=generation,
            )
        except IntegrityError:
            raise InputInvalid({"reason": "already_connected"})
        return invite, connection

    # -- decline / cancel ------------------------------------------------------
    @transaction.atomic
    def candidate_decline(self, *, candidate, invite_id: str):
        now = self._now()
        invite = (ConnectionInvite.objects.select_for_update()
                  .filter(pk=invite_id).first())
        if invite is None or str(invite.candidate_id) != str(candidate.pk):
            raise NotFound({"reason": "invite_not_found"})
        if invite.status not in {INVITE_PENDING, INVITE_AWAITING}:
            raise InputInvalid({"reason": "invite_not_open"})
        invite.status = INVITE_DECLINED
        invite.closed_at = now
        invite.save(update_fields=["status", "closed_at"])
        return invite

    @transaction.atomic
    def inviter_cancel(self, *, inviter, invite_id: str):
        now = self._now()
        invite = (ConnectionInvite.objects.select_for_update()
                  .filter(pk=invite_id).first())
        if invite is None or str(invite.inviter_id) != str(inviter.pk):
            raise NotFound({"reason": "invite_not_found"})
        if invite.status not in {INVITE_PENDING, INVITE_AWAITING}:
            raise InputInvalid({"reason": "invite_not_open"})
        invite.status = INVITE_CANCELED
        invite.closed_at = now
        invite.save(update_fields=["status", "closed_at"])
        return invite

    # -- connections ------------------------------------------------------------
    @transaction.atomic
    def revoke_connection(self, *, actor, connection_id: str):
        """Unlink: atomic, generation stays; reconnect = new generation."""
        now = self._now()
        connection = (Connection.objects.select_for_update()
                      .filter(pk=connection_id).first())
        if connection is None or not connection.involves(actor.pk):
            raise NotFound({"reason": "connection_not_found"})
        if connection.status == CONNECTION_REVOKED:
            return connection  # idempotent
        connection.status = CONNECTION_REVOKED
        connection.revoked_at = now
        connection.revision += 1
        connection.save(update_fields=["status", "revoked_at", "revision"])
        return connection

    @staticmethod
    def _pair_has_active_connection(user_a, user_b) -> bool:
        low_id, high_id = sorted([str(user_a), str(user_b)])
        return Connection.objects.filter(
            party_low_id=low_id, party_high_id=high_id,
            status=CONNECTION_ACTIVE).exists()

    @staticmethod
    def _next_generation(user_a, user_b) -> int:
        low_id, high_id = sorted([str(user_a), str(user_b)])
        last = (Connection.objects
                .filter(party_low_id=low_id, party_high_id=high_id)
                .order_by("-generation").first())
        return (last.generation + 1) if last else 1

    # -- readers (ConnectionReader port) ----------------------------------------
    def active_connection_between(self, *, user_a: str, user_b: str):
        low_id, high_id = sorted([str(user_a), str(user_b)])
        connection = Connection.objects.filter(
            party_low_id=low_id, party_high_id=high_id,
            status=CONNECTION_ACTIVE).first()
        return connection.view() if connection else None

    def get_connection(self, *, connection_id: str):
        connection = Connection.objects.filter(pk=connection_id).first()
        return connection.view() if connection else None

    def list_active_for_user(self, *, user_id: str):
        rows = Connection.objects.filter(
            Q(party_low_id=str(user_id)) | Q(party_high_id=str(user_id)),
            status=CONNECTION_ACTIVE).order_by("created_at", "id")
        return [row.view() for row in rows]


class ClaimRateGuard:
    """In-DB sliding-window guard for code claims (SEC-14). Process-local
    cache is insufficient for multi-instance; this records attempts per actor
    in the DB so MySQL deployments share the limit. Test hook included."""

    def __init__(self, *, max_attempts: int = CLAIM_RATE_LIMIT_PER_HOUR) -> None:
        self.max_attempts = max_attempts

    def check_and_record(self, *, actor_id: str, now: dt.datetime) -> None:
        from ..models import ClaimAttempt
        window_start = now - dt.timedelta(hours=1)
        recent = ClaimAttempt.objects.filter(
            actor_id=str(actor_id), attempted_at__gte=window_start).count()
        if recent >= self.max_attempts:
            raise RateLimited({"reason": "too_many_claim_attempts"})
        ClaimAttempt.objects.create(actor_id=str(actor_id), attempted_at=now)
