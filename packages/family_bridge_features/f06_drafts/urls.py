from django.urls import path

from . import api

urlpatterns = [
    path("drafts", api.DraftListView.as_view()),
    path("drafts/<uuid:draft_id>", api.DraftDetailView.as_view()),
    path("drafts/<uuid:draft_id>/pause", api.DraftPauseView.as_view()),
    path("drafts/<uuid:draft_id>/preview", api.DraftPreviewView.as_view()),
    path("drafts/<uuid:draft_id>/confirm-send",
         api.DraftConfirmSendView.as_view()),
]
