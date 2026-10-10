from django.db import DatabaseError, connection
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


def health_response(status, http_status=200):
    response = Response({"status": status}, status=http_status)
    response["Cache-Control"] = "no-store"
    return response


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def health(request):
    """Liveness only: does not claim that login or business features work."""
    return health_response("ok")


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def readiness(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except DatabaseError:
        return health_response("unavailable", 503)
    return health_response("ok")
