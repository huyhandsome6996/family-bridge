from django.urls import path

from . import api

urlpatterns = [
    path("surveys/forms", api.SurveyFormsView.as_view()),
    path("surveys/consent", api.SurveyConsentView.as_view()),
    path("surveys/responses", api.SurveyResponseView.as_view()),
    path("surveys/report/<str:form_key>", api.SurveyReportView.as_view()),
]
