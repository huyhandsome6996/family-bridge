"""F07 mood grant provider — the REAL item_type="mood_entry" provider
registered on the F15 policy registry at app startup (apps.py).

Protocol (f15_privacy.services.registry.register_grant_provider): a module
exposing list_grants(owner_id), revoke_grant(owner_id, item_id,
recipient_id), can_view(owner_id, item_id, recipient_id, revision).

Fail-closed rules:
- can_view returns False on ANY drift (revoked / revision stale / connection
  missing, changed identity or generation) and when the connection reader
  dependency is absent — F15 and other consumers can never get a yes from a
  broken wiring.
- list_grants lists only grants that are STILL readable (revision current,
  connection current), bounded — the privacy overview never advertises a
  share the recipient can no longer read.
"""

from __future__ import annotations

import datetime as dt
from typing import Any, Dict, List, Optional

from family_bridge_core.timeutils import UTC

from ..models import MoodShare
from . import registry
from .mood import MoodShareService

MAX_PROVIDED_GRANTS = 200  # bounded overview contribution (DSA-05)


def _now() -> dt.datetime:
    return dt.datetime.now(tz=UTC)


def _readable(rows) -> List[MoodShare]:
    if not rows:
        return []
    reader = registry.get_connection_reader()
    if reader is None:
        return []
    verdicts = MoodShareService._connections_current(reader, rows)
    return [row for row in rows
            if verdicts.get(str(row.recipient_id), {}).get(str(row.pk))]


def list_grants(*, owner_id: str) -> List[Dict[str, Any]]:
    """Grants of ONE owner that are still readable by their recipients
    (unrevoked + revision current + connection current), bounded."""
    from django.db.models import F
    rows = list(MoodShare.objects.filter(
        owner_id=str(owner_id), revoked_at__isnull=True,
        approved_revision=F("entry__revision"))
        .select_related("entry").order_by("-created_at")[:MAX_PROVIDED_GRANTS])
    return [{
        "item_id": str(row.entry_id),
        "recipient_id": str(row.recipient_id),
        "approved_revision": row.approved_revision,
        "revoked": False,
    } for row in _readable(rows)]


def revoke_grant(*, owner_id: str, item_id: str,
                 recipient_id: Optional[str] = None) -> Dict[str, Any]:
    """Revoke one grant (or every recipient of the item when recipient_id
    is None). Idempotent; truthful found/revoked outcome."""
    qs = MoodShare.objects.filter(owner_id=str(owner_id), entry_id=str(item_id))
    if recipient_id:
        qs = qs.filter(recipient_id=str(recipient_id))
    found = qs.exists()
    changed = 0
    if found:
        changed = qs.filter(revoked_at__isnull=True).update(revoked_at=_now())
    return {"found": bool(found), "revoked": bool(changed),
            "detail": f"mood grants revoked: {changed}"}


def can_view(*, owner_id: str, item_id: str, recipient_id: str,
             revision: int) -> bool:
    """Deny-by-default item authorization for ONE (item, recipient,
    revision). The connection identity/generation recorded at share time
    must still be the CURRENT active connection."""
    share = (MoodShare.objects.select_related("entry").filter(
        owner_id=str(owner_id), entry_id=str(item_id),
        recipient_id=str(recipient_id), approved_revision=int(revision),
        revoked_at__isnull=True).first())
    if share is None or share.entry.revision != int(revision):
        return False
    reader = registry.get_connection_reader()
    if reader is None:
        return False
    connection = reader.active_connection_between(user_a=str(owner_id),
                                                  user_b=str(recipient_id))
    if connection is None:
        return False
    return (str(getattr(connection, "connection_id", ""))
            == str(share.connection_id)
            and int(getattr(connection, "generation", 0) or 0)
            == int(share.connection_generation))
