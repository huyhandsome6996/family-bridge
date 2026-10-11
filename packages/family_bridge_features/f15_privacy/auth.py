from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .services.sessions import resolve_session


class FBSDSessionAuthentication(BaseAuthentication):
    keyword = "Bearer"

    def authenticate(self, request):
        header = request.META.get("HTTP_AUTHORIZATION", "")
        if not header.startswith(f"{self.keyword} "):
            return None
        raw = header[len(self.keyword):].strip()
        resolved = resolve_session(raw)
        if resolved is None:
            raise AuthenticationFailed("session_invalid_or_expired",
                                       code="not_authenticated")
        user, session = resolved
        return (user, session)

    def authenticate_header(self, request):
        return 'Bearer realm="family-bridge"'
