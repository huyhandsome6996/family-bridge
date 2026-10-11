"""F02 API: voluntary enrollment, all-weeks view, own progress, agreement."""

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
from .services.program import ProgramService


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


def _program_key(value) -> str:
    return validate_text(value, field="program_key", min_len=1, max_len=64)


class ProgramCatalogView(APIView):
    """GET /api/v1/program/catalog — published programs (all revisions
    listed; current revision shown for explicit re-enroll decisions)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"results": ProgramService().catalog()})


class ProgramEnrollView(APIView):
    """POST — voluntary enrollment pinning the chosen revision. Content
    re-publishes NEVER migrate the pin silently."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={
            "program_key", "program_revision"})
        key = _program_key(payload.get("program_key"))
        revision = validate_revision(payload.get("program_revision"),
                                     field="program_revision")
        enrollment = ProgramService().enroll(
            participant_id=str(request.user.pk), program_key=key,
            program_revision=revision)
        return Response(enrollment.view(), status=201)


class ProgramOptOutView(APIView):
    """POST — voluntary opt-out; no pressure, nothing locked."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"program_key"})
        enrollment = ProgramService().opt_out(
            participant_id=str(request.user.pk),
            program_key=_program_key(payload.get("program_key")))
        return Response(enrollment.view())


class ProgramMyView(APIView):
    """GET — my enrollments (honest, includes opted-out rows)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = ProgramService().my_enrollments(
            participant_id=str(request.user.pk))
        return Response({"results": [row.view() for row in rows]})


class ProgramWeeksView(APIView):
    """GET /api/v1/program/weeks/{key} — ALL published weeks of MY pinned
    revision are viewable; suggestion is informational, never a lock."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, program_key: str):
        return Response(ProgramService().weeks_for_me(
            participant_id=str(request.user.pk),
            program_key=_program_key(program_key)))


class ProgramProgressView(APIView):
    """POST — mark OWN activity done/skipped/reset; the activity must
    belong to the pinned program; nobody can tick for anyone else."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={
            "program_key", "week_no", "activity_key", "status"})
        key = _program_key(payload.get("program_key"))
        week_no = payload.get("week_no")
        if isinstance(week_no, bool) or not isinstance(week_no, int) \
                or not 1 <= week_no <= 8:
            raise InputInvalid({"field": "week_no",
                                "reason": "must_be_week_1_8"})
        activity_key = validate_text(payload.get("activity_key"),
                                     field="activity_key", min_len=1,
                                     max_len=64)
        status = payload.get("status")
        if not isinstance(status, str):
            raise InputInvalid({"field": "status", "reason": "must_be_string"})
        progress = ProgramService().mark_activity(
            participant_id=str(request.user.pk), program_key=key,
            week_no=week_no, activity_key=activity_key, status=status)
        return Response(progress.view(), status=201)


class AgreementAcceptView(APIView):
    """POST — the participant accepts the CURRENT agreement revision of
    their pinned program; per-revision UNIQUE (idempotent); editing the
    template requires a fresh acceptance from EACH person."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"program_key"})
        result = ProgramService().accept_agreement(
            participant_id=str(request.user.pk),
            program_key=_program_key(payload.get("program_key")))
        return Response(result)
