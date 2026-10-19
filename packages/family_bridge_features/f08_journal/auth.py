"""F08 session auth — registrable resolver (standalone) or F01 at integration.

R10 fix: when no resolver is registered (real ``config.settings`` boot with
no lab fixtures), the production fallback resolves the session through F01's
real ``SessionService`` — the SAME substrate every feature must use. The
fallback is ImportError-guarded so standalone runs without f01 stay honest
(unauthenticated), and an explicit registered resolver always wins."""
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .services.registry import get_session_resolver


def _resolve(raw: str):
    resolver = get_session_resolver()
    if resolver is not None:
        return resolver(raw)
    try:  # production fallback: real F01 sessions (absolute import)
        from family_bridge_features.f01_identity.services.identity import (
            SessionService,
        )
        session = SessionService.resolve_session(raw)
        return (session.user, session) if session else None
    except ImportError:
        return None


class FBSDSessionAuthentication(BaseAuthentication):
    keyword = "Bearer"

    def authenticate(self, request):
        header = request.META.get("HTTP_AUTHORIZATION", "")
        if not header.startswith(f"{self.keyword} "):
            return None
        raw = header[len(self.keyword):].strip()
        resolved = _resolve(raw)
        if resolved is None:
            raise AuthenticationFailed("session_invalid_or_expired",
                                       code="not_authenticated")
        user, session = resolved
        return (user, session)

    def authenticate_header(self, request):
        return 'Bearer realm="family-bridge"'
