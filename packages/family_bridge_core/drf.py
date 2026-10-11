"""Django/DRF integration helpers (import only where DRF is available).

- Stable error envelope exception handler for every feature API.
- Cursor pagination helper implementing the DSA-05 contract: stable order
  (created_at, id), filter authorization in the DB BEFORE pagination, page
  default 20 / max 50, no full-table COUNT per page.
"""

from __future__ import annotations

import base64
import json
from typing import Any, Dict, Iterable, List, Optional, Tuple

from django.core.exceptions import PermissionDenied
from django.http import Http404
from rest_framework import exceptions as drf_exceptions
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from .errors import FamilyBridgeError
from .validation import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE

CODE_BY_DRF = {
    "NotAuthenticated": "not_authenticated",
    "AuthenticationFailed": "not_authenticated",
    "PermissionDenied": "not_authorized",
    "NotFound": "not_found",
    "MethodNotAllowed": "input_invalid",
    "NotAcceptable": "input_invalid",
    "UnsupportedMediaType": "input_invalid",
    "ParseError": "input_invalid",
    "Throttled": "rate_limited",
    "ValidationError": "input_invalid",
}


class FamilyBridgeAPIError(FamilyBridgeError, drf_exceptions.APIException):
    """Raise inside views/services; converted by fb_exception_handler."""


def fb_exception_handler(exc: Exception, context: dict) -> Optional[Response]:
    """Map every known error to {"error": {"code", "details"}} envelope.

    Unknown exceptions fall through to DRF handler (500 generic); never leak
    stack traces, provider prompts or private bodies.
    """
    if isinstance(exc, FamilyBridgeError) and not isinstance(
            exc, drf_exceptions.APIException):
        return Response(exc.to_payload(), status=exc.http_status)
    response = drf_exception_handler(exc, context)
    if response is None:
        if isinstance(exc, Http404):
            return Response({"error": {"code": "not_found", "details": {}}},
                            status=404)
        if isinstance(exc, PermissionDenied):
            return Response({"error": {"code": "not_authorized", "details": {}}},
                            status=403)
        return None
    detail = response.data
    code = "input_invalid"
    details: Any = detail
    if isinstance(detail, dict) and "code" in detail and "details" in detail:
        return response  # already in envelope form
    if isinstance(detail, str):
        details = {"reason": detail[:200]}
    elif isinstance(detail, dict):
        flat: Dict[str, Any] = {}
        for key, value in list(detail.items())[:20]:
            flat[str(key)] = value[0] if isinstance(value, list) and value and \
                isinstance(value[0], str) else value
        details = flat
    elif isinstance(detail, list) and detail and isinstance(detail[0], str):
        details = {"reason": "; ".join(str(x)[:100] for x in detail[:5])}
    if getattr(exc, "__class__", None) is not None:
        code = CODE_BY_DRF.get(exc.__class__.__name__, code)
    if isinstance(exc, drf_exceptions.Throttled):
        details = {"reason": "rate_limited",
                   "wait_seconds": getattr(exc, "wait", None)}
    return Response({"error": {"code": code, "details": details}},
                    status=response.status_code)


# --- Cursor pagination (created_at, id) -------------------------------------

def _encode_cursor(created_at_iso: str, row_id: str) -> str:
    raw = json.dumps({"t": created_at_iso, "id": row_id},
                     separators=(",", ":"), sort_keys=True)
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii")


def _decode_cursor(token: str) -> Tuple[str, str]:
    try:
        raw = base64.urlsafe_b64decode(token.encode("ascii")).decode("utf-8")
        data = json.loads(raw)
        return str(data["t"]), str(data["id"])
    except Exception as exc:  # malformed cursor rejected loudly
        raise drf_exceptions.ValidationError(
            {"cursor": "invalid_cursor"}) from exc


def cursor_paginate(queryset, *, cursor: Optional[str],
                    page_size: int, timestamp_field: str = "created_at",
                    id_field: str = "id", descending: bool = True) -> Tuple[List[Any], Optional[str]]:
    """Stable (timestamp, id) keyset pagination. Returns (items, next_cursor).

    queryset must already carry the authorization filters (DSA-04: rights are
    filtered in the DB before pagination). The cursor is a position, never a
    permission: every request re-applies its own auth filtering.
    """
    if not 1 <= int(page_size) <= MAX_PAGE_SIZE:
        page_size = min(max(int(page_size or DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE)
    from django.db.models import Q
    qs = queryset
    if cursor:
        token_time, token_id = _decode_cursor(cursor)
        if descending:
            qs = qs.filter(
                Q(**{f"{timestamp_field}__lt": token_time}) |
                Q(**{f"{timestamp_field}": token_time,
                     f"{id_field}__lt": token_id})
            )
        else:
            qs = qs.filter(
                Q(**{f"{timestamp_field}__gt": token_time}) |
                Q(**{f"{timestamp_field}": token_time,
                     f"{id_field}__gt": token_id})
            )
    order = [f"-{timestamp_field}", f"-{id_field}"] if descending else \
            [timestamp_field, id_field]
    rows = list(qs.order_by(*order)[: page_size + 1])
    has_more = len(rows) > page_size
    items = rows[:page_size]
    next_cursor = None
    if has_more and items:
        last = items[-1]
        ts = getattr(last, timestamp_field)
        next_cursor = _encode_cursor(ts.isoformat() if hasattr(ts, "isoformat")
                                     else str(ts), str(getattr(last, id_field)))
    return items, next_cursor
