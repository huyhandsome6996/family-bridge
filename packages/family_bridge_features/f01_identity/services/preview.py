"""Read-only invite preview: check WHO created a code BEFORE accepting.

Review fix ("XÁC NHẬN ĐÚNG NGƯỜI"): the claim endpoint binds the candidate
and counts as the candidate's acceptance in one step, so the requester had no
chance to verify the inviter first. This service answers
"mã này của ai, mời quan hệ gì" WITHOUT any state change — the decision to
accept stays an explicit POST /connections/invites/claim.

Safety properties (mirror the claim path read-only; claim remains the
single write authority):
- Same anti-enumeration reply `invalid_or_expired_code` for unknown,
  expired, closed (declined/canceled) and already-consumed codes.
- Self-code preview answers self_connect_denied (same as claim would).
- Pair with an active connection answers already_connected (same as claim).
- Rate limiting reuses ClaimRateGuard so previews and claims SHARE the same
  per-actor hourly budget (a code-entering attempt is a code-entering
  attempt, SEC-14).
- Read-only by construction: no .save(), no update(), no create() here.
- This file imports from services/invites.py but never edits it (W036
  ownership: review/full-product-integration owns invites.py uniqueness).
"""

from __future__ import annotations

import datetime as dt
from typing import Optional

from family_bridge_core.errors import InputInvalid, NotFound
from family_bridge_core.timeutils import UTC

from ..models import (
    ConnectionInvite, INVITE_AWAITING, INVITE_PENDING, hash_token,
)
from .invites import ClaimRateGuard, InviteService


def preview_invite(*, candidate, raw_code: str,
                   rate_guard: Optional[ClaimRateGuard] = None,
                   clock=None) -> dict:
    """Return the minimal open-invite metadata for a code holder.

    Returns {invite_id, relationship_kind, status, expires_at} — the view
    layer attaches the inviter's self-declared display profile. No state is
    mutated and the response intentionally contains no code/secret.
    """
    now = clock.now() if clock else dt.datetime.now(tz=UTC)
    if rate_guard is not None:
        rate_guard.check_and_record(actor_id=str(candidate.pk), now=now)
    if not isinstance(raw_code, str):
        raise NotFound({"reason": "invalid_or_expired_code"})
    normalized = raw_code.strip().upper()
    if not normalized:
        raise NotFound({"reason": "invalid_or_expired_code"})

    invite = (ConnectionInvite.objects
              .filter(code_hash=hash_token(normalized))
              .first())
    if invite is None or invite.is_expired(now):
        # Anti-enumeration: identical reply for unknown/expired/closed codes.
        raise NotFound({"reason": "invalid_or_expired_code"})
    if invite.status not in {INVITE_PENDING, INVITE_AWAITING}:
        raise NotFound({"reason": "invalid_or_expired_code"})
    if str(invite.inviter_id) == str(candidate.pk):
        raise InputInvalid({"reason": "self_connect_denied"})
    if (invite.candidate_id is not None
            and str(invite.candidate_id) != str(candidate.pk)):
        # single-use: another candidate already consumed this code
        raise NotFound({"reason": "invalid_or_expired_code"})
    if InviteService._pair_has_active_connection(invite.inviter_id, candidate.pk):
        raise InputInvalid({"reason": "already_connected"})
    return {
        "invite_id": str(invite.id),
        # Internal hand-off for the view layer (replaced by a display
        # profile before responding; never sent raw to the client).
        "inviter_user_id": str(invite.inviter_id),
        "relationship_kind": invite.relationship_kind,
        "status": invite.status,
        "expires_at": invite.expires_at.isoformat(),
    }


__all__ = ["preview_invite"]
