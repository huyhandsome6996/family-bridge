from django.urls import path

from . import api

urlpatterns = [
    path("privacy/overview", api.PrivacyOverviewView.as_view()),
    path("privacy/grants/<str:item_type>/<uuid:item_id>/revoke",
         api.GrantRevokeView.as_view()),
    path("privacy/deletion-requests", api.DeletionRequestView.as_view()),
    path("privacy/deletion-requests/<uuid:request_id>",
         api.DeletionRequestDetailView.as_view()),
    path("privacy/deletion-requests/<uuid:request_id>/cancel",
         api.DeletionRequestCancelView.as_view()),
    path("privacy/consents/<str:purpose>/withdraw", api.ConsentWithdrawView.as_view()),
]
