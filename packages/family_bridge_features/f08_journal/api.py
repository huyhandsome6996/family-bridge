"""F08 API: private pages (cursor + owner-scoped search), per-page grants,
song-hanh replies. Deny-by-default; no teacher/admin read path."""

from __future__ import annotations

import json

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from family_bridge_core.errors import InputInvalid
from family_bridge_core.validation import (
    reject_unknown_fields, validate_page_size, validate_revision,
    validate_text, validate_uuid,
)

from .auth import FBSDSessionAuthentication
from .services.journal import JournalPageService, JournalShareService


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


class JournalPromptsView(APIView):
    """GET /api/v1/journal/prompts — published topic prompts only."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"results": JournalPageService().prompts()})


class JournalPageListView(APIView):
    """GET /api/v1/journal/pages — OWN pages, cursor + owner-scoped search.
    POST — create (published topic reference only)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        page_size = validate_page_size(request.query_params.get("page_size"))
        cursor = request.query_params.get("cursor") or None
        search = request.query_params.get("search") or None
        rows, next_cursor = JournalPageService().list_own(
            owner_id=str(request.user.pk), cursor=cursor,
            page_size=page_size, search=search)
        return Response({"next": next_cursor,
                         "results": [row.owner_view() for row in rows]})

    def post(self, request):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={
            "topic_code", "title", "content"})
        page = JournalPageService().create(
            owner_id=str(request.user.pk),
            topic_code=payload.get("topic_code", ""),
            title=payload.get("title", ""),
            content=payload.get("content"))
        return Response(page.owner_view(), status=201)


class JournalPageDetailView(APIView):
    """GET — owner-only. PATCH — owner-only with expected_revision guard
    (offline/reload conflict -> 409, never silent merge). DELETE — discard;
    cascades shares and context-bound replies."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, page_id: str):
        page_uuid = validate_uuid(page_id, field="page_id")
        page = JournalPageService().get_own(owner_id=str(request.user.pk),
                                            page_id=str(page_uuid))
        return Response(page.owner_view())

    def patch(self, request, page_id: str):
        page_uuid = validate_uuid(page_id, field="page_id")
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={
            "title", "content", "expected_revision"})
        expected = validate_revision(payload.get("expected_revision"),
                                     field="expected_revision")
        page = JournalPageService().edit(
            owner_id=str(request.user.pk), page_id=str(page_uuid),
            title=payload.get("title"), content=payload.get("content"),
            expected_revision=expected)
        return Response(page.owner_view())

    def delete(self, request, page_id: str):
        page_uuid = validate_uuid(page_id, field="page_id")
        JournalPageService().discard(owner_id=str(request.user.pk),
                                     page_id=str(page_uuid))
        return Response({"page_id": str(page_uuid), "deleted": True})


class JournalPageSharesView(APIView):
    """GET /api/v1/journal/pages/{id}/shares — owner sees active grants."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, page_id: str):
        page_uuid = validate_uuid(page_id, field="page_id")
        JournalPageService().get_own(owner_id=str(request.user.pk),
                                     page_id=str(page_uuid))
        rows = JournalShareService().list_shared_by_me(
            owner_id=str(request.user.pk), page_id=str(page_uuid))
        return Response({"results": [row.grant_view() for row in rows]})


class JournalPageShareCreateView(APIView):
    """POST — share EXACTLY this page at its CURRENT revision with ONE
    connected recipient. No history-wide share exists."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, page_id: str):
        page_uuid = validate_uuid(page_id, field="page_id")
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"recipient_id", "expected_revision"})
        recipient_id = validate_uuid(payload.get("recipient_id"),
                                     field="recipient_id")
        share = JournalShareService().share(
            owner_id=str(request.user.pk), page_id=str(page_uuid),
            recipient_id=str(recipient_id),
            expected_revision=validate_revision(payload["expected_revision"], field="expected_revision")
            if "expected_revision" in payload else None)
        return Response(share.grant_view(), status=201)


class JournalPageRepliesView(APIView):
    """GET — owner reads reflections received on THEIR page."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, page_id: str):
        page_uuid = validate_uuid(page_id, field="page_id")
        rows = JournalShareService().list_replies_for_owner(
            owner_id=str(request.user.pk), page_id=str(page_uuid))
        return Response({"results": [row.view(viewer_id=request.user.pk)
                                     for row in rows]})


class JournalSharedWithMeView(APIView):
    """GET /api/v1/journal/shared — pages shared WITH me (grant active,
    revision current; DB-filtered)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = JournalShareService().list_shared_with_me(
            recipient_id=str(request.user.pk))
        return Response({"results": [{
            "share_id": str(row.id),
            "page_id": str(row.page_id),
            "owner_id": str(row.owner_id),
            "title": row.page.title,
            "approved_revision": row.approved_revision,
            "shared_at": row.created_at.isoformat(),
        } for row in rows]})


class JournalSharedDetailView(APIView):
    """GET /api/v1/journal/shared/{id} — recipient read; everything
    re-checked live (fail closed)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, share_id: str):
        share_uuid = validate_uuid(share_id, field="share_id")
        data = JournalShareService().read_shared(
            recipient_id=str(request.user.pk), share_id=str(share_uuid))
        return Response(data)


class JournalSharedReplyView(APIView):
    """POST /api/v1/journal/shared/{id}/replies — song hành response; the
    grant must be VALID NOW; one reply per (page, responder), editable."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, share_id: str):
        share_uuid = validate_uuid(share_id, field="share_id")
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"body"})
        reply = JournalShareService().write_reply(
            responder_id=str(request.user.pk), share_id=str(share_uuid),
            body=payload.get("body"))
        return Response(reply.view(viewer_id=request.user.pk), status=201)


class JournalMyRepliesView(APIView):
    """GET /api/v1/journal/my-replies — the responder's OWN reflections."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = JournalShareService().list_my_replies(
            responder_id=str(request.user.pk))
        return Response({"results": [row.view(viewer_id=request.user.pk)
                                     for row in rows]})


class JournalShareRevokeView(APIView):
    """POST /api/v1/journal/shares/{id}/revoke — owner-only; immediate;
    revoking never unlocks the page through the reply path."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, share_id: str):
        share_uuid = validate_uuid(share_id, field="share_id")
        reject_unknown_fields(_json_body(request), allowed=set())
        share = JournalShareService().revoke(owner_id=str(request.user.pk),
                                             share_id=str(share_uuid))
        return Response(share.grant_view())
