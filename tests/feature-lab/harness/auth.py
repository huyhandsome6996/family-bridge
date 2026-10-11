"""Test-harness authentication shim.

DRF returns 403 instead of 401 when no authentication class emits a
challenge header. The Family Bridge contract requires 401 for
unauthenticated private calls, so the harness registers this anonymous
authenticator that always advertises the bearer challenge. It NEVER
authenticates anyone — sessions come from the real backend at integration.
"""

from rest_framework.authentication import BaseAuthentication


class AlwaysChallengeAuthentication(BaseAuthentication):
    def authenticate(self, request):
        return None  # anonymous; view permissions decide the outcome

    def authenticate_header(self, request):
        return 'Bearer realm="family-bridge"'
