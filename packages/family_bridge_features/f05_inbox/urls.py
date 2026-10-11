from django.urls import path

from . import api

urlpatterns = [
    path("messages", api.MessageListView.as_view()),
    path("messages/quick-replies", api.QuickReplyListView.as_view()),
    path("messages/<uuid:message_id>", api.MessageDetailView.as_view()),
    path("messages/<uuid:message_id>/read", api.MessageReadView.as_view()),
    path("operations/<str:idempotency_key>", api.OperationStatusView.as_view()),
]
