"""F15 registries: deletion hooks + grant providers (explicit allowlist).

B15 owns the POLICY + DELETION machinery. Domain features (F07 mood,
F08 journal, F05 messages, F04 AI, ...) register:
- deletion hooks: dotted path implementing DeletionHook protocol
  (apply_user_deletion), executed per category with truthful outcomes;
- grant providers: dotted path of a module exposing
  `list_grants(owner_id)`, `revoke_grant(owner_id, item_id, recipient_id)`,
  `can_view(owner_id, item_id, recipient_id, revision)` for one item_type.

Registration is validated (importable dotted path, protocol match) and the
registry is a plain dict — no plugin upload, no eval (WF-22).

Production providers (F07/F08 share tables) are registered at app startup by
``services.wiring``; tests may register the labgrants fixtures instead.
"""

from __future__ import annotations

import importlib
import inspect
from typing import Any, Dict, List, Optional

from django.db import transaction

from family_bridge_core.errors import InputInvalid, ModuleUnavailable, NotFound

from . import ports as _ports

_DELETION_HOOKS: Dict[str, str] = {}          # category -> dotted path
_GRANT_PROVIDERS: Dict[str, str] = {}         # item_type -> dotted path


def _resolve(dotted: str):
    if not isinstance(dotted, str) or "." not in dotted or "/" in dotted \
            or any(ch in dotted for ch in " ;:$!{}"):
        raise ValueError("invalid dotted path")
    module_path, _, attr = dotted.rpartition(".")
    module = importlib.import_module(module_path)
    return getattr(module, attr)


def register_deletion_hook(category: str, dotted_path: str) -> None:
    if category not in {"account", "connections", "mood", "journal", "drafts",
                        "messages", "ai", "surveys", "program_progress",
                        "appointments"}:
        raise ValueError(f"unknown deletion category {category}")
    hook = _resolve(dotted_path)
    if not callable(getattr(hook, "apply_user_deletion", None)):
        raise ValueError("hook must implement apply_user_deletion")
    _DELETION_HOOKS[category] = dotted_path


def register_grant_provider(item_type: str, dotted_path: str) -> None:
    if not item_type or not item_type.replace("_", "").isalnum():
        raise ValueError("invalid item_type")
    provider = _resolve(dotted_path)
    for required in ("list_grants", "revoke_grant", "can_view"):
        if not callable(getattr(provider, required, None)):
            raise ValueError(f"provider must implement {required}")
    _GRANT_PROVIDERS[item_type] = dotted_path


def reset_registries() -> None:
    """TEST-ONLY: clear registrations between test cases."""
    _DELETION_HOOKS.clear()
    _GRANT_PROVIDERS.clear()


def get_deletion_hook(category: str):
    dotted = _DELETION_HOOKS.get(category)
    if dotted is None:
        return None
    return _resolve(dotted)


def get_grant_provider(item_type: str):
    dotted = _GRANT_PROVIDERS.get(item_type)
    if dotted is None:
        return None
    return _resolve(dotted)


def registered_categories() -> List[str]:
    return sorted(_DELETION_HOOKS)


def registered_item_types() -> List[str]:
    return sorted(_GRANT_PROVIDERS)


def _supports_kwarg(func, name: str) -> bool:
    try:
        parameters = inspect.signature(func).parameters
    except (TypeError, ValueError):
        return False
    if name in parameters:
        return True
    return any(parameters[p].kind is inspect.Parameter.VAR_KEYWORD
               for p in parameters)


def provider_accepts(provider, method_name: str, kwarg: str) -> bool:
    """True when ``provider.<method>`` can receive ``kwarg`` (providers from
    different packages evolve at different speeds; callers degrade"""
    func = getattr(provider, method_name, None)
    return callable(func) and _supports_kwarg(func, kwarg)


def revoke_grant(*, owner_id: str, item_type: str, item_id: str,
                 recipient_id: Optional[str] = None,
                 actor_ref: str = "owner",
                 expected_revision: Optional[int] = None,
                 write_ledger: bool = True) -> Dict[str, Any]:
    """Revoke one grant (or all recipients when recipient_id None).

    - Mutation + ledger event happen in ONE transaction: a failed ledger
      write rolls the grant change back (never a grant ahead of the ledger).
    - ``expected_revision`` (when provided) is validated against the grant's
      bound item revision; providers that cannot honour it cause 400.
    - Unknown item_type / module_unavailable must NOT fake success (503).
    """
    from ..models import DeletionLedgerEvent

    provider = get_grant_provider(item_type)
    if provider is None:
        raise ModuleUnavailable({"reason": "grant_provider_not_registered",
                                 "item_type": item_type})
    kwargs: Dict[str, Any] = {"owner_id": str(owner_id), "item_id": str(item_id),
                              "recipient_id": (str(recipient_id) if recipient_id else None)}
    if expected_revision is not None:
        if isinstance(expected_revision, bool) or not isinstance(expected_revision, int):
            raise InputInvalid({"field": "expected_revision",
                                "reason": "must_be_integer"})
        if _supports_kwarg(provider.revoke_grant, "expected_revision"):
            kwargs["expected_revision"] = expected_revision
        else:
            raise InputInvalid({"field": "expected_revision",
                                "reason": "provider_cannot_validate_expected_revision"})

    with transaction.atomic():
        outcome = provider.revoke_grant(**kwargs)
        if write_ledger and outcome.get("revoked"):
            DeletionLedgerEvent.objects.create(
                target_user_id=str(owner_id), actor_ref=actor_ref,
                event_type=DeletionLedgerEvent.EVENT_GRANT_REVOKED,
                payload={"item_type": item_type, "item_id": str(item_id),
                         "recipient_id": (str(recipient_id) if recipient_id else None)})
    return outcome


def can_view_item(*, owner_id: str, item_type: str, item_id: str,
                  recipient_id: str, revision: int,
                  connection_reader=None) -> bool:
    """Deny-by-default item authorization (SEC-03/08, WF-04).

    Checks, in order: provider registered -> grant active for EXACT
    (item, recipient, revision) -> grant's recorded connection still the
    ACTIVE connection at the CURRENT generation (provider-level binding;
    stale generation denies even if the grant row survived). The
    connection_reader argument (optional) adds a direct active-pair check
    for callers that already hold one; when neither reader is available the
    provider's own binding check decides.
    """
    provider = get_grant_provider(item_type)
    if provider is None:
        return False
    if not provider.can_view(owner_id=str(owner_id), item_id=str(item_id),
                             recipient_id=str(recipient_id), revision=int(revision)):
        return False
    if connection_reader is not None:
        connection = connection_reader.active_connection_between(
            user_a=str(owner_id), user_b=str(recipient_id))
        if connection is None:
            return False
    return True


def assert_can_view(*, owner_id: str, item_type: str, item_id: str,
                    recipient_id: str, revision: int) -> None:
    """AccessPolicy.assert_can_view: raise NotFound (404, no existence leak)
    when the view is not allowed. Domains call this before serving."""
    if not can_view_item(owner_id=owner_id, item_type=item_type, item_id=item_id,
                         recipient_id=recipient_id, revision=revision):
        raise NotFound({"reason": "item_not_accessible"})
