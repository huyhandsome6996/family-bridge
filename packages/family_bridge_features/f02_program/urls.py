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
    # thỏa ước gia đình tuần 4 — instance của đúng cặp/generation/revision
    path("program/agreement", api.FamilyAgreementOverviewView.as_view()),
    path("program/agreement/propose", api.FamilyAgreementProposeView.as_view()),
    path("program/agreement/<uuid:agreement_id>/confirm",
         api.FamilyAgreementConfirmView.as_view()),
    path("program/agreement/<uuid:agreement_id>/withdraw",
         api.FamilyAgreementWithdrawView.as_view()),
]
