"""Production grant providers for F15 over the F07 (MoodShare) and F08
(JournalShare) domain tables.

Protocol (``services.registry``): module-level ``list_grants`` /
``revoke_grant`` / ``can_view`` for exactly one item_type.

Invariants implemented here (SEC-03/08, WF-04, DEC-04):
- deny-by-default: no grant row -> False; wrong recipient/revision -> False;
- grants bind (item, recipient, approved_revision) AND the connection
  identity+generation AT SHARE TIME — a reconnect (new generation) never
  revives an old grant even though a NEW active connection exists;
- revoke is owner-only, idempotent, and honours ``expected_revision``
  (optimistic concurrency on the grant's approved_revision: stale -> 409);
- every list is bounded and stably ordered (no unbounded scans, DSA rules).

The connection binding check uses the connection reader port registered in
``services.ports`` (production: F01 InviteService). A missing reader means
we cannot verify the CURRENT connection state -> deny (fail-closed).
"""

from __future__ import annotations

import datetime as dt
from typing import Any, Dict, List, Optional

from family_bridge_core.errors import RevisionConflict
from family_bridge_core.timeutils import UTC

from . import ports

_LIST_HARD_BOUND = 100  # per-provider bound; overview paginates on top


def _now() -> dt.datetime:
    return dt.datetime.now(tz=UTC)


class ShareGrantProvider:
    """Adapter for one share model (F07 MoodShare / F08 JournalShare)."""

    def __init__(self, *, item_type: str, model, item_field: str,
                 owner_field: str = "owner_id",
                 recipient_field: str = "recipient_id") -> None:
        self.item_type = item_type
        self.model = model
        self.item_field = item_field      # domain item FK attname (entry_id/page_id)
        self.owner_field = owner_field
        self.recipient_field = recipient_field

    # -- list -------------------------------------------------------------------
    def list_grants(self, *, owner_id: str, limit: int = _LIST_HARD_BOUND,
                    after_created_at=None, after_share_id=None) -> List[Dict[str, Any]]:
        """Owner's grants for this item_type, newest first, bounded.

        R09 fix: the cursor filter runs in the DATABASE (before LIMIT) so
        pagination reaches EVERY grant — the old implementation always took
        the newest 100 rows and Python-filtered, silently capping large
        domains at 100 items.

        Each row carries ``share_id`` + ``connection_generation`` so the
        overview can show stale (connection-changed) grants truthfully.
        ``after_created_at``/``after_share_id`` form the exclusive SQL cursor
        (created_at, id) matching the provider's stable ORDER BY."""
        limit = max(1, min(int(limit), _LIST_HARD_BOUND))
        qs = (self.model.objects
              .filter(**{self.owner_field: str(owner_id)}))
        if after_created_at is not None and after_share_id is not None:
            from django.db.models import Q
            from family_bridge_core.timeutils import parse_iso
            after_at = (parse_iso(str(after_created_at))
                        if not isinstance(after_created_at, dt.datetime)
                        else after_created_at)
            qs = qs.filter(
                Q(created_at__lt=after_at)
                | Q(created_at=after_at, id__lt=str(after_share_id)))
        rows = (qs.order_by("-created_at", "-id")
                .values("id", self.item_field, self.recipient_field,
                        "approved_revision", "revoked_at", "created_at",
                        "connection_id", "connection_generation")
                [:limit])
        grants: List[Dict[str, Any]] = []
        for row in rows:
            grants.append({
                "item_type": self.item_type,
                "item_id": str(row[self.item_field]),
                "share_id": str(row["id"]),
                "recipient_id": str(row[self.recipient_field]),
                "approved_revision": row["approved_revision"],
                "revoked": row["revoked_at"] is not None,
                "created_at": row["created_at"].isoformat()
                if row["created_at"] else None,
                "connection_id": row["connection_id"],
                "connection_generation": row["connection_generation"],
            })
        return grants

    # -- revoke -------------------------------------------------------------------
    def revoke_grant(self, *, owner_id: str, item_id: str,
                     recipient_id: Optional[str],
                     expected_revision: Optional[int] = None) -> Dict[str, Any]:
        """Owner-only revoke; idempotent; validates expected_revision against
        the grant's approved_revision (stale -> RevisionConflict/409).

        Returns {"found": bool, "revoked": bool} — "revoked" is True only
        when this call actually flipped a live grant (first time).
        """
        from django.db import transaction

        with transaction.atomic():
            rows = (self.model.objects.select_for_update()
                    .filter(**{self.owner_field: str(owner_id),
                               self.item_field: item_id}))
            if recipient_id:
                rows = rows.filter(**{self.recipient_field: str(recipient_id)})
            found = rows.exists()
            if not found:
                return {"found": False, "revoked": False}
            if expected_revision is not None:
                revisions = set(rows.values_list("approved_revision", flat=True))
                if int(expected_revision) not in revisions:
                    raise RevisionConflict({
                        "reason": "grant_revision_mismatch",
                        "expected_revision": int(expected_revision),
                    })
            changed = rows.filter(revoked_at__isnull=True).update(
                revoked_at=_now())
        return {"found": True, "revoked": changed > 0}

    # -- read policy ------------------------------------------------------------
    def can_view(self, *, owner_id: str, item_id: str, recipient_id: str,
                 revision: int) -> bool:
        """True only when an unrevoked grant covers exactly
        (item, recipient, approved_revision) AND that grant's recorded
        connection is STILL the active connection at the SAME generation."""
        row = (self.model.objects
               .filter(**{self.owner_field: str(owner_id),
                          self.item_field: item_id,
                          self.recipient_field: str(recipient_id),
                          "approved_revision": int(revision),
                          "revoked_at__isnull": True})
               .order_by("-created_at", "-id")
               .values("id", "connection_id", "connection_generation")
               .first())
        if row is None:
            return False
        reader = ports.get_connection_reader()
        if reader is None:
            return False  # cannot verify current connection state: deny
        connection = reader.active_connection_between(
            user_a=str(owner_id), user_b=str(recipient_id))
        if connection is None:
            return False
        if str(getattr(connection, "connection_id", "")) != str(row["connection_id"]):
            return False
        return int(getattr(connection, "generation", -1)) == int(row["connection_generation"])

    # -- helpers used by connection revocation -----------------------------------
    def grants_between(self, *, user_a: str, user_b: str,
                       limit: int = 50) -> List[Dict[str, Any]]:
        """Live grants in either direction of the pair (bounded). Each ref
        carries its OWNER so replay per party can process only its own."""
        limit = max(0, min(int(limit), 50))
        out: List[Dict[str, Any]] = []
        if limit == 0:
            return out
        rows = (self.model.objects
                .filter(revoked_at__isnull=True)
                .filter(**{self.owner_field: str(user_a),
                           self.recipient_field: str(user_b)})
                .values("id", self.item_field, self.owner_field,
                        self.recipient_field)[:limit])
        for row in rows:
            out.append({"item_type": self.item_type,
                        "item_id": str(row[self.item_field]),
                        "owner_id": str(row[self.owner_field]),
                        "recipient_id": str(row[self.recipient_field])})
        if len(out) < limit:
            remaining = limit - len(out)
            rows = (self.model.objects
                    .filter(revoked_at__isnull=True)
                    .filter(**{self.owner_field: str(user_b),
                               self.recipient_field: str(user_a)})
                    .values("id", self.item_field, self.owner_field,
                            self.recipient_field)[:remaining])
            for row in rows:
                out.append({"item_type": self.item_type,
                            "item_id": str(row[self.item_field]),
                            "owner_id": str(row[self.owner_field]),
                            "recipient_id": str(row[self.recipient_field])})
        return out

    def revoke_grants_between(self, *, user_a: str, user_b: str,
                              connection_id: Optional[str] = None,
                              connection_generation: Optional[int] = None) -> int:
        """Revoke live grants in either direction of the pair; returns the
        number of rows actually changed. R08 fix: optional exact-scope
        filters (connection identity + generation) let REPLAY re-revoke only
        the grants of the revoked connection — never a different connection's
        grants. The live disconnect path passes no filter (every live grant
        between the pair dies, as before)."""
        changed = 0
        for direction in ((user_a, user_b), (user_b, user_a)):
            qs = (self.model.objects
                  .filter(revoked_at__isnull=True)
                  .filter(**{self.owner_field: str(direction[0]),
                             self.recipient_field: str(direction[1])}))
            if connection_id is not None:
                qs = qs.filter(connection_id=str(connection_id))
            if connection_generation is not None:
                qs = qs.filter(connection_generation=int(connection_generation))
            changed += qs.update(revoked_at=_now())
        return changed


def _load_share_model(dotted: str):
    from importlib import import_module
    module_path, _, attr = dotted.rpartition(".")
    return getattr(import_module(module_path), attr)


_MOOD_MODEL = ("family_bridge_features.f07_mood.models", "MoodShare")
_JOURNAL_MODEL = ("family_bridge_features.f08_journal.models", "JournalShare")


def _build():
    mood_model = _load_share_model(".".join(_MOOD_MODEL))
    journal_model = _load_share_model(".".join(_JOURNAL_MODEL))
    return {
        "mood_entry": ShareGrantProvider(item_type="mood_entry", model=mood_model,
                                         item_field="entry_id"),
        "journal_page": ShareGrantProvider(item_type="journal_page", model=journal_model,
                                           item_field="page_id"),
    }


_PROVIDERS: Dict[str, ShareGrantProvider] = {}


def configure() -> None:
    """Idempotent: build module-level provider singletons (F07/F08 importable)."""
    if not _PROVIDERS:
        _PROVIDERS.update(_build())


def __getattr__(name: str):
    """PEP 562: expose ``mood_entry_provider`` / ``journal_page_provider`` as
    lazily-built module-level singletons so registry dotted-path resolution
    finds ready instances without importing F07/F08 at package import time."""
    attr_to_key = {"mood_entry_provider": "mood_entry",
                   "journal_page_provider": "journal_page"}
    if name in attr_to_key:
        configure()
        return _PROVIDERS[attr_to_key[name]]
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def all_providers() -> Dict[str, ShareGrantProvider]:
    configure()
    return dict(_PROVIDERS)


def revoke_grants_between(*, user_a: str, user_b: str,
                          connection_id: Optional[str] = None,
                          connection_generation: Optional[int] = None) -> int:
    """Revoke every live grant between the pair across providers (used when
    the F01 connection is revoked, and by restore replay with the exact
    connection scope). R08 fix: returns the COUNT of grants actually
    revoked (previously it returned a ≤50-per-provider snapshot list while
    the provider updated ALL rows — the refs could not represent the real
    scope). Ledger payloads no longer embed refs; they carry the connection
    identity scope instead."""
    changed = 0
    for item_type, provider in all_providers().items():
        changed += provider.revoke_grants_between(
            user_a=str(user_a), user_b=str(user_b),
            connection_id=connection_id,
            connection_generation=connection_generation)
    return changed
