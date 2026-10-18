"""F07 API: own entries (cursor), per-entry share grants, recipient reads,
personal descriptive summary. Deny-by-default: admin has no read path."""

from __future__ import annotations

import json

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from family_bridge_core.errors import InputInvalid
from family_bridge_core.validation import (
    reject_unknown_fields, validate_page_size, validate_text, validate_uuid,
    validate_revision,
)

from .auth import FBSDSessionAuthentication
from .models import EMOTIONS, EMOTION_LABELS
from .services.mood import MoodEntryService, MoodShareService


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


class MoodEntryListView(APIView):
    """GET /api/v1/mood/entries — OWN history, cursor (entry_date desc),
    authorization filtered in the DB before pagination.
    POST — create today's/VN-date entry (one per day; edit via POST {id})."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        page_size = validate_page_size(request.query_params.get("page_size"))
        cursor = request.query_params.get("cursor") or None
        rows, next_cursor = MoodEntryService().list_own(
            owner_id=str(request.user.pk), cursor=cursor,
            page_size=page_size)
        return Response({"next": next_cursor,
                         "results": [row.view() for row in rows]})

    def post(self, request):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={
            "entry_date", "emotion", "note"})
        note = payload.get("note", "")
        if note:
            note = validate_text(note, field="note", min_len=0, max_len=2000,
                                 allow_empty=True)
        entry = MoodEntryService().create(
            owner_id=str(request.user.pk),
            entry_date=payload.get("entry_date"),
            emotion=payload.get("emotion"), note=note)
        return Response(entry.view(), status=201)


class MoodEntryDetailView(APIView):
    """GET — owner-only. PATCH — owner-only edit: revision bump; existing
    grants keep the OLD revision binding so edited content auto-hides from
    recipients until re-shared."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, entry_id: str):
        entry_uuid = validate_uuid(entry_id, field="entry_id")
        entry = MoodEntryService().get_own(owner_id=str(request.user.pk),
                                           entry_id=str(entry_uuid))
        return Response(entry.view())

    def patch(self, request, entry_id: str):
        entry_uuid = validate_uuid(entry_id, field="entry_id")
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"emotion", "note"})
        note = payload.get("note")
        if note is not None:
            note = validate_text(note, field="note", min_len=0,
                                 max_len=2000, allow_empty=True)
        entry = MoodEntryService().edit(
            owner_id=str(request.user.pk), entry_id=str(entry_uuid),
            emotion=payload.get("emotion"), note=note)
        return Response(entry.view())


class MoodEntrySharesView(APIView):
    """GET /api/v1/mood/entries/{id}/shares — owner sees the grants of ONE
    entry with their TRUE status (active/stale_revision/revoked/unlinked);
    stale or revoked rows are never labeled as still readable."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, entry_id: str):
        entry_uuid = validate_uuid(entry_id, field="entry_id")
        entry = MoodEntryService().get_own(owner_id=str(request.user.pk),
                                           entry_id=str(entry_uuid))
        rows = MoodShareService().list_shared_by_me(
            owner_id=str(request.user.pk), entry_id=str(entry.id))
        return Response({"results": [row.grant_view() for row in rows]})


class MoodEntryShareCreateView(APIView):
    """POST /api/v1/mood/entries/{id}/share — share EXACTLY this entry at
    the CONFIRMED revision (expected_revision pins the previewed version; a
    mismatch is 409 stale — never silently share the current one) with ONE
    connected recipient. Never a history-wide share; requires an active
    connection (server-verified)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, entry_id: str):
        entry_uuid = validate_uuid(entry_id, field="entry_id")
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"recipient_id",
                                                "expected_revision"})
        recipient_id = validate_uuid(payload.get("recipient_id"),
                                     field="recipient_id")
        expected_revision = None
        if payload.get("expected_revision") is not None:
            expected_revision = validate_revision(
                payload.get("expected_revision"), field="expected_revision")
        share = MoodShareService().share(
            owner_id=str(request.user.pk), entry_id=str(entry_uuid),
            recipient_id=str(recipient_id),
            expected_revision=expected_revision)
        return Response(share.grant_view(), status=201)


class MoodSummaryView(APIView):
    """GET /api/v1/mood/entries/summary — personal descriptive counts in a
    bounded window. No score, no ranking, no comparison, owner-only."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            days = int(request.query_params.get("days", 90))
        except (TypeError, ValueError):
            days = 90
        summary = MoodEntryService().summary(
            owner_id=str(request.user.pk), days=days)
        return Response({"results": summary,
                         "emotions": [{"emotion": code, "label": label}
                                      for code, label in EMOTION_LABELS.items()]})


class MoodSharedWithMeView(APIView):
    """GET /api/v1/mood/shared — entries shared WITH me that are still
    readable: grant active AND revision current AND connection still the
    one bound at share time (DB-filtered first, connection re-checked on
    the bounded page). Cursor pagination keeps the response bounded."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        page_size = validate_page_size(request.query_params.get("page_size"))
        cursor = request.query_params.get("cursor") or None
        rows, next_cursor = MoodShareService().list_shared_with_me(
            recipient_id=str(request.user.pk), cursor=cursor,
            page_size=page_size)
        return Response({"next": next_cursor,
                         "results": [{
            "share_id": str(row.id),
            "entry_id": str(row.entry_id),
            "owner_id": str(row.owner_id),
            "approved_revision": row.approved_revision,
            "shared_at": row.created_at.isoformat(),
        } for row in rows]})


class MoodSharedDetailView(APIView):
    """GET /api/v1/mood/shared/{share_id} — recipient read path: grant
    unrevoked + revision current + connection ACTIVE at current generation;
    any drift -> 404 (fail closed, no cache staleness)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, share_id: str):
        share_uuid = validate_uuid(share_id, field="share_id")
        data = MoodShareService().read_shared(
            recipient_id=str(request.user.pk), share_id=str(share_uuid))
        return Response(data)


class MoodShareRevokeView(APIView):
    """POST /api/v1/mood/shares/{id}/revoke — owner-only; immediate effect
    (reads re-verify live); revoking one entry never touches others."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, share_id: str):
        share_uuid = validate_uuid(share_id, field="share_id")
        reject_unknown_fields(_json_body(request), allowed=set())
        share = MoodShareService().revoke(owner_id=str(request.user.pk),
                                          share_id=str(share_uuid))
        return Response(share.grant_view())
