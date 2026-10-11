"""F12 API: school directory (auth), conditional appointment scheduling."""

from __future__ import annotations

import json

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from family_bridge_core.errors import InputInvalid
from family_bridge_core.validation import reject_unknown_fields, validate_uuid

from .auth import FBSDSessionAuthentication
from .services.appointments import AppointmentService


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


class SchoolDirectoryView(APIView):
    """GET /api/v1/appointments/directory — verified school contacts
    (auth required; the PUBLIC help directory lives in F13)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"results": AppointmentService().school_contacts()})


class AppointmentRequestListView(APIView):
    """GET — own requests. POST — create (GATED: scheduling must be live)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = AppointmentService().list_own(
            requester_id=str(request.user.pk))
        return Response({"results": rows})

    def post(self, request):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"topic", "note"})
        created = AppointmentService().create_request(
            requester_id=str(request.user.pk), topic=payload.get("topic"),
            note=payload.get("note", ""))
        return Response(created.view(include_note=True), status=201)


class AppointmentRequestDetailView(APIView):
    """GET — requester or CURRENT capable handler; note to them only."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, request_id: str):
        request_uuid = validate_uuid(request_id, field="request_id")
        return Response(AppointmentService().get_request(
            request_id=str(request_uuid), viewer_id=str(request.user.pk)))


class AppointmentClaimView(APIView):
    """POST — capability-holding operator claims the request."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, request_id: str):
        request_uuid = validate_uuid(request_id, field="request_id")
        reject_unknown_fields(_json_body(request), allowed=set())
        updated = AppointmentService().claim(
            request_id=str(request_uuid), handler_id=str(request.user.pk))
        return Response(updated.view(include_note=True))


class AppointmentSlotProposeView(APIView):
    """POST {start_at} — assigned handler proposes a 30-min UTC slot.
    Submitting/proposing NEVER means an appointment exists until the
    requester accepts."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, request_id: str):
        import datetime as dt
        request_uuid = validate_uuid(request_id, field="request_id")
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"start_at"})
        raw = payload.get("start_at")
        if not isinstance(raw, str):
            raise InputInvalid({"field": "start_at",
                                "reason": "must_be_iso_string"})
        try:
            start_at = dt.datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError as exc:
            raise InputInvalid({"field": "start_at",
                                "reason": "must_be_iso_string"}) from exc
        result = AppointmentService().propose_slot(
            request_id=str(request_uuid), handler_id=str(request.user.pk),
            start_at=start_at)
        return Response(result, status=201)


def _respond(request, request_id: str, slot_id: str, decision: str):
    request_uuid = validate_uuid(request_id, field="request_id")
    slot_uuid = validate_uuid(slot_id, field="slot_id")
    service = AppointmentService()
    if decision == "accept":
        return Response(service.accept_slot(
            request_id=str(request_uuid), slot_id=str(slot_uuid),
            requester_id=str(request.user.pk)))
    return Response(service.decline_slot(
        request_id=str(request_uuid), slot_id=str(slot_uuid),
        requester_id=str(request.user.pk)))


class AppointmentSlotAcceptView(APIView):
    """POST /slots/{slot_id}/accept — requester only; accepting a superseded
    slot is 409 preview_stale."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, request_id: str, slot_id: str):
        reject_unknown_fields(_json_body(request), allowed=set())
        return _respond(request, request_id, slot_id, "accept")


class AppointmentSlotDeclineView(APIView):
    """POST /slots/{slot_id}/decline — requester only."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, request_id: str, slot_id: str):
        reject_unknown_fields(_json_body(request), allowed=set())
        return _respond(request, request_id, slot_id, "decline")


class AppointmentCancelView(APIView):
    """POST — requester or handler; idempotent when already cancelled."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, request_id: str):
        request_uuid = validate_uuid(request_id, field="request_id")
        reject_unknown_fields(_json_body(request), allowed=set())
        return Response(AppointmentService().cancel(
            request_id=str(request_uuid), actor_id=str(request.user.pk)))


class AppointmentCompleteView(APIView):
    """POST — assigned handler marks the meeting completed."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, request_id: str):
        request_uuid = validate_uuid(request_id, field="request_id")
        reject_unknown_fields(_json_body(request), allowed=set())
        return Response(AppointmentService().complete(
            request_id=str(request_uuid), handler_id=str(request.user.pk)))


class AppointmentQueueView(APIView):
    """GET — capability holders see ONLY their assigned requests."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"results": AppointmentService().queue_for_handler(
            handler_id=str(request.user.pk))})
