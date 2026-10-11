"""F12 models: AppointmentRequest + AppointmentSlot (US-038/US-046).

State machine (WF): submitted -> assigned -> slot_proposed -> scheduled
-> completed | cancelled; a new proposal supersedes older open slots and
requires a FRESH acceptance (stale acceptances are rejected 409).

Invariants:
- Scheduling is CONDITIONAL: every staff-side endpoint (and request
  creation) gates on the staff directory provider being wired AND
  non-empty — production stays module_unavailable until real operators
  exist (US-046 gate). Local tests use synthetic staff, clearly labelled.
- note is visible ONLY to the requester and the CURRENTLY assigned
  handler (capability-checked at read time) — never to school-wide scope
  or other staff.
- Slot times are UTC; overlap for the same handler is checked atomically
  (select_for_update); capacity = 1 per handler per window.
- Submitting a request never claims an appointment exists.
"""

import datetime as dt
import uuid

from django.conf import settings
from django.db import models

from family_bridge_core.timeutils import UTC

TOPICS = ("hoc_tap", "tinh_cam", "khac")
SLOT_MINUTES = 30

STATUS_SUBMITTED = "submitted"
STATUS_ASSIGNED = "assigned"
STATUS_SLOT_PROPOSED = "slot_proposed"
STATUS_SCHEDULED = "scheduled"
STATUS_CANCELLED = "cancelled"
STATUS_COMPLETED = "completed"

OPEN_STATUSES = (STATUS_SUBMITTED, STATUS_ASSIGNED, STATUS_SLOT_PROPOSED,
                 STATUS_SCHEDULED)


def _utc_now() -> dt.datetime:
    return dt.datetime.now(tz=UTC)


class AppointmentRequest(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    requester = models.ForeignKey(settings.AUTH_USER_MODEL,
                                  on_delete=models.CASCADE,
                                  related_name="f12_requests")
    handler_id = models.CharField(max_length=64, blank=True, default="")
    topic = models.CharField(max_length=16)
    note = models.TextField(blank=True, default="")
    status = models.CharField(max_length=24, default=STATUS_SUBMITTED)
    revision = models.PositiveIntegerField(default=1, editable=False)
    created_at = models.DateTimeField(default=_utc_now, editable=False)
    updated_at = models.DateTimeField(default=_utc_now, editable=False)

    class Meta:
        app_label = "f12_appointments"
        indexes = [
            models.Index(fields=["requester", "updated_at"]),
            models.Index(fields=["handler_id", "status"]),
        ]

    def view(self, *, include_note: bool) -> dict:
        data = {
            "request_id": str(self.id),
            "requester_id": str(self.requester_id),
            "topic": self.topic,
            "status": self.status,
            "revision": self.revision,
            "has_handler": bool(self.handler_id),
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }
        if include_note:
            data["note"] = self.note
            data["handler_id"] = self.handler_id or None
        return data


class AppointmentSlot(models.Model):
    STATUS_PROPOSED = "proposed"
    STATUS_ACCEPTED = "accepted"
    STATUS_DECLINED = "declined"
    STATUS_SUPERSEDED = "superseded"
    STATUS_CANCELLED = "cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    request = models.ForeignKey(AppointmentRequest, on_delete=models.CASCADE,
                                related_name="slots")
    handler_id = models.CharField(max_length=64)
    start_at = models.DateTimeField()
    end_at = models.DateTimeField()
    revision = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=16, default=STATUS_PROPOSED)
    created_at = models.DateTimeField(default=_utc_now, editable=False)

    class Meta:
        app_label = "f12_appointments"
        indexes = [
            models.Index(fields=["request", "created_at"]),
            models.Index(fields=["handler_id", "start_at"]),
        ]

    def view(self) -> dict:
        return {
            "slot_id": str(self.id),
            "start_at": self.start_at.isoformat(),
            "end_at": self.end_at.isoformat(),
            "revision": self.revision,
            "status": self.status,
        }
