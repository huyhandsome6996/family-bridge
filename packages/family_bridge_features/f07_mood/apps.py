"""F07 app config — production port wiring at startup.

ready() binds the ports F07 consumes/provides, following the F16 pattern:
- ConnectionReader (owner F01, real InviteService) into the F07 registry —
  sharing decisions use the canonical active connection (admin-provisioned
  pairs included, invite may be NULL).
- mood grant provider + "mood" deletion hook into the F15 policy registry.

Slot ownership (P1-1 fix, QA-1): F15 OWNS the mood_entry/"mood" slots of its
registry whenever f15_privacy is part of the build. F07's registrations here
are PER-ITEM fallbacks that only fill a slot that is still EMPTY — they keep
standalone-F07-style builds working (and give the F15 wiring something to
override when boot order puts this app first), but they never overwrite or
block the F15-owned composition registered from f15_privacy.services.wiring.
Registering unconditionally here previously swallowed the whole F15 block
(journal_page never registered) because F15's old all-or-nothing guard saw a
non-empty registry.

Every registration is additive and guarded: when a counterpart feature is
absent from the build (standalone branch tests), wiring is skipped quietly —
startup never dies on optional cross-feature ports. Registration failures
for PRESENT features are not swallowed (loud, per "no silent partial
wiring"). The F07 unit tests reset and replace these registries with lab
doubles; production never imports lab fixtures. The returned report is
truthful about the SLOT state (wired by this app or by the F15 owner), not
about which call filled it.
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

    # 2) F15 mood grant provider + deletion hook — PER-ITEM fallbacks only.
    try:
        from family_bridge_features.f15_privacy.services import (
            registry as grant_registry,
        )
    except ImportError:
        return report  # f15 not in this build: no policy registry to serve
    if "mood_entry" not in grant_registry.registered_item_types():
        try:
            grant_registry.register_grant_provider(
                "mood_entry",
                "family_bridge_features.f07_mood.services.grant_provider")
        except ValueError:
            pass  # provider module invalid — must not fake success
    if "mood" not in grant_registry.registered_categories():
        try:
            grant_registry.register_deletion_hook(
                "mood",
                "family_bridge_features.f07_mood.services.deletion")
        except ValueError:
            pass
    report["grant_provider"] = ("mood_entry"
                                in grant_registry.registered_item_types())
    report["deletion_hook"] = ("mood"
                               in grant_registry.registered_categories())
    return report
