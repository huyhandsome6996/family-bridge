"""F09 regressions for the independent QA of 2026-10-19 (source c29469b).

R03 — a PENDING shared-activity invite stayed acceptable after the F01
      connection was revoked (respond answered 200/accepted), and
      set_own_response kept updating shared responses afterwards. Guards
      added on the SERVICE layer (not a frontend-only lock):

      - accept/own-response require an ACTIVE connection between inviter
        and invitee right now;
      - invites pin the connection GENERATION they were created under; a
        NEW generation after unlink/reconnect must not revive old invites;
      - declining stays possible (the recipient can always close a stale
        invite honestly) while accepting is blocked;
      - re-inviting on the new generation cancels the stale pending row
        (history kept) and creates a fresh invite pinned to the current
        generation — no deadlock, no revival.

Failures on c29469b were verified before the fix; these tests must stay
green afterwards. MySQL/TiDB race coverage stays NOT_RUN (no environment
in this task); SQLite transactions here only prove the state machine.
"""

from django.test import TestCase
from rest_framework.test import APIClient

from fixtures.actors import make_student, make_caregiver

import labgrants.sessions as _lab_sessions
from labgrants.f05_fixtures import TestConnectionReader, make_test_connection
from labgrants.f09_fixtures import TestContentReader
from labgrants.models import TestConnection

from ..models import SharedActivityInvite
from ..services import registry
from .helpers import auth_header, make_session


def _make_stranger():
    # labgrants fixtures don't ship a stranger helper; keep local.
    from fixtures.actors import make_user
    return make_user("stranger")


class UnlinkInviteGuardTests(TestCase):
    def setUp(self):
        registry.reset_registries()
        registry.register_session_resolver(_lab_sessions.resolve_session)
        registry.register_content_reader(TestContentReader())
        registry.register_connection_reader(TestConnectionReader())
        self.client = APIClient()
        self.student = make_student()
        self.caregiver = make_caregiver()
        self.stranger = _make_stranger()
        self.connection = make_test_connection(self.student, self.caregiver)
        self.student_token, _ = make_session(self.student)
        self.caregiver_token, _ = make_session(self.caregiver)
        self.stranger_token, _ = make_session(self.stranger)

    def _unlink(self):
        TestConnection.objects.filter(pk=self.connection.pk).update(
            status="revoked")

    def _reconnect(self, generation=2):
        return make_test_connection(self.student, self.caregiver,
                                    generation=generation)

    def _invite(self, token=None, **overrides):
        token = token or self.student_token
        payload = {"content_key": "act-meal", "content_revision": 2,
                   "invitee_id": str(self.caregiver.pk)}
        payload.update(overrides)
        return self.client.post("/api/v1/activities/invites", payload,
                                format="json", **auth_header(token))

    def _respond(self, invite_id, token, decision="accept"):
        return self.client.post(
            f"/api/v1/activities/invites/{invite_id}/respond",
            {"decision": decision}, format="json", **auth_header(token))

    def _own_response(self, invite_id, token, status="done"):
        return self.client.post(
            f"/api/v1/activities/invites/{invite_id}/my-response",
            {"response_status": status}, format="json",
            **auth_header(token))

    def test_invite_pins_connection_generation(self):
        response = self._invite()
        self.assertEqual(response.status_code, 201, response.data)
        row = SharedActivityInvite.objects.get(pk=response.data["invite_id"])
        self.assertEqual(row.connection_generation, 1)
        self.assertEqual(response.data["connection_generation"], 1)

    def test_accept_blocked_after_unlink_and_state_untouched(self):
        invite = self._invite().data
        self._unlink()
        response = self._respond(invite["invite_id"],
                                 self.caregiver_token, "accept")
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(
            response.data["error"]["details"]["reason"],
            "no_active_connection")
        row = SharedActivityInvite.objects.get(pk=invite["invite_id"])
        self.assertEqual(row.status, "pending",
                         "a failed action must not mutate the invite")

    def test_decline_after_unlink_closes_invite_honestly(self):
        invite = self._invite().data
        self._unlink()
        response = self._respond(invite["invite_id"],
                                 self.caregiver_token, "decline")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["status"], "declined")

    def test_own_response_blocked_after_unlink(self):
        invite = self._invite().data
        accepted = self._respond(invite["invite_id"],
                                 self.caregiver_token, "accept")
        self.assertEqual(accepted.status_code, 200)
        self._unlink()
        blocked = self._own_response(invite["invite_id"],
                                     self.caregiver_token, "done")
        self.assertEqual(blocked.status_code, 400, blocked.data)
        self.assertEqual(
            blocked.data["error"]["details"]["reason"],
            "no_active_connection")

    def test_old_invite_not_revived_after_reconnect(self):
        invite = self._invite().data
        self._unlink()
        self._reconnect(generation=2)
        response = self._respond(invite["invite_id"],
                                 self.caregiver_token, "accept")
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(
            response.data["error"]["details"]["reason"],
            "connection_changed")

    def test_reinvite_on_new_generation_cancels_stale_and_pins_new(self):
        stale = self._invite().data
        self._unlink()
        self._reconnect(generation=2)
        fresh = self._invite()
        self.assertEqual(fresh.status_code, 201, fresh.data)
        self.assertNotEqual(fresh.data["invite_id"], stale["invite_id"])
        self.assertEqual(fresh.data["connection_generation"], 2)
        old_row = SharedActivityInvite.objects.get(pk=stale["invite_id"])
        self.assertEqual(old_row.status, "cancelled",
                         "stale pending invite must give way, stay in "
                         "history")
        accepted = self._respond(fresh.data["invite_id"],
                                 self.caregiver_token, "accept")
        self.assertEqual(accepted.status_code, 200, accepted.data)
        self.assertEqual(accepted.data["status"], "accepted")

    def test_revoke_after_accept_blocks_further_shared_updates(self):
        invite = self._invite().data
        self.assertEqual(self._respond(invite["invite_id"],
                                       self.caregiver_token).status_code,
                         200)
        self._unlink()
        blocked = self._own_response(invite["invite_id"],
                                     self.student_token, "done")
        self.assertEqual(blocked.status_code, 400)

    def test_stranger_still_cannot_touch_invites(self):
        invite = self._invite().data
        response = self._respond(invite["invite_id"],
                                 self.stranger_token, "accept")
        self.assertEqual(response.status_code, 404)
