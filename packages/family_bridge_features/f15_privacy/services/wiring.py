"""Production wiring for F15 ports/registries (explicit composition).

Called ONCE from ``apps.F15PrivacyConfig.ready()``. Everything registered
here is an explicit, hardcoded allowlist INSIDE this package — no dotted
paths from client/admin config, no plugin discovery (WF-22). Each
registration is guarded by module presence so standalone feature runs stay
runnable, and the whole function is idempotent.

Registrations:
- grant providers: mood_entry / journal_page -> services.adapters (F07/F08);
- deletion hooks: mood / journal (F15 adapters with cutoff filtering),
  surveys (F14 adapter), connections (F01 adapter). Categories WITHOUT an
  approved policy or hook (account per DEC-12/23; messages/ai/drafts/
  program_progress/appointments until their owners ship hooks) stay
  unregistered — processing them reports hook_not_registered and the
  request truthfully lands in failed_needs_action.
- connection reader: F01 InviteService (read-only port methods);
- consent writer: services.consent.ProductionConsentWriter (F01 + F14);
- handler authorizer: services.verification.AdminCapabilityAuthorizer
  (B16 capability privacy.case; fail-closed until B16 ships it).
"""

from __future__ import annotations

from importlib.util import find_spec

_CONFIGURED = False


def _present(package: str) -> bool:
    try:
        return find_spec(package) is not None
    except (ImportError, ValueError):
        return False


def configure_production_wiring(*, force: bool = False) -> None:
    """Idempotent production composition (safe to call from ready())."""
    global _CONFIGURED
    if _CONFIGURED and not force:
        return

    from . import ports, registry

    has_f01 = _present("family_bridge_features.f01_identity")
    has_f07 = _present("family_bridge_features.f07_mood")
    has_f08 = _present("family_bridge_features.f08_journal")
    has_f14 = _present("family_bridge_features.f14_surveys")

    # -- connection reader (F01) -------------------------------------------------
    if has_f01 and ports.get_connection_reader() is None:
        from family_bridge_features.f01_identity.services.invites import InviteService
        ports.register_connection_reader(InviteService())

    # -- grant providers (F07/F08 share tables) -----------------------------------
    if (has_f07 or has_f08) and not registry.registered_item_types():
        from . import adapters
        adapters.configure()
        if has_f07:
            registry.register_grant_provider(
                "mood_entry",
                "family_bridge_features.f15_privacy.services.adapters"
                ".mood_entry_provider")
        if has_f08:
            registry.register_grant_provider(
                "journal_page",
                "family_bridge_features.f15_privacy.services.adapters"
                ".journal_page_provider")

    # -- deletion hooks (adapters owned by F15, domain tables stay theirs) --------
    from . import deletion_hooks

    if has_f07 and "mood" not in registry.registered_categories():
        registry.register_deletion_hook(
            "mood",
            "family_bridge_features.f15_privacy.services.deletion_hooks"
            ".MoodDeletionHook")
    if has_f08 and "journal" not in registry.registered_categories():
        registry.register_deletion_hook(
            "journal",
            "family_bridge_features.f15_privacy.services.deletion_hooks"
            ".JournalDeletionHook")
    if has_f14 and "surveys" not in registry.registered_categories():
        registry.register_deletion_hook(
            "surveys",
            "family_bridge_features.f15_privacy.services.deletion_hooks"
            ".SurveysDeletionHook")
    if has_f01 and "connections" not in registry.registered_categories():
        registry.register_deletion_hook(
            "connections",
            "family_bridge_features.f15_privacy.services.deletion_hooks"
            ".ConnectionsDeletionHook")

    # -- consent writer (F01 store + F14 research mapping) -------------------------
    if has_f01 and ports.get_consent_writer() is None:
        from .consent import ProductionConsentWriter
        ports.register_consent_writer(ProductionConsentWriter())

    # -- handler authorizer (B16 capability; fail-closed) --------------------------
    from django.apps import apps as django_apps

    if django_apps.is_installed("family_bridge_features.admin_core") \
            and ports.get_handler_authorizer() is None:
        from .verification import AdminCapabilityAuthorizer
        ports.register_handler_authorizer(AdminCapabilityAuthorizer())

    _CONFIGURED = True
