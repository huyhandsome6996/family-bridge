"""F07 services package facade.

Explicit submodule imports so dotted-path registrations (F15 grant provider
"family_bridge_features.f07_mood.services.grant_provider", deletion hook
"...services.deletion") resolve via getattr on this package at startup —
importing the parent package alone does not bind submodule attributes.
"""

from . import deletion, grant_provider, mood, registry  # noqa: F401
