"""F04 startup wiring: Gemini provider from validated Django settings.

Contract (frozen v1 C5):
- Registration is opt-in: the provider is wired ONLY when FB_AI_ENABLED is
  truthy AND GEMINI_API_KEY is present AND every GEMINI_* value validates.
  Any misconfiguration -> AI off (registry stays empty) -> refine fails
  closed with module_unavailable; Django boot NEVER crashes here.
- No network, no key probing, no logging at import/startup/migration/health
  time. `configure_from_settings()` only constructs an inert object.
- Kill switch stays live at request time (R1A2-03 wording fix): the
  GeminiProvider.kill_switch_active() re-read re-evaluates the DJANGO
  SETTINGS OBJECT on every request, so AiExpressService.status()/refine()
  stay truthful when the flag flips after startup (e.g. override_settings in
  tests). Changing the ENVIRONMENT in production (Render) still requires a
  process restart/redeploy for settings to reload — the re-read does not
  watch os.environ.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from .gemini import (
    ALLOWED_GEMINI_MODELS, DEFAULT_GEMINI_MODEL, GeminiProvider,
)
from . import registry

logger = logging.getLogger(__name__)


def build_provider_from_settings(dj_settings: Any) -> Optional[GeminiProvider]:
    """Return a wired GeminiProvider, or None when AI must stay off.

    Fail closed, never raise:
    - FB_AI_ENABLED not truthy ("1"/"true")                  -> None
    - GEMINI_API_KEY missing/blank                           -> None
    - GEMINI_MODEL outside the code allowlist                -> None
    - GEMINI_TIMEOUT_SECONDS / GEMINI_MAX_OUTPUT_TOKENS not
      a validated int (settings turn unparseable into None)  -> None
    """
    try:
        if not getattr(dj_settings, "FB_AI_ENABLED", False):
            return None
        api_key = getattr(dj_settings, "GEMINI_API_KEY", "")
        if not isinstance(api_key, str) or not api_key.strip():
            return None
        model = getattr(dj_settings, "GEMINI_MODEL", "") or DEFAULT_GEMINI_MODEL
        if model not in ALLOWED_GEMINI_MODELS:
            return None
        timeout_seconds = getattr(dj_settings, "GEMINI_TIMEOUT_SECONDS", None)
        if isinstance(timeout_seconds, bool) or not isinstance(timeout_seconds, int):
            return None
        max_output_tokens = getattr(dj_settings, "GEMINI_MAX_OUTPUT_TOKENS", None)
        if isinstance(max_output_tokens, bool) or not isinstance(max_output_tokens, int):
            return None
    except Exception:  # noqa: BLE001 — broken settings object: AI off, boot OK
        return None
    return GeminiProvider(
        api_key=api_key,
        model=model,
        timeout_seconds=timeout_seconds,
        max_output_tokens=max_output_tokens,
    )


def configure_from_settings() -> bool:
    """Wire the provider into the F04 registry. True when AI is enabled."""
    from django.conf import settings

    provider = build_provider_from_settings(settings)
    if provider is not None:
        registry.register_ai_provider(provider)
    # Operational diagnosis only: never log key/model values or private text,
    # and never probe the provider during Django boot/migrate/health.
    logger.info(
        "F04 AI configuration: enabled=%s key_present=%s model_supported=%s provider_wired=%s",
        bool(getattr(settings, "FB_AI_ENABLED", False)),
        bool(str(getattr(settings, "GEMINI_API_KEY", "") or "").strip()),
        (getattr(settings, "GEMINI_MODEL", "") or DEFAULT_GEMINI_MODEL)
        in ALLOWED_GEMINI_MODELS,
        provider is not None,
    )
    return provider is not None
