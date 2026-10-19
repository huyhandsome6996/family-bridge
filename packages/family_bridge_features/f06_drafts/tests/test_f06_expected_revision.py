"""F06 N06 regression tests: optimistic-concurrency guard on edit.

Finding N06 (QA 19/10, P2): the same author opened one draft on web + Mini;
A loads revision 1, B saves -> revision 2 (HTTP 200), then A saves with the
revision-1 state -> still HTTP 200 (revision 3) and B's body is silently
overwritten. `expected_revision` (OPTIONAL, positive int) makes the stale
write fail loudly with 409 revision_conflict {reason: "draft_conflict",
current_revision: N} — details NEVER contain the draft body (redaction rule;
the client reconciles by re-reading the author-only GET draft endpoint).
Absent expected_revision keeps the pre-N06 behavior (backcompat for old
callers/harness scripts). The field is EDIT-ONLY: create keeps rejecting it
as an unknown field.
"""

import datetime as dt

from django.test import TestCase
from rest_framework.test import APIClient

from fixtures.actors import make_student, make_caregiver, make_system_admin

import labgrants.sessions as _lab_sessions
from labgrants.f06_fixtures import ControlledClock, FakeKindSender
from labgrants.f05_fixtures import make_test_connection

from family_bridge_core.errors import RevisionConflict

from ..models import DraftPreview
from ..services import registry
from ..services.drafts import DraftService
from .helpers import auth_header, make_session

START = dt.datetime(2026, 10, 11, 3, 0, 0, tzinfo=dt.timezone.utc)


class ExpectedRevisionApiBase(TestCase):
    def setUp(self):
        registry.reset_registries()
        registry.register_session_resolver(_lab_sessions.resolve_session)
        self.clock = ControlledClock(start=START)
        registry.register_clock(self.clock)  # API uses the same clock
        self.sender = FakeKindSender()
        registry.register_sender(kind="text", fn=self.sender)
        self.client = APIClient()
        self.student = make_student()
        self.caregiver = make_caregiver()
        self.admin = make_system_admin()
        self.connection = make_test_connection(self.student, self.caregiver)
        self.student_token, _ = make_session(self.student)
        self.caregiver_token, _ = make_session(self.caregiver)
        self.admin_token, _ = make_session(self.admin)

    def _create(self, token=None, **overrides):
        token = token or self.student_token
        payload = {"kind": "text", "body": "bản gốc (A soạn)",
                   "recipient_id": str(self.caregiver.pk)}
        payload.update(overrides)
        return self.client.post("/api/v1/drafts", payload, format="json",
                                **auth_header(token))

    def _edit(self, draft_id, payload, token=None):
        token = token or self.student_token
        return self.client.post(f"/api/v1/drafts/{draft_id}", payload,
                                format="json", **auth_header(token))

    def _get(self, draft_id, token=None):
        token = token or self.student_token
        return self.client.get(f"/api/v1/drafts/{draft_id}", format="json",
                               **auth_header(token))

    def _preview(self, draft_id, token=None):
        token = token or self.student_token
        return self.client.post(f"/api/v1/drafts/{draft_id}/preview", {},
                                format="json", **auth_header(token))


class EditExpectedRevisionApiTests(ExpectedRevisionApiBase):
    def test_stale_expected_revision_conflict_409_and_no_changes(self):
        """(a) stale write: expected_revision=1 while the draft is at 2 ->
        409 revision_conflict, draft + previews untouched."""
        draft_id = self._create().data["draft_id"]                # rev 1
        preview_id = self._preview(draft_id).data["preview_id"]   # binds rev 1
        # B saves the full form (C8 edit is a full-replace, so a realistic
        # client re-sends recipient_id with the body).
        saved = self._edit(draft_id, {"body": "bản B (web lưu)",
                                      "recipient_id": str(self.caregiver.pk)})
        self.assertEqual(saved.status_code, 200)
        stale = self._edit(draft_id, {"body": "bản A cũ (mini ghi đè)",
                                      "expected_revision": 1})
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(stale.data["error"]["code"], "revision_conflict")
        details = stale.data["error"]["details"]
        self.assertEqual(details["reason"], "draft_conflict")
        self.assertEqual(details["current_revision"], 2)
        self.assertNotIn("body", details)  # redaction rule: never leak body
        # Draft untouched: B's body, revision 2, recipient unchanged.
        current = self._get(draft_id)
        self.assertEqual(current.data["body"], "bản B (web lưu)")
        self.assertEqual(current.data["revision"], 2)
        self.assertEqual(current.data["recipient_id"], str(self.caregiver.pk))
        # The FAILED edit must not mark the existing preview used.
        self.assertFalse(DraftPreview.objects.get(pk=preview_id).used)

    def test_matching_expected_revision_saves(self):
        """(b) matching guard -> 200 with the revision bumped."""
        draft_id = self._create().data["draft_id"]  # rev 1
        ok = self._edit(draft_id, {"body": "đúng lô",
                                   "expected_revision": 1})
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.data["revision"], 2)
        self.assertEqual(ok.data["body"], "đúng lô")

    def test_edit_without_expected_revision_backcompat(self):
        """(c) absent expected_revision -> old behavior unchanged."""
        draft_id = self._create().data["draft_id"]
        ok = self._edit(draft_id, {"body": "caller cũ vẫn lưu được"})
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.data["revision"], 2)

    def test_expected_revision_invalid_values_rejected_400(self):
        """(d) bool/0/negative/non-int -> 400 input_invalid on the FIELD
        expected_revision (not a generic unknown_fields rejection)."""
        draft_id = self._create().data["draft_id"]
        for bad in (0, -1, "abc", True, 1.5):
            response = self._edit(draft_id, {"body": "x",
                                             "expected_revision": bad})
            self.assertEqual(response.status_code, 400, f"value={bad!r}")
            self.assertEqual(response.data["error"]["code"], "input_invalid",
                             f"value={bad!r}")
            self.assertEqual(response.data["error"]["details"].get("field"),
                             "expected_revision", f"value={bad!r}")
        self.assertEqual(self._get(draft_id).data["revision"],
                         1)  # nothing bumped by rejected edits

    def test_create_rejects_expected_revision(self):
        """Guard: expected_revision is EDIT-ONLY — create keeps rejecting
        it as an unknown field (no silent ignore)."""
        response = self._create(expected_revision=1)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["code"], "input_invalid")


class EditExpectedRevisionServiceTests(ExpectedRevisionApiBase):
    def test_service_edit_mismatch_raises_revision_conflict(self):
        """(e) direct service call (no HTTP): mismatch -> RevisionConflict,
        draft row untouched."""
        service = DraftService(clock=self.clock)
        draft = service.create(author_id=str(self.student.pk), kind="text",
                               body="bản gốc",
                               recipient_id=str(self.caregiver.pk))
        service.edit(author_id=str(self.student.pk), draft_id=str(draft.id),
                     body="bản B", card_id="", card_version=None,
                     recipient_id=str(self.caregiver.pk))  # -> rev 2
        with self.assertRaises(RevisionConflict) as ctx:
            service.edit(author_id=str(self.student.pk),
                         draft_id=str(draft.id), body="bản A cũ",
                         card_id="", card_version=None,
                         recipient_id=str(self.caregiver.pk),
                         expected_revision=1)
        self.assertEqual(ctx.exception.code, "revision_conflict")
        self.assertEqual(ctx.exception.details["reason"], "draft_conflict")
        self.assertEqual(ctx.exception.details["current_revision"], 2)
        fresh = service.get_own(author_id=str(self.student.pk),
                                draft_id=str(draft.id))
        self.assertEqual(fresh.body, "bản B")
        self.assertEqual(fresh.revision, 2)

    def test_service_edit_matching_and_absent_expected_revision(self):
        """Service level: matching guard saves (+1); absent guard keeps the
        legacy full-replace behavior."""
        service = DraftService(clock=self.clock)
        draft = service.create(author_id=str(self.student.pk), kind="text",
                               body="bản gốc",
                               recipient_id=str(self.caregiver.pk))
        ok = service.edit(author_id=str(self.student.pk),
                          draft_id=str(draft.id), body="khớp revision",
                          card_id="", card_version=None,
                          recipient_id=str(self.caregiver.pk),
                          expected_revision=1)
        self.assertEqual(ok.revision, 2)
        legacy = service.edit(author_id=str(self.student.pk),
                              draft_id=str(draft.id),
                              body="không gửi expected_revision",
                              card_id="", card_version=None,
                              recipient_id=str(self.caregiver.pk))
        self.assertEqual(legacy.revision, 3)


class TwoClientConflictTests(ExpectedRevisionApiBase):
    def test_stale_client_cannot_overwrite_fresher_save(self):
        """(f) N06 narrative: A loads rev 1; B saves body B (rev 2, 200);
        A's stale save with expected_revision=1 -> 409 AND the draft stays
        exactly B's version (A reconciles via the author-only GET)."""
        draft_id = self._create().data["draft_id"]        # A: rev 1
        b_save = self._edit(draft_id, {"body": "B sửa từ web",
                                       "recipient_id": str(self.caregiver.pk)})
        self.assertEqual(b_save.status_code, 200)
        a_stale = self._edit(draft_id, {"body": "A ghi đè từ mini",
                                        "expected_revision": 1})
        self.assertEqual(a_stale.status_code, 409)
        current = self._get(draft_id)
        self.assertEqual(current.data["body"], "B sửa từ web")
        self.assertEqual(current.data["revision"], 2)
