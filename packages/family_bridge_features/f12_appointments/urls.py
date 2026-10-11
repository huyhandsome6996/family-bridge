from django.urls import path

from . import api

urlpatterns = [
    path("appointments/directory", api.SchoolDirectoryView.as_view()),
    path("appointments/requests", api.AppointmentRequestListView.as_view()),
    path("appointments/requests/<uuid:request_id>",
         api.AppointmentRequestDetailView.as_view()),
    path("appointments/requests/<uuid:request_id>/claim",
         api.AppointmentClaimView.as_view()),
    path("appointments/requests/<uuid:request_id>/slots",
         api.AppointmentSlotProposeView.as_view()),
    path("appointments/requests/<uuid:request_id>/slots/<uuid:slot_id>/accept",
         api.AppointmentSlotAcceptView.as_view()),
    path("appointments/requests/<uuid:request_id>/slots/<uuid:slot_id>/decline",
         api.AppointmentSlotDeclineView.as_view()),
    path("appointments/requests/<uuid:request_id>/cancel",
         api.AppointmentCancelView.as_view()),
    path("appointments/requests/<uuid:request_id>/complete",
         api.AppointmentCompleteView.as_view()),
    path("appointments/queue", api.AppointmentQueueView.as_view()),
]
