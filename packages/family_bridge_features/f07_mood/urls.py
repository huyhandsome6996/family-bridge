from django.urls import path

from . import api

urlpatterns = [
    path("mood/entries", api.MoodEntryListView.as_view()),
    path("mood/entries/summary", api.MoodSummaryView.as_view()),
    path("mood/entries/<uuid:entry_id>", api.MoodEntryDetailView.as_view()),
    path("mood/entries/<uuid:entry_id>/shares", api.MoodEntrySharesView.as_view()),
    path("mood/entries/<uuid:entry_id>/share", api.MoodEntryShareCreateView.as_view()),
    path("mood/entries/<uuid:entry_id>/summary", api.MoodSummaryView.as_view()),
    path("mood/shared", api.MoodSharedWithMeView.as_view()),
    path("mood/shared/<uuid:share_id>", api.MoodSharedDetailView.as_view()),
    path("mood/shares/<uuid:share_id>/revoke", api.MoodShareRevokeView.as_view()),
]
