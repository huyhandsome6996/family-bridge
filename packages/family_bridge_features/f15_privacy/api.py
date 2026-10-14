"""F15 API: privacy overview, grant revocation, deletion requests (lifecycle
+ handler workflow), consent withdrawal (owner-only; admin actors get NO
bypass — SEC-03/04; handlers need the B16 ``privacy.case`` capability, which
is fail-closed until B16 ships it).

Envelope/contract details are documented in docs/features/f15/api.md.
All mutating views share a per-actor throttle (SEC-14) defined in this
package so no shared settings file must change.
"""

from __future__ import annotations

import json
from urllib.parse import unquote

from django.db import transaction
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from family_bridge_core.errors import (
    InputInvalid, ModuleUnavailable, NotFound,
)
from family_bridge_core.validation import (
    reject_unknown_fields, validate_enum, validate_uuid,
)

from .auth import FBSDSessionAuthentication
from .models import DeletionLedgerEvent, DeletionRequest
from .services import registry as grant_registry
from .services.deletion import DeletionService
from .services import ports as privacy_ports
from .services.verification import ACTION_PROCESS, ACTION_VERIFY

_PAGE_LIMIT_DEFAULT = 20
_PAGE_LIMIT_MAX = 50
_PROVIDER_BATCH = 100  # per-provider fetch batch (providers bound too)


class PrivacyMutationThrottle(SimpleRateThrottle):
    """Per-actor rate limit for privacy mutations (SEC-14). Rate lives here
    (package-owned default) so harness/production settings need no change;
    deployments may tighten via ``DEFAULT_THROTTLE_RATES['privacy_write']``."""

    scope = "privacy_write"
    default_rate = "30/hour"

    def get_rate(self):
        rates = self.THROTTLE_RATES.get(self.scope)
        if rates:
            return rates
        return self.default_rate

    def get_cache_key(self, request, view):
        if request.user is not None and request.user.is_authenticated:
            ident = str(request.user.pk)
        else:
            ident = self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}


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


def _parse_cursor(raw: str) -> str:
    if not raw:
        return ""
    try:
        return unquote(raw)
    except Exception as exc:
        raise InputInvalid({"field": "cursor", "reason": "malformed"}) from exc


# -- overview pagination (R09) -------------------------------------------------
# Cursor v2: "ov2|<created_at_iso>|<share_id>". The (created_at, share_id)
# pair is a TOTAL order across providers (share ids are unique) and matches
# each provider's SQL ORDER BY (created_at DESC, id DESC), so the merge below
# cannot drop or duplicate rows at any depth.
_CURSOR_V2_PREFIX = "ov2|"


def _grant_order_key(grant: dict) -> tuple:
    """Descending order key: (created_at, share_id). Both fixed-shape
    strings; max() = newest. ``share_id`` falls back to item_id for
    minimal lab providers without a share id."""
    return (str(grant.get("created_at") or ""),
            str(grant.get("share_id") or grant.get("item_id") or ""))


def _parse_overview_cursor(cursor: str):
    if not cursor:
        return None
    if not cursor.startswith(_CURSOR_V2_PREFIX):
        raise InputInvalid({"field": "cursor", "reason": "malformed"})
    raw = cursor[len(_CURSOR_V2_PREFIX):]
    parts = raw.split("|", 1)
    if len(parts) != 2 or not parts[0] or not parts[1]:
        raise InputInvalid({"field": "cursor", "reason": "malformed"})
    try:
        import datetime as _dt
        parsed = _dt.datetime.fromisoformat(parts[0])
    except ValueError as exc:
        raise InputInvalid({"field": "cursor", "reason": "malformed"}) from exc
    if parsed.tzinfo is None:
        raise InputInvalid({"field": "cursor",
                            "reason": "cursor_time_must_be_tz_aware"})
    return parts[0], parts[1]


def _overview_page(owner_id: str, cursor: str, limit: int) -> dict:
    """K-way merge over per-provider streams with DATABASE-level cursors
    (R09 fix). The previous implementation fetched the newest 100 rows per
    provider and Python-filtered the cursor afterwards, so a domain with
    more than 100 grants was silently unreachable past item 100. Now each
    provider is pulled in bounded batches with an exclusive (created_at,
    share_id) SQL cursor until ``limit + 1`` merged items are collected —
    no missing, no duplicates, at any total count.

    Providers that do not support cursor kwargs (lab fixtures) degrade to a
    single bounded batch — documented limitation, never used in production
    wiring."""
    after = _parse_overview_cursor(cursor)
    item_types = list(grant_registry.registered_item_types())

    buffers: dict = {}
    exhausted: set = set()
    provider_cursors: dict = {it: after for it in item_types}

    def fetch(it):
        provider = grant_registry.get_grant_provider(it)
        if provider is None:
            exhausted.add(it)
            return
        supports = (grant_registry.provider_accepts(provider, "list_grants",
                                                    "after_created_at")
                    and grant_registry.provider_accepts(provider, "list_grants",
                                                        "after_share_id"))
        if supports:
            after_at, after_id = provider_cursors[it] or (None, None)
            batch = provider.list_grants(
                owner_id=str(owner_id), limit=_PROVIDER_BATCH,
                after_created_at=after_at, after_share_id=after_id)
            if len(batch) < _PROVIDER_BATCH:
                exhausted.add(it)
            elif batch:
                last = batch[-1]
                provider_cursors[it] = (str(last.get("created_at") or ""),
                                        str(last.get("share_id")
                                            or last.get("item_id") or ""))
        else:
            batch = provider.list_grants(owner_id=str(owner_id))
            if provider_cursors[it] is not None and batch:
                at, sid = provider_cursors[it]
                batch = [g for g in batch if _grant_order_key(g) < (at, sid)]
            exhausted.add(it)  # legacy provider: single bounded batch only
        for g in batch:
            g.setdefault("item_type", it)
            buffers.setdefault(it, []).append(g)

    page: list = []
    while len(page) < limit + 1:
        pending = [it for it in item_types
                   if it not in exhausted and not buffers.get(it)]
        if not pending and not any(buffers.get(it) for it in item_types):
            break
        for it in pending:
            fetch(it)
        heads = [(it, _grant_order_key(buffers[it][0]))
                 for it in item_types if buffers.get(it)]
        if not heads:
            break
        # max() = newest (descending order)
        it_pick, _key = max(heads, key=lambda pair: pair[1])
        page.append(buffers[it_pick].pop(0))

    has_more = len(page) > limit
    page = page[:limit]
    next_cursor = None
    if page and has_more:
        last_at, last_sid = _grant_order_key(page[-1])
        next_cursor = f"{_CURSOR_V2_PREFIX}{last_at}|{last_sid}"
    return {"page": page, "next_cursor": next_cursor, "has_more": has_more}


class PrivacyOverviewView(APIView):
    """GET /api/v1/privacy/overview — the owner's privacy page data.

    Cursor pagination: ``?cursor=<opaque>&limit=<1..50>``; response carries
    ``next_cursor``/``has_more`` so NO grant silently falls off the list
    (the old implementation iterated everything then sliced [:50])."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            limit = int(request.query_params.get("limit", _PAGE_LIMIT_DEFAULT))
        except (TypeError, ValueError):
            raise InputInvalid({"field": "limit", "reason": "must_be_integer"})
        limit = max(1, min(limit, _PAGE_LIMIT_MAX))
        cursor = _parse_cursor(request.query_params.get("cursor", ""))

        result = _overview_page(str(request.user.pk), cursor, limit)
        shared_by_me = [{
            "item_type": g["item_type"],
            "item_id": g["item_id"],
            "share_id": g.get("share_id"),
            "recipient_id": g["recipient_id"],
            "approved_revision": g["approved_revision"],
            "revoked": bool(g.get("revoked", False)),
        } for g in result["page"]]

        connections = []
        connections_next_cursor = None
        reader = privacy_ports.get_connection_reader()
        if reader is not None and hasattr(reader, "list_active_for_user"):
            views, connections_next_cursor = reader.list_active_for_user(
                user_id=str(request.user.pk), limit=_PAGE_LIMIT_MAX,
                cursor=request.query_params.get("connections_cursor"))
            for view in list(views)[:_PAGE_LIMIT_MAX]:
                other = view.party_b if view.party_a == str(request.user.pk) \
                    else view.party_a
                connections.append({
                    "connection_id": view.connection_id,
                    "other_party_id": other,
                    "relationship_kind": view.relationship_kind,
                    "generation": view.generation,
                    "status": view.status,
                })
        return Response({"shared_by_me": shared_by_me,
                         "connections": connections,
                         "connections_next_cursor": connections_next_cursor,
                         "next_cursor": result["next_cursor"],
                         "has_more": result["has_more"]})


class GrantRevokeView(APIView):
    """POST /api/v1/privacy/grants/{item_type}/{item_id}/revoke

    ``expected_revision`` (optional int) is validated against the grant's
    bound item revision; a stale value answers 409 ``revision_conflict``.
    Mutation + ledger event commit atomically."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [PrivacyMutationThrottle]

    def post(self, request, item_type: str, item_id: str):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"recipient_id", "expected_revision"})
        recipient_id = payload.get("recipient_id")
        if recipient_id is not None:
            validate_uuid(recipient_id, field="recipient_id")
        expected_revision = payload.get("expected_revision")
        if expected_revision is not None and (
                isinstance(expected_revision, bool)
                or not isinstance(expected_revision, int)
                or expected_revision < 1):
            raise InputInvalid({"field": "expected_revision",
                                "reason": "must_be_positive_integer"})
        item_uuid = validate_uuid(item_id, field="item_id")
        outcome = grant_registry.revoke_grant(
            owner_id=str(request.user.pk), item_type=item_type,
            item_id=str(item_uuid), recipient_id=recipient_id,
            actor_ref=str(request.user.pk),
            expected_revision=expected_revision)
        if not outcome.get("found"):
            raise NotFound({"reason": "grant_not_found"})
        return Response({"item_type": item_type, "item_id": str(item_uuid),
                         "revoked": bool(outcome.get("revoked")),
                         "note": "Đọc mới bị chặn ngay; bản sao ngoài ứng dụng không thu hồi được."},
                        status=200)


class DeletionRequestView(APIView):
    """POST /api/v1/privacy/deletion-requests — owner requests deletion."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [PrivacyMutationThrottle]

    def post(self, request):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"categories"})
        service = DeletionService()
        result = service.request_deletion(user=request.user,
                                          categories=payload.get("categories"))
        status_code = 200 if result.get("duplicate") else 201
        return Response(result, status=status_code)


class DeletionRequestListView(APIView):
    """GET /api/v1/privacy/deletion-requests — OWNER-ONLY list so the app
    can recover status after a lost response or a re-opened Mini App
    (cursor pagination, bounded page)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            limit = int(request.query_params.get("limit", _PAGE_LIMIT_DEFAULT))
        except (TypeError, ValueError):
            raise InputInvalid({"field": "limit", "reason": "must_be_integer"})
        limit = max(1, min(limit, _PAGE_LIMIT_MAX))
        cursor = _parse_cursor(request.query_params.get("cursor", ""))
        service = DeletionService()
        result = service.list_requests(user=request.user, cursor=cursor or None,
                                       limit=limit)
        return Response(result)


class _OwnerRequestMixin:
    def _get_own_request(self, request, request_id: str) -> DeletionRequest:
        request_uuid = validate_uuid(request_id, field="request_id")
        row = (DeletionRequest.objects
               .filter(pk=str(request_uuid), user=request.user).first())
        if row is None:
            # Even is_staff/superuser actors receive 404 here (no bypass).
            raise NotFound({"reason": "deletion_request_not_found"})
        return row


class DeletionRequestDetailView(_OwnerRequestMixin, APIView):
    """GET /api/v1/privacy/deletion-requests/{id} — OWNER ONLY; no admin
    bypass through is_staff/superuser (handler access needs a real privacy
    role via B16 capabilities, and still never opens bodies)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, request_id: str):
        row = self._get_own_request(request, request_id)
        return Response({
            "request_id": str(row.pk),
            "status": row.status,
            "revision": row.revision,
            "scope_categories": row.scope_categories,
            "requested_at": row.requested_at.isoformat(),
            "completed_at": row.completed_at.isoformat() if row.completed_at else None,
            "failure_detail": row.failure_detail,
            "note": ("Trạng thái là thật: khi có hạng mục chưa xử lý xong, "
                     "yêu cầu ở trạng thái failed_needs_action."),
        })


class DeletionRequestCancelView(_OwnerRequestMixin, APIView):
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [PrivacyMutationThrottle]

    def post(self, request, request_id: str):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"expected_revision"})
        expected = payload.get("expected_revision")
        if expected is not None and (isinstance(expected, bool)
                                     or not isinstance(expected, int)):
            raise InputInvalid({"field": "expected_revision",
                                "reason": "must_be_integer"})
        validate_uuid(request_id, field="request_id")
        service = DeletionService()
        row = service.cancel_request(user=request.user, request_id=request_id,
                                     expected_revision=expected)
        return Response({"request_id": str(row.pk), "status": row.status,
                         "revision": row.revision})


class _HandlerRequestMixin:
    """Handler-side access: the actor is NOT the owner; authorization comes
    from the configured authorizer (B16 privacy.case) — fail-closed 503 when
    no authorizer is wired, 404 when the request does not exist, 403 when
    the actor lacks the capability."""

    def _authorized(self, request, request_id: str, action: str) -> None:
        authorizer = privacy_ports.get_handler_authorizer()
        if authorizer is None:
            raise ModuleUnavailable({"reason": "handler_authorizer_not_wired"})
        if not authorizer.authorize(actor_id=str(request.user.pk),
                                    action=action, request_id=str(request_id)):
            raise NotFound({"reason": "deletion_request_not_found"})


class DeletionRequestVerifyView(_HandlerRequestMixin, APIView):
    """POST /api/v1/privacy/deletion-requests/{id}/verify — HANDLER ONLY.

    Marks the ownership check as done. DEC-14/18 are OPEN: production runs
    fail-closed until the verification policy and B16 capability exist; the
    synthetic authorizer used in tests is explicit and never shipped."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [PrivacyMutationThrottle]

    def post(self, request, request_id: str):
        payload = _json_body(request)
        reject_unknown_fields(payload, allowed={"verifier_ref"})
        validate_uuid(request_id, field="request_id")
        self._authorized(request, request_id, ACTION_VERIFY)
        # R07 fix: the TRUSTED actor/action/request context travels to the
        # service — the service re-authorizes with the REAL actor id (never an
        # empty actor, never a client-supplied verifier_ref pretending to be
        # the audit actor). verifier_ref stays an optional bounded reference.
        verifier_ref = payload.get("verifier_ref")
        if verifier_ref is not None and (
                not isinstance(verifier_ref, str)
                or not (1 <= len(verifier_ref) <= 64)):
            raise InputInvalid({"field": "verifier_ref",
                                "reason": "malformed"})
        service = DeletionService()
        row = service.verify_request(
            request_id=request_id,
            verifier_ref=verifier_ref or str(request.user.pk),
            actor_id=str(request.user.pk),
            authorizer=privacy_ports.get_handler_authorizer())
        return Response({"request_id": str(row.pk), "status": row.status,
                         "revision": row.revision})


class DeletionRequestProcessView(_HandlerRequestMixin, APIView):
    """POST /api/v1/privacy/deletion-requests/{id}/process — HANDLER ONLY.

    Executes the approved categories with the persisted cutoff; truthful
    completed/failed_needs_action outcome; per-category checkpoints."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [PrivacyMutationThrottle]

    def post(self, request, request_id: str):
        # R12 fix: unknown fields are rejected (the comment used to promise
        # this without doing it).
        reject_unknown_fields(_json_body(request), allowed=set())
        validate_uuid(request_id, field="request_id")
        self._authorized(request, request_id, ACTION_PROCESS)
        service = DeletionService()
        row = service.process_request(request_id=request_id)
        return Response({"request_id": str(row.pk), "status": row.status,
                         "revision": row.revision,
                         "failure_detail": row.failure_detail})


class ConsentWithdrawView(APIView):
    """POST /api/v1/privacy/consents/{purpose}/withdraw — via the registered
    consent port (production: F01 store + F14 research mapping). Deny when
    the port is not configured (fail-closed 503, not a silent no-op)."""
    authentication_classes = [FBSDSessionAuthentication]
    permission_classes = [IsAuthenticated]
    throttle_classes = [PrivacyMutationThrottle]

    def post(self, request, purpose: str):
        validate_enum(purpose, field="purpose",
                      allowed=["service", "ai_processing", "research"])
        writer = privacy_ports.get_consent_writer()
        if writer is None:
            raise ModuleUnavailable({"reason": "consent_port_not_wired"})
        # R02 fix: consent mutation (F01/F14 stores) + durable ledger event
        # commit in ONE transaction. The writer's internal atomic joins this
        # transaction as a savepoint, so a failed ledger append rolls the
        # withdrawal back (state and event can never drift apart).
        with transaction.atomic():
            result = writer.withdraw(user_id=str(request.user.pk),
                                     purpose=purpose)
            changed = bool(result)
            if changed:
                DeletionLedgerEvent.objects.create(
                    target_user_id=str(request.user.pk),
                    actor_ref=str(request.user.pk),
                    event_type=DeletionLedgerEvent.EVENT_CONSENT_WITHDRAWN,
                    payload={"purpose": purpose})
        return Response({"purpose": purpose, "withdrawn": changed})
