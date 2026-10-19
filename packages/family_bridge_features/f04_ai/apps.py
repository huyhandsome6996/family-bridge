from django.apps import AppConfig


class F04AiConfig(AppConfig):
    name = "family_bridge_features.f04_ai"
    label = "f04_ai"
    verbose_name = "F04 AI ho tro dien dat (US-029/US-033)"

    def ready(self) -> None:
        """Startup wiring ONLY — no network, no key probing, never raises.

        1. Register the F15 deletion hook for category "ai" (same pattern as
           F16: f15 not in the build -> skip silently; registration failure
           must not fake success nor block boot).
        2. Wire the Gemini provider from validated settings (opt-in via
           FB_AI_ENABLED + GEMINI_API_KEY; misconfiguration -> AI stays off).
        """
        try:
            from family_bridge_features.f15_privacy.services import (
                registry as grant_registry,
            )
            grant_registry.register_deletion_hook(
                "ai",
                "family_bridge_features.f04_ai.services.deletion"
                ".AiSuggestionDeletionHook",
            )
        except (ImportError, ValueError):
            pass  # f15 not in this build / unknown category: AI deletion gap
                  # stays truthful (F15 reports hook_not_registered), boot OK.
        try:
            from .services import wiring

            if wiring.configure_from_settings():
                return
        except Exception as exc:  # noqa: BLE001 — AI must never break boot
            import logging

            logging.getLogger(__name__).warning(
                "F04 AI provider wiring skipped: %s", type(exc).__name__)
