from django.urls import path

from . import api

urlpatterns = [
    path("cards", api.CardCatalogListView.as_view()),
    path("cards/preview", api.CardPreviewView.as_view()),
    path("cards/send", api.CardSendView.as_view()),
    path("cards/<uuid:message_id>", api.CardSnapshotDetailView.as_view()),
    path("cards/<uuid:message_id>/reply-suggestions",
         api.CardReplySuggestionsView.as_view()),
]
