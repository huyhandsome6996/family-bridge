import logging

from django.db import connection
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

logger = logging.getLogger(__name__)


def health_response(status, http_status=200):
    response = Response({"status": status}, status=http_status)
    response["Cache-Control"] = "no-store"
    return response


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([])
def health(request):
    """Liveness only: does not claim that login or business features work."""
    return health_response("ok")


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([])
def readiness(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except Exception as exc:  # noqa: BLE001 - readiness must fail safe
        # Log only the exception class name: messages can carry DB host/DSN
        # details that must never reach logs (SEC-22/SEC-27).
        logger.warning("Readiness check failed: %s", type(exc).__name__)
        return health_response("unavailable", 503)
    return health_response("ok")
