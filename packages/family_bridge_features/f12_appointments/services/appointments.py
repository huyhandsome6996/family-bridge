"""F12 service: conditional appointment scheduling (US-038/US-046).

Gates (production-off until real operators exist):
- staff directory unwired OR empty -> module_unavailable for scheduling
  endpoints (request creation included — no orphan requests pile up).

Flow: create(submitted) -> handler self-claim with capability (assigned)
-> propose slot (atomic overlap check; supersedes older open slots and
bumps the request revision) -> requester accepts THE CURRENT slot revision
(scheduled) or declines (back to assigned) -> complete/cancel. Stale
acceptances are rejected with preview_stale semantics (409). Notes are
readable by requester + CURRENT capable handler only (read-time check —
a revoked handler loses access instantly)."""

from __future__ import annotations

import datetime as dt
from typing import Any, Dict, List, Optional

from django.db import transaction

from family_bridge_core.errors import (
    InputInvalid, ModuleUnavailable, NotFound, PreviewStale,
    SlotUnavailable,
)
from family_bridge_core.timeutils import UTC
from family_bridge_core.validation import MAX_TEXT_CHARS

from ..models import (
    SLOT_MINUTES, STATUS_ASSIGNED, STATUS_CANCELLED, STATUS_COMPLETED,
    STATUS_SCHEDULED, STATUS_SLOT_PROPOSED, STATUS_SUBMITTED, TOPICS,
    AppointmentRequest, AppointmentSlot,
)
from . import registry


def _now() -> dt.datetime:
    return dt.datetime.now(tz=UTC)


def _staff_directory():
    staff = registry.get_staff_directory()
    if staff is None or not list(staff.list_handlers()):
        raise ModuleUnavailable({"reason": "scheduling_no_staff"})
    return staff


def _require_request(*, request_id: str) -> AppointmentRequest:
    request = AppointmentRequest.objects.filter(pk=request_id).first()
    if request is None:
        raise NotFound({"reason": "request_not_found"})
    return request


class AppointmentService:
    # -- school directory (US-038) ---------------------------------------------
    def school_contacts(self) -> List[Dict[str, Any]]:
        """Verified school contacts for the logged-in user; same defensive
        filtering as F13 (never show unverified/retired/expired numbers)."""
        provider = registry.get_school_directory()
        if provider is None:
            return []
        now = _now()
        today = now.date()
        out: List[Dict[str, Any]] = []
        for raw in (provider.list_public_contacts(now=now) or [])[:20]:
            if not isinstance(raw, dict):
                continue
            if raw.get("verified") is False or raw.get("status") == "retired":
                continue
            review_due = raw.get("review_due")
            if isinstance(review_due, str):
                try:
                    review_due = dt.date.fromisoformat(review_due[:10])
                except ValueError:
                    review_due = None
            current = review_due is None or (
                isinstance(review_due, dt.date) and review_due >= today)
            out.append({
                "contact_id": str(raw.get("contact_id", ""))[:64],
                "public_name": str(raw.get("public_name", ""))[:200],
                "phone": str(raw.get("phone", "")) if current else "",
                "accepting_appointments": bool(
                    raw.get("accepting_appointments", False)),
                "status": ("verified" if current
                           else "verification_expired"),
                "operating_hours": raw.get("hours", {"always": True}),
            })
        return out

    # -- request lifecycle -------------------------------------------------------
    @transaction.atomic
    def create_request(self, *, requester_id: str, topic: str,
                       note: str) -> AppointmentRequest:
        _staff_directory()  # gate: scheduling must be live
        if topic not in TOPICS:
            raise InputInvalid({"field": "topic", "reason": "invalid_topic",
                                "allowed": list(TOPICS)})
        if note and (not isinstance(note, str) or len(note) > MAX_TEXT_CHARS):
            raise InputInvalid({"field": "note", "reason": "too_long",
                                "max": MAX_TEXT_CHARS})
        return AppointmentRequest.objects.create(
            requester_id=str(requester_id), topic=topic, note=note or "")

    def _readable(self, request: AppointmentRequest, viewer_id: str,
                  staff) -> bool:
        if str(request.requester_id) == str(viewer_id):
            return True
        return bool(request.handler_id
                    and request.handler_id == str(viewer_id)
                    and staff.has_capability(viewer_id))

    def get_request(self, *, request_id: str, viewer_id: str,
                    include_note: bool = True) -> Dict[str, Any]:
        staff = _staff_directory()
        request = _require_request(request_id=request_id)
        if not self._readable(request, str(viewer_id), staff):
            raise NotFound({"reason": "request_not_found"})
        view = request.view(include_note=include_note)
        view["slots"] = [slot.view() for slot in
                         request.slots.order_by("-created_at")[:5]]
        return view

    def list_own(self, *, requester_id: str):
        _staff_directory()
        rows = AppointmentRequest.objects.filter(
            requester_id=str(requester_id)).order_by("-updated_at")[:20]
        return [row.view(include_note=True) for row in rows]

    def queue_for_handler(self, *, handler_id: str):
        staff = _staff_directory()
        if not staff.has_capability(str(handler_id)):
            raise NotFound({"reason": "request_not_found"})  # no scope leak
        rows = AppointmentRequest.objects.filter(
            handler_id=str(handler_id),
            status__in=(STATUS_ASSIGNED, STATUS_SLOT_PROPOSED,
                        STATUS_SCHEDULED)).order_by("-updated_at")[:20]
        return [row.view(include_note=True) for row in rows]

    @transaction.atomic
    def claim(self, *, request_id: str, handler_id: str) -> AppointmentRequest:
        """Capability-holding operator claims the request (assignment). A
        claim by someone WITHOUT the capability is a silent no-scope (404):
        school-wide visibility never opens the queue."""
        staff = _staff_directory()
        if not staff.has_capability(str(handler_id)):
            raise NotFound({"reason": "request_not_found"})
        request = _require_request(request_id=request_id)
        if request.status != STATUS_SUBMITTED:
            raise InputInvalid({"reason": "request_not_claimable",
                                "status": request.status})
        if request.handler_id and request.handler_id != str(handler_id):
            raise InputInvalid({"reason": "already_assigned"})
        request.handler_id = str(handler_id)
        request.status = STATUS_ASSIGNED
        request.revision += 1
        request.updated_at = _now()
        request.save()
        return request

    @transaction.atomic
    def propose_slot(self, *, request_id: str, handler_id: str,
                     start_at: dt.datetime) -> Dict[str, Any]:
        staff = _staff_directory()
        if not staff.has_capability(str(handler_id)):
            raise NotFound({"reason": "request_not_found"})
        request = _require_request(request_id=request_id)
        if request.status not in (STATUS_ASSIGNED, STATUS_SLOT_PROPOSED):
            raise InputInvalid({"reason": "request_not_proposable",
                                "status": request.status})
        if request.handler_id != str(handler_id):
            raise NotFound({"reason": "request_not_found"})
        if start_at.tzinfo is None:
            raise InputInvalid({"field": "start_at",
                                "reason": "must_be_tz_aware_iso"})
        start_at = start_at.astimezone(dt.timezone.utc)
        end_at = start_at + dt.timedelta(minutes=SLOT_MINUTES)
        if start_at < _now():
            raise InputInvalid({"field": "start_at",
                                "reason": "must_be_in_future"})
        # Atomic overlap guard for THIS handler (capacity 1 per window).
        overlapping = (AppointmentSlot.objects
                       .select_for_update()
                       .filter(handler_id=str(handler_id),
                               status=AppointmentSlot.STATUS_ACCEPTED,
                               start_at__lt=end_at, end_at__gt=start_at))
        if overlapping.exists():
            raise SlotUnavailable({"reason": "handler_already_booked"})
        # Supersede older open slots; requester must accept the NEW revision.
        request.slots.filter(
            status=AppointmentSlot.STATUS_PROPOSED).update(
            status=AppointmentSlot.STATUS_SUPERSEDED)
        slot = AppointmentSlot.objects.create(
            request=request, handler_id=str(handler_id),
            start_at=start_at, end_at=end_at)
        request.status = STATUS_SLOT_PROPOSED
        request.revision += 1
        request.updated_at = _now()
        request.save()
        return {"slot": slot.view(), "request_revision": request.revision,
                "note": "chưa có lịch hẹn nào cho tới khi học sinh xác nhận"}

    @transaction.atomic
    def accept_slot(self, *, request_id: str, slot_id: str,
                    requester_id: str) -> Dict[str, Any]:
        request = _require_request(request_id=request_id)
        if str(request.requester_id) != str(requester_id):
            raise NotFound({"reason": "request_not_found"})
        if request.status not in (STATUS_SLOT_PROPOSED,):
            raise InputInvalid({"reason": "no_open_proposal",
                                "status": request.status})
        slot = request.slots.select_for_update().filter(pk=slot_id).first()
        if slot is None:
            raise NotFound({"reason": "slot_not_found"})
        if slot.status != AppointmentSlot.STATUS_PROPOSED:
            raise PreviewStale({"reason": "slot_superseded_or_cancelled"})
        current = request.slots.filter(
            status=AppointmentSlot.STATUS_PROPOSED).order_by(
            "-created_at").first()
        if current is None or current.id != slot.id:
            raise PreviewStale({"reason": "newer_proposal_exists"})
        slot.status = AppointmentSlot.STATUS_ACCEPTED
        slot.save(update_fields=["status"])
        request.status = STATUS_SCHEDULED
        request.updated_at = _now()
        request.save()
        return {"request_id": str(request.id), "status": "scheduled",
                "slot": slot.view()}

    @transaction.atomic
    def decline_slot(self, *, request_id: str, slot_id: str,
                     requester_id: str) -> Dict[str, Any]:
        request = _require_request(request_id=request_id)
        if str(request.requester_id) != str(requester_id):
            raise NotFound({"reason": "request_not_found"})
        slot = request.slots.filter(pk=slot_id).first()
        if slot is None or slot.status != AppointmentSlot.STATUS_PROPOSED:
            raise NotFound({"reason": "slot_not_found"})
        slot.status = AppointmentSlot.STATUS_DECLINED
        slot.save(update_fields=["status"])
        request.status = STATUS_ASSIGNED  # handler may propose another time
        request.updated_at = _now()
        request.save()
        return {"request_id": str(request.id), "status": "assigned"}

    @transaction.atomic
    def cancel(self, *, request_id: str, actor_id: str) -> Dict[str, Any]:
        staff = _staff_directory()
        request = _require_request(request_id=request_id)
        allowed = (str(request.requester_id) == str(actor_id)
                   or (request.handler_id == str(actor_id)
                       and staff.has_capability(str(actor_id))))
        if not allowed:
            raise NotFound({"reason": "request_not_found"})
        if request.status == STATUS_CANCELLED:
            return {"request_id": str(request.id), "status": "cancelled"}
        if request.status not in (STATUS_SUBMITTED, STATUS_ASSIGNED,
                                  STATUS_SLOT_PROPOSED, STATUS_SCHEDULED):
            raise InputInvalid({"reason": "request_not_cancellable"})
        request.slots.filter(
            status=AppointmentSlot.STATUS_PROPOSED).update(
            status=AppointmentSlot.STATUS_CANCELLED)
        request.status = STATUS_CANCELLED
        request.updated_at = _now()
        request.save()
        return {"request_id": str(request.id), "status": "cancelled"}

    @transaction.atomic
    def complete(self, *, request_id: str, handler_id: str) -> Dict[str, Any]:
        staff = _staff_directory()
        if not staff.has_capability(str(handler_id)):
            raise NotFound({"reason": "request_not_found"})
        request = _require_request(request_id=request_id)
        if request.handler_id != str(handler_id) or \
                request.status != STATUS_SCHEDULED:
            raise InputInvalid({"reason": "request_not_completable"})
        request.status = STATUS_COMPLETED
        request.updated_at = _now()
        request.save()
        return {"request_id": str(request.id), "status": "completed"}
