"""Production session port shared by feature registries.

Registered standalone test ports still take precedence. This fallback uses
only persisted F01 sessions, including expiry, revocation and disabled users.
It never authenticates client-supplied identities or creates a session.
"""


def resolve_identity_session(raw_token):
    from django.apps import apps
    if not apps.is_installed('family_bridge_features.f01_identity'):
        return None
    from family_bridge_features.f01_identity.services.identity import SessionService
    session = SessionService.resolve_session(raw_token)
    return (session.user, session) if session else None
