from django.urls import path

from . import api

urlpatterns = [
    path("supporters/roles", api.SupporterRoleListView.as_view()),
    path("supporters/roles/<uuid:role_id>", api.SupporterRoleDetailView.as_view()),
    path("supporters/roles/<uuid:role_id>/respond",
         api.SupporterRespondView.as_view()),
    path("supporters/roles/<uuid:role_id>/revoke",
         api.SupporterRevokeView.as_view()),
    path("supporters/roles/<uuid:role_id>/contact",
         api.SupporterContactView.as_view()),
    path("supporters/commitments", api.SupporterCommitmentsView.as_view()),
]
