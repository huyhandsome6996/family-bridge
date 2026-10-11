"""DRF authentication resolving Family Bridge sessions (B00 contract rule 2:
bearer application token; no cookies). Unauthenticated requests get 401 with
a bearer challenge; the session service decides liveness/revocation.
"""

from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .services.identity import SessionService


class FBSDSessionAuthentication(BaseAuthentication):
    keyword = "Bearer"

    def authenticate(self, request):
        header = request.META.get("HTTP_AUTHORIZATION", "")
        if not header.startswith(f"{self.keyword} "):
            return None  # anonymous; view permissions decide
        raw = header[len(self.keyword):].strip()
        session = SessionService.resolve_session(raw)
        if session is None:
            raise AuthenticationFailed(
                "session_invalid_or_expired", code="not_authenticated")
        return (session.user, session)

    def authenticate_header(self, request):
        return 'Bearer realm="family-bridge"'
