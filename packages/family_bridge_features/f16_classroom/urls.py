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
    # cap phat/nap cap do admin thuc hien (CAP-23 classroom.provision,
    # bo sung 18/10/2026) — grant scope THAT: global hoac school=class_ref
    path("classroom/admin/classes", api.AdminClassListView.as_view()),
    path("classroom/admin/pairs-preview", api.AdminPairsPreviewView.as_view()),
    path("classroom/admin/pairs-apply", api.AdminPairsApplyView.as_view()),
    path("classroom/admin/backfill-inventory", api.AdminBackfillInventoryView.as_view()),
    path("classroom/admin/backfill-apply", api.AdminBackfillApplyView.as_view()),
]
