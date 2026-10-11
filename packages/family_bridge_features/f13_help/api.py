"""F13 API: the ONE public allowlist endpoint of the app (US-039).

Unauthenticated BY DESIGN (WF-06/SEC-24): the help page must open even
when sessions/auth/backend degrade — the fallback path lives in the
service. Read-only, stateless; no call history, no purpose capture, no
telemetry beyond normal server logs. No gates of any kind (no cooldown,
AI, survey or program requirements)."""

from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .services.directory import HelpDirectoryService


class HelpDirectoryView(APIView):
    """GET /api/v1/help/directory — verified contacts + honest fallback."""
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(HelpDirectoryService().directory())
