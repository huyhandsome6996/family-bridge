from django.urls import path

from . import api

urlpatterns = [
    path("signals/meta", api.SignalMetaView.as_view()),
    path("signals/preview", api.SignalPreviewView.as_view()),
    path("signals/send", api.SignalSendView.as_view()),
    path("signals/<uuid:message_id>", api.SignalDetailView.as_view()),
    path("signals/<uuid:message_id>/ack", api.SignalAckView.as_view()),
]
