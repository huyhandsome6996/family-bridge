from django.urls import path

from . import api

urlpatterns = [
    path("program/catalog", api.ProgramCatalogView.as_view()),
    path("program/enroll", api.ProgramEnrollView.as_view()),
    path("program/opt-out", api.ProgramOptOutView.as_view()),
    path("program/my", api.ProgramMyView.as_view()),
    path("program/weeks/<str:program_key>", api.ProgramWeeksView.as_view()),
    path("program/progress", api.ProgramProgressView.as_view()),
    path("program/agreement/accept", api.AgreementAcceptView.as_view()),
]
