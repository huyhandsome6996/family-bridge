from django.urls import path

from . import api

urlpatterns = [
    path("activities/catalog", api.ActivityCatalogView.as_view()),
    path("activities/progress", api.ActivityProgressView.as_view()),
    path("activities/invites", api.ActivityInviteListView.as_view()),
    path("activities/invites/<uuid:invite_id>/respond",
         api.ActivityInviteRespondView.as_view()),
    path("activities/invites/<uuid:invite_id>/my-response",
         api.ActivityOwnResponseView.as_view()),
    path("activities/invites/<uuid:invite_id>/cancel",
         api.ActivityInviteCancelView.as_view()),
]
