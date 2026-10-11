"""View probe chỉ dùng trong test — KHÔNG gắn vào URLconf thật của ứng dụng."""

from django.http import Http404
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class PrivateProbe(APIView):
    """Không khai báo authentication/permission — kế thừa mặc định default-deny."""

    def get(self, request):
        return Response({"private": True})


class AnonProbe(APIView):
    """AllowAny — dùng để đo hạn mức ANON thật (DRF check_permissions chạy
    TRƯỚC check_throttles nên request 401 không bao giờ chạm throttle)."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"anon": True})


class ValidationErrorProbe(APIView):
    """Cho phép anon để tới được thân view rồi raise ValidationError từ DRF."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        raise ValidationError({"detail": "synthetic validation failure"})


class NotFoundProbe(APIView):
    """Cho phép anon để tới được thân view rồi raise Http404 (DRF chuyển thành 404)."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        raise Http404("synthetic not found")
