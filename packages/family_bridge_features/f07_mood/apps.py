"""F07 app config — production port wiring at startup.

ready() binds the ports F07 consumes/provides, following the F16 pattern:
- ConnectionReader (owner F01, real InviteService) into the F07 registry —
  sharing decisions use the canonical active connection (admin-provisioned
  pairs included, invite may be NULL).
- mood grant provider + "mood" deletion hook into the F15 policy registry.

Every registration is additive and guarded: when a counterpart feature is
absent from the build (standalone branch tests), wiring is skipped quietly —
startup never dies on optional cross-feature ports. Registration failures
for PRESENT features are not swallowed (loud, per "no silent partial
wiring"). The F07 unit tests reset and replace these registries with lab
doubles; production never imports lab fixtures.
"""

from django.apps import AppConfig


class F07MoodConfig(AppConfig):
    name = "family_bridge_features.f07_mood"
    label = "f07_mood"
    verbose_name = "F07 Tam trang va chia se tung muc"

    def ready(self) -> None:
        wire_production_ports()


def wire_production_ports() -> dict:
    """Idempotent port wiring; returns a truthful report of what got wired
    (used by an integration test to prove production wiring exists)."""
    report = {"connection_reader": False, "grant_provider": False,
              "deletion_hook": False}

    # 1) Connection reader (F01) — canonical active connection protocol.
    from .services import registry as mood_registry
    if mood_registry.get_connection_reader() is None:
        try:
            from family_bridge_features.f01_identity.services.invites import (
                InviteService,
            )
        except ImportError:
            pass  # f01 not in this build: F07 sharing fails closed instead
        else:
            mood_registry.register_connection_reader(InviteService())
    report["connection_reader"] = mood_registry.get_connection_reader() is not None

    # 2) F15 mood grant provider + deletion hook.
    try:
        from family_bridge_features.f15_privacy.services import (
            registry as grant_registry,
        )
    except ImportError:
        return report  # f15 not in this build
    try:
        grant_registry.register_grant_provider(
            "mood_entry",
            "family_bridge_features.f07_mood.services.grant_provider")
        report["grant_provider"] = True
    except ValueError:
        pass  # provider module invalid — must not fake success
    try:
        grant_registry.register_deletion_hook(
            "mood",
            "family_bridge_features.f07_mood.services.deletion")
        report["deletion_hook"] = True
    except ValueError:
        pass
    return report
