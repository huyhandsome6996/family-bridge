from django.urls import path

from . import api

urlpatterns = [
    path("admin/dashboard", api.AdminDashboardView.as_view()),
    path("admin/content", api.AdminContentListView.as_view()),
    path("admin/content/<uuid:content_id>", api.AdminContentDetailView.as_view()),
    path("admin/content/<uuid:content_id>/publish", api.AdminContentPublishView.as_view()),
    path("admin/content/<uuid:content_id>/retire", api.AdminContentRetireView.as_view()),
    path("admin/content/<uuid:content_id>/clone", api.AdminContentCloneView.as_view()),
    path("admin/capabilities", api.AdminCapabilityListView.as_view()),
    path("admin/capabilities/grant", api.AdminCapabilityGrantView.as_view()),
    path("admin/capabilities/<uuid:grant_id>/revoke", api.AdminCapabilityRevokeView.as_view()),
    path("admin/settings", api.AdminSettingsView.as_view()),
    path("admin/settings/<str:key>", api.AdminSettingDetailView.as_view()),
    path("admin/audit", api.AdminAuditView.as_view()),
]
