"""B16 session auth — registrable resolver (standalone) or F01 at integration."""

from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .services.registry import get_session_resolver


class FBSDSessionAuthentication(BaseAuthentication):
    keyword = "Bearer"

    def authenticate(self, request):
        header = request.META.get("HTTP_AUTHORIZATION", "")
        if not header.startswith(f"{self.keyword} "):
            return None
        raw = header[len(self.keyword):].strip()
        resolver = get_session_resolver()
        resolved = resolver(raw) if resolver else None
        if resolved is None:
            raise AuthenticationFailed("session_invalid_or_expired",
                                       code="not_authenticated")
        user, session = resolved
        return (user, session)

    def authenticate_header(self, request):
        return 'Bearer realm="family-bridge"'
