"""F16 API endpoints (/api/v1/auth/class-*, /api/v1/classroom/proposals*).

Views are thin: explicit parsing + field allowlists (SEC-05), services own
business rules. Errors raise family_bridge_core typed errors — both the
harness handler (family_bridge_core.drf) and the real backend handler
(core.exceptions) map them onto {"error": {"code", "details"}}.

Private helpers copied module-local (khong import private cua F01).
"""

from __future__ import annotations

import json

from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from family_bridge_core.errors import InputInvalid
from family_bridge_core.validation import reject_unknown_fields, validate_revision

from .auth import FBSDSessionAuthentication
from .services.accounts import (
    ClassLoginService, change_display_name, change_login_code, change_password,
)
from .services.capabilities import build as build_capabilities
from .services.proposals import DECLINE_REASONS, ProposalService


def _json_body(request, *, required: bool = True) -> dict:
    if not request.body:
        if required:
            raise InputInvalid({"reason": "empty_body"})
        return {}
    if len(request.body) > 64 * 1024:
        raise InputInvalid({"reason": "body_too_large"})
    try:
        payload = json.loads(request.body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError) as exc:
        raise InputInvalid({"reason": "malformed_json"}) from exc
    if not isinstance(payload, dict):
        raise InputInvalid({"reason": "must_be_object"})
    return payload


def _bearer_token(request) -> str:
    header = request.META.get("HTTP_AUTHORIZATION", "")
    return header[len("Bearer "):].strip() if header.startswith("Bearer ") else ""


def _get_proposal_service() -> ProposalService:
    return ProposalService()


class ClassSessionView(APIView):
    """POST /api/v1/auth/class-session — doi ma lop + mat khau lay session.

    Public. Tat ca nguyen nhan that bai (ma khong ton tai / sai mat khau /
    tai khoan vo hieu / sai dinh dang) tra body 401 GIONG HET nhau; 429 khi
    bi khoa sliding-window (DB guard) hoac throttle class_login.

    Throttle_classes PIN ve ScopedRateThrottle (khong ke thua AnonRateThrottle
    60/min cua scaffold): hop dong F16 quyet dinh 429 cho login la class_login
    200/hour + DB guard 10/15ph — anon 60/min se 429 SO SOM hon hop dong khi
    burst (60/phut < 200/gio) nen phai pin de dung hanh vi hop dong.
    """
    authentication_classes = []
    permission_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "class_login"

    def post(self, request):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"code", "password"})
        code = payload.get("code")
        password = payload.get("password")
        if not isinstance(code, str) or not isinstance(password, str):
            # Khong chi truong nao sai — mot body generic (khong biet le).
            raise InputInvalid({"reason": "must_be_string"})
        ip = request.META.get("REMOTE_ADDR", "") or ""
        _user, _account, raw_token, session, login_payload = \
            ClassLoginService().login(code=code, password=password, ip=ip)
        return Response(login_payload, status=200)


class ClassPasswordView(APIView):
    """POST /api/v1/auth/class-password — doi mat khau (re-auth truoc)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"current_password", "new_password"})
        current_password = payload.get("current_password")
        new_password = payload.get("new_password")
        if not isinstance(current_password, str) or not isinstance(new_password, str):
            raise InputInvalid({"reason": "must_be_string"})
        revoked = change_password(
            request.user, current_password=current_password,
            new_password=new_password, current_raw_token=_bearer_token(request))
        return Response({"changed": True, "sessions_revoked_other": revoked},
                        status=200)


class ClassCodeView(APIView):
    """POST /api/v1/auth/class-code — doi ma dang nhap lop (re-auth truoc)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"current_password", "new_code"})
        current_password = payload.get("current_password")
        new_code = payload.get("new_code")
        if not isinstance(current_password, str) or not isinstance(new_code, str):
            raise InputInvalid({"reason": "must_be_string"})
        code = change_login_code(request.user, current_password=current_password,
                                 new_code=new_code)
        return Response({"login_code": code, "changed": True}, status=200)


class ClassDisplayNameView(APIView):
    """POST /api/v1/auth/class-display-name — ten goi tu khai bao."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"current_password", "display_name"})
        current_password = payload.get("current_password")
        if not isinstance(current_password, str):
            raise InputInvalid({"reason": "must_be_string"})
        result = change_display_name(request.user,
                                     current_password=current_password,
                                     raw=payload.get("display_name"))
        return Response(result, status=200)


class ClassCapabilitiesView(APIView):
    """GET /api/v1/auth/class-capabilities — snapshot tinh nang (public)."""
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(build_capabilities(), status=200)


class ProposalListView(APIView):
    """GET /api/v1/classroom/proposals — cac proposal ma toi la 1 trong 2 ben."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        results, next_cursor = _get_proposal_service().list_for(
            request.user, cursor=request.query_params.get("cursor"),
            limit=_safe_limit(request.query_params.get("limit")))
        return Response({"results": results, "next_cursor": next_cursor},
                        status=200)


def _safe_limit(raw):
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


class ProposalConfirmView(APIView):
    """POST /api/v1/classroom/proposals/{id}/confirm — xac nhan 1 trong 2 buoc."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_scope = "invite_claim"

    def post(self, request, pk):
        payload = _json_body(request, required=False)
        reject_unknown_fields(payload, allowed={"expected_revision"})
        expected = payload.get("expected_revision")
        if expected is not None:
            expected = validate_revision(expected, field="expected_revision")
        result = _get_proposal_service().confirm(request.user, str(pk),
                                                 expected_revision=expected)
        return Response(result, status=200)


class ProposalDeclineView(APIView):
    """POST /api/v1/classroom/proposals/{id}/decline — tu choi (co ly do)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_scope = "invite_claim"

    def post(self, request, pk):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"reason"})
        reason = payload.get("reason")
        if not isinstance(reason, str):
            raise InputInvalid({"field": "reason", "reason": "must_be_string"})
        result = _get_proposal_service().decline(request.user, str(pk),
                                                 reason=reason)
        return Response(result, status=200)


class ProposalCancelView(APIView):
    """POST /api/v1/classroom/proposals/{id}/cancel — 1 trong 2 ben huy."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_scope = "invite_claim"

    def post(self, request, pk):
        result = _get_proposal_service().cancel(request.user, str(pk))
        return Response(result, status=200)
