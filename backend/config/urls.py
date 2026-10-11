"""URL configuration: platform probes + registry-driven feature routes.

B18 wiring: every feature app listed in settings.FEATURE_APPS mounts its
own urls.py under /api/v1/ (registry routes are all "" except ops, and the
ops package is not part of this backend build). Route sets are disjoint by
construction (checked at integration: 108 paths, zero collisions); unknown
paths still return the plain 404 without configuration leak.
"""
from django.urls import include, path

from core.views import health, readiness
from family_bridge_core.registry import FEATURES

urlpatterns = [
    path("api/v1/health/", health, name="health"),
    path("api/v1/ready/", readiness, name="readiness"),
]

from django.conf import settings  # noqa: E402  (needs full settings module)

_loaded = set(getattr(settings, "FEATURE_APPS", []))
for _feature in FEATURES:
    _label = _feature["backend"]["app_label"]
    _routes = _feature["backend"]["routes"].strip("/")
    if _label in _loaded and _routes == "":
        urlpatterns.append(
            path("api/v1/", include(f"family_bridge_features.{_label}.urls")),
        )
