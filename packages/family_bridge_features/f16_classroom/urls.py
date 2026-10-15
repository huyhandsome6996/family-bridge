from django.urls import path

from . import api

app_name = "f16_classroom"

urlpatterns = [
    # auth lop hoc (Task 1)
    path("auth/class-session", api.ClassSessionView.as_view()),
    path("auth/class-password", api.ClassPasswordView.as_view()),
    path("auth/class-code", api.ClassCodeView.as_view()),
    path("auth/class-display-name", api.ClassDisplayNameView.as_view()),
    path("auth/class-capabilities", api.ClassCapabilitiesView.as_view()),
    # de xuat ket noi HS/PH hai chieu
    path("classroom/proposals", api.ProposalListView.as_view()),
    path("classroom/proposals/<uuid:pk>/confirm", api.ProposalConfirmView.as_view()),
    path("classroom/proposals/<uuid:pk>/decline", api.ProposalDeclineView.as_view()),
    path("classroom/proposals/<uuid:pk>/cancel", api.ProposalCancelView.as_view()),
]
