"""F09 API: published catalog, private progress, two-sided invites."""

from __future__ import annotations

import json

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from family_bridge_core.errors import InputInvalid
from family_bridge_core.validation import (
    reject_unknown_fields, validate_revision, validate_text, validate_uuid,
)

from .auth import FBSDSessionAuthentication
from .services.activities import ActivityService


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


class ActivityCatalogView(APIView):
    """GET /api/v1/activities/catalog — published activities + 60-second
    lessons with audience filter; text-first, no heavy media."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        kind = request.query_params.get("kind") or None
        audience = request.query_params.get("audience") or None
        if kind:
            kind = validate_text(kind, field="kind", min_len=1, max_len=16)
        if audience:
            audience = validate_text(audience, field="audience",
                                     min_len=1, max_len=16)
        return Response({"results": ActivityService().catalog(
            kind=kind, audience=audience)})


class ActivityProgressView(APIView):
    """GET — OWN private progress. POST — mark done/skipped for YOURSELF
    only (content must still be published at the pinned revision)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = ActivityService().list_progress(
            participant_id=str(request.user.pk))
        return Response({"results": [row.view() for row in rows]})

    def post(self, request):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={
            "content_key", "content_revision", "status"})
        content_key = validate_text(payload.get("content_key"),
                                    field="content_key", min_len=1,
                                    max_len=64)
        revision = validate_revision(payload.get("content_revision"),
                                     field="content_revision")
        status = payload.get("status")
        if not isinstance(status, str):
            raise InputInvalid({"field": "status", "reason": "must_be_string"})
        progress = ActivityService().mark_progress(
            participant_id=str(request.user.pk), content_key=content_key,
            content_revision=revision, status=status)
        return Response(progress.view(), status=201)


class ActivityInviteListView(APIView):
    """GET — invites involving me (both directions). POST — invite a
    connected person to a published activity; two responses required."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = ActivityService().list_invites(viewer_id=str(request.user.pk))
        return Response({"results": [row.view(viewer_id=request.user.pk)
                                     for row in rows]})

    def post(self, request):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={
            "content_key", "content_revision", "invitee_id"})
        content_key = validate_text(payload.get("content_key"),
                                    field="content_key", min_len=1,
                                    max_len=64)
        revision = validate_revision(payload.get("content_revision"),
                                     field="content_revision")
        invitee_id = validate_uuid(payload.get("invitee_id"),
                                   field="invitee_id")
        invite = ActivityService().invite(
            inviter_id=str(request.user.pk), invitee_id=str(invitee_id),
            content_key=content_key, content_revision=revision)
        return Response(invite.view(viewer_id=request.user.pk), status=201)


class ActivityInviteRespondView(APIView):
    """POST — INVITEE-only accept/decline; the inviter cannot tick for the
    invitee (ownership enforced server-side)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, invite_id: str):
        invite_uuid = validate_uuid(invite_id, field="invite_id")
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"decision"})
        decision = payload.get("decision")
        if decision not in ("accept", "decline"):
            raise InputInvalid({"field": "decision",
                                "reason": "invalid_decision"})
        invite = ActivityService().respond(
            invitee_id=str(request.user.pk), invite_id=str(invite_uuid),
            decision=decision)
        return Response(invite.view(viewer_id=request.user.pk))


class ActivityOwnResponseView(APIView):
    """POST {response_status} — each participant records THEIR OWN
    done/skipped; the invitee must have accepted first."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, invite_id: str):
        invite_uuid = validate_uuid(invite_id, field="invite_id")
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"response_status"})
        response_status = payload.get("response_status")
        if not isinstance(response_status, str):
            raise InputInvalid({"field": "response_status",
                                "reason": "must_be_string"})
        invite = ActivityService().set_own_response(
            actor_id=str(request.user.pk), invite_id=str(invite_uuid),
            response_status=response_status)
        return Response(invite.view(viewer_id=request.user.pk))


class ActivityInviteCancelView(APIView):
    """POST — inviter cancels a pending invite."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, invite_id: str):
        invite_uuid = validate_uuid(invite_id, field="invite_id")
        reject_unknown_fields(_json_body(request), allowed=set())
        invite = ActivityService().cancel(
            inviter_id=str(request.user.pk), invite_id=str(invite_uuid))
        return Response(invite.view(viewer_id=request.user.pk))
