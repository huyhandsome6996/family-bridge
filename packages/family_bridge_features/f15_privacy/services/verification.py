"""Deletion-request verification/processing authorization (DEC-14/18 OPEN).

State of the world: the decision register keeps DEC-14 (step-up/identity
re-check) and DEC-18 (who verifies/processes) OPEN, and B16's runtime has no
``privacy.case`` capability yet. Therefore the PRODUCTION authorizer is
fail-closed:

- Without a configured authorizer, verify/process endpoints answer 503
  ``module_unavailable`` (never a fake success, never a UI checkbox).
- An empty or malformed actor id fails closed the same way (503
  ``handler_not_authorized``) BEFORE any query — a UUID filter on garbage
  must never crash into a 500.
- The admin-core-backed authorizer reads B16 ``AdminCapabilityGrant`` rows
  with capability ``privacy.case`` (CAP-20). Until B16 owns the code constant
  and can grant it, no admin can pass: integration pending, recorded in the
  report's patch map. ``is_staff``/``dashboard.read`` are NEVER accepted.
- Tests inject a synthetic authorizer explicitly; production wiring registers
  the capability-backed one only when admin_core is installed.
"""

from __future__ import annotations

import uuid as uuid_module

from family_bridge_core.errors import ModuleUnavailable

from . import ports

CAP_PRIVACY_CASE = "privacy.case"

# Actions a handler may perform on a deletion request.
ACTION_VERIFY = "verify"
ACTION_PROCESS = "process"


class AdminCapabilityAuthorizer:
    """B16-backed handler authorization (fail-closed by construction)."""

    def authorize(self, *, actor_id: str, action: str, request_id: str) -> bool:
        if action not in {ACTION_VERIFY, ACTION_PROCESS}:
            return False
        # Fail-closed BEFORE any query (P2 fix, QA-1): the grant filter is a
        # UUID lookup — an empty/malformed actor used to crash into a 500
        # (UUIDField ValidationError). A handler decision without a
        # trustworthy actor identity is "not authorized" by contract, so it
        # raises the same 503 ``handler_not_authorized`` envelope the service
        # answers with on the deny path — never a crash, never a fake yes.
        actor = str(actor_id or "").strip()
        try:
            uuid_module.UUID(actor)
        except (ValueError, AttributeError, TypeError):
            raise ModuleUnavailable({"reason": "handler_not_authorized"})
        try:
            from family_bridge_features.admin_core.models import AdminCapabilityGrant
        except ImportError:
            return False  # admin_core not installed: fail closed
        import datetime as _dt

        from django.db import OperationalError
        from django.db.models import Q

        from family_bridge_core.timeutils import UTC

        try:
            now = _dt.datetime.now(tz=UTC)
            grant = (AdminCapabilityGrant.objects
                     .filter(Q(user_id=str(actor_id), capability=CAP_PRIVACY_CASE,
                               revoked_at__isnull=True, expires_at__isnull=True)
                             | Q(user_id=str(actor_id), capability=CAP_PRIVACY_CASE,
                                 revoked_at__isnull=True, expires_at__gt=now))
                     .order_by("-granted_at").first())
        except OperationalError:
            # admin_core present but its tables not migrated in this runtime:
            # fail closed (never crash into a 500, never fake authority).
            return False
        if grant is None:
            return False
        # Coarse scope only: admin_core SCOPE_TYPES (global/school) cannot yet
        # express per-case assignment — recorded as a B16 dependency (CAP-20).
        # A school/global grant cannot authorize an arbitrary privacy case.
        # B16 must implement the named per-case assignment before processing.
        return (grant.scope_type == "assigned_resource"
                and str(grant.scope_ref) == str(request_id))


def authorize_handler_action(*, actor_id: str = "", action: str,
                            request_id: str, authorizer=None) -> bool:
    """Resolve the authorizer (injected > registered) and authorize."""
    resolved = authorizer if authorizer is not None else ports.get_handler_authorizer()
    if resolved is None:
        return False  # fail-closed: no authorizer configured
    return bool(resolved.authorize(actor_id=str(actor_id), action=str(action),
                                   request_id=str(request_id)))
