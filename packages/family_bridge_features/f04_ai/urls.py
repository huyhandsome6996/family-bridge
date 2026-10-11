from django.urls import path

from . import api

urlpatterns = [
    path("ai/status", api.AiStatusView.as_view()),
    path("ai/refine", api.AiRefineView.as_view()),
    path("ai/suggestions", api.AiSuggestionListView.as_view()),
    path("ai/suggestions/<uuid:suggestion_id>", api.AiSuggestionDetailView.as_view()),
    path("ai/suggestions/<uuid:suggestion_id>/accept",
         api.AiSuggestionAcceptView.as_view()),
    path("ai/suggestions/<uuid:suggestion_id>/discard",
         api.AiSuggestionDiscardView.as_view()),
]
