from django.apps import AppConfig


class F15PrivacyConfig(AppConfig):
    name = "family_bridge_features.f15_privacy"
    label = "f15_privacy"
    verbose_name = "F15 Privacy, revocation, deletion"

    def ready(self) -> None:
        """Compose the production ports/registries once (explicit allowlist,
        import-safe for standalone feature runs; see services/wiring.py)."""
        from .services.wiring import configure_production_wiring

        configure_production_wiring()
