from django.urls import path
from core.views import health, readiness

urlpatterns = [
    path("api/v1/health/", health, name="health"),
    path("api/v1/ready/", readiness, name="readiness"),
]
