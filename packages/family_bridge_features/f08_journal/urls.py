from django.urls import path

from . import api

urlpatterns = [
    path("journal/prompts", api.JournalPromptsView.as_view()),
    path("journal/pages", api.JournalPageListView.as_view()),
    path("journal/pages/<uuid:page_id>", api.JournalPageDetailView.as_view()),
    path("journal/pages/<uuid:page_id>/shares", api.JournalPageSharesView.as_view()),
    path("journal/pages/<uuid:page_id>/share", api.JournalPageShareCreateView.as_view()),
    path("journal/pages/<uuid:page_id>/replies", api.JournalPageRepliesView.as_view()),
    path("journal/shared", api.JournalSharedWithMeView.as_view()),
    path("journal/shared/<uuid:share_id>", api.JournalSharedDetailView.as_view()),
    path("journal/shared/<uuid:share_id>/replies", api.JournalSharedReplyView.as_view()),
    path("journal/my-replies", api.JournalMyRepliesView.as_view()),
    path("journal/shares/<uuid:share_id>/revoke", api.JournalShareRevokeView.as_view()),
]
