"""F14 API: forms, explicit consent, typed responses, aggregate report."""

from __future__ import annotations

import json

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from family_bridge_core.errors import InputInvalid
from family_bridge_core.validation import (
    reject_unknown_fields, validate_revision, validate_text,
)

from .auth import FBSDSessionAuthentication
from .services.surveys import SurveyService


def _json_body(request) -> dict:
    if not request.body:
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


class SurveyFormsView(APIView):
    """GET /api/v1/surveys/forms — published typed forms (no text kinds)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"results": SurveyService().forms()})


class SurveyConsentView(APIView):
    """GET — my consent status. POST — EXPLICIT grant/withdraw; opening a
    survey screen never implies consent; withdrawing never disables
    anything else in the app."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(SurveyService().consent_status(
            participant_id=str(request.user.pk)))

    def post(self, request):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"purpose", "decision"})
        purpose = payload.get("purpose")
        decision = payload.get("decision")
        if not isinstance(purpose, str) or not isinstance(decision, str):
            raise InputInvalid({"reason": "must_be_string"})
        consent = SurveyService().set_consent(
            participant_id=str(request.user.pk), purpose=purpose,
            decision=decision)
        return Response(consent.view())


class SurveyResponseView(APIView):
    """POST — submit typed answers for ONE phase of a published form.
    Requires ACTIVE research consent; no resubmission; raw answers stay
    in the backend (no export endpoint exists anywhere)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_scope = "survey_report"

    def post(self, request):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={
            "form_key", "form_revision", "phase", "answers"})
        form_key = validate_text(payload.get("form_key"), field="form_key",
                                 min_len=1, max_len=64)
        revision = validate_revision(payload.get("form_revision"),
                                     field="form_revision")
        phase = payload.get("phase")
        answers = payload.get("answers")
        if not isinstance(answers, dict):
            raise InputInvalid({"field": "answers", "reason": "must_be_object"})
        response = SurveyService().submit(
            participant_id=str(request.user.pk), form_key=form_key,
            form_revision=revision, phase=phase, answers=answers)
        return Response({"response_id": str(response.id),
                         "form_key": response.form_key,
                         "phase": response.phase}, status=201)


class SurveyReportView(APIView):
    """GET /api/v1/surveys/report/{form_key}?revision=&phase= — aggregate
    ONLY, k-suppressed with complementary suppression, DEC-15 gated
    (policy unset -> 403 report_policy_unset). No raw rows ever."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_scope = "survey_report"

    def get(self, request, form_key: str):
        key = validate_text(form_key, field="form_key", min_len=1, max_len=64)
        revision_raw = request.query_params.get("revision")
        if not revision_raw:
            raise InputInvalid({"field": "revision", "reason": "required"})
        try:
            revision_int = int(revision_raw)
        except (TypeError, ValueError) as exc:
            raise InputInvalid({"field": "revision",
                                "reason": "must_be_integer"}) from exc
        revision = validate_revision(revision_int, field="revision")
        phase = request.query_params.get("phase") or None
        if phase:
            phase = validate_text(phase, field="phase", min_len=1, max_len=8)
        return Response(SurveyService().report(
            form_key=key, form_revision=revision, phase=phase))
