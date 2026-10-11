"""Harness URLs: platform endpoints mirroring the api-foundation contract
plus registry-driven feature routes (only for features loaded via FB_FEATURES).
"""

from django.conf import settings
from django.http import JsonResponse
from django.urls import include, path

from family_bridge_core import registry


def health(request):
    """200 {"status":"ok"} — process responds; proves nothing else."""
    return JsonResponse({"status": "ok"})


def ready(request):
    """200 when DB reachable; 503 otherwise; no DSN/stack in response."""
    from django.db import connection

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        return JsonResponse({"status": "ok"})
    except Exception:
        return JsonResponse({"status": "unavailable"}, status=503)


urlpatterns = [
    path("api/v1/health/", health),
    path("api/v1/ready/", ready),
]

_loaded = set(settings.FEATURE_LAB["features"])
for _feature in registry.FEATURES:
    _label = _feature["backend"]["app_label"]
    if _label in _loaded:
        urlpatterns.append(
            path(
                f"api/v1/{_feature['backend']['routes']}/",
                include(f"family_bridge_features.{_label}.urls"),
            ),
        )
