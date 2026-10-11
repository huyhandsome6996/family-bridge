"""URLconf test-only: gắn probe tại /probe/ cho behavior test throttle.

Gộp thêm config.urls để các test override ROOT_URLCONF vẫn gọi được
/api/v1/health/ và /api/v1/ready/ (test miễn throttle cần cả hai).
"""

from django.urls import include, path

from core.tests.probes import AnonProbe, PrivateProbe

urlpatterns = [
    path("probe/", PrivateProbe.as_view()),
    path("probe/anon/", AnonProbe.as_view()),
    # config.urls đã chứa tiền tố "api/v1/..." nên include ở gốc.
    path("", include("config.urls")),
]
