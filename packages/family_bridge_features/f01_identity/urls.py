from django.urls import path

from . import api

urlpatterns = [
    # auth (US-011)
    path("auth/session", api.AuthSessionView.as_view()),
    path("auth/logout", api.LogoutView.as_view()),
    path("consents", api.ConsentView.as_view()),
    # invitations (US-013): one view, GET list + POST create
    path("connections/invites", api.InviteView.as_view()),
    path("connections/invites/claim", api.InviteClaimView.as_view()),
    path("connections/invites/<uuid:invite_id>/confirm", api.InviteConfirmView.as_view()),
    path("connections/invites/<uuid:invite_id>/decline", api.InviteDeclineView.as_view()),
    path("connections/invites/<uuid:invite_id>/cancel", api.InviteCancelView.as_view()),
    # connections
    path("connections", api.ConnectionListView.as_view()),
    path("connections/<uuid:connection_id>/revoke", api.ConnectionRevokeView.as_view()),
]
