"""F09 production-wiring regressions for QA 19/10 R06 — "minutes có nguồn".

R06's service fix (`_safe_content` typed body + `_safe_minutes`
pass-through 1..1440 else None) reads minutes at the TOP LEVEL of the
content-reader port result. ContentItem has NO minutes column — the only
production source is the published body JSON — so the production reader
(`PublishedContentActivityReader`) must lift a source-provided integer
into that slot. Before this regression the lift was missing: production
ALWAYS answered `minutes: null` and both clients (web + mini companion)
could only ever show "chưa được cung cấp", even for content that DID
carry minutes — the pass-through existed only for test doubles.

These tests pin the pass-through against the REAL reader + admin_core
B16 lifecycle (create_draft -> publish), not test doubles:
  - integer 1..1440 passes through (1440 boundary included);
  - anything else (0, 1441, negative, string, bool, float, absent)
    becomes None — the UI then says "chưa được cung cấp" honestly;
  - the body stays the R06 TYPED dict {goal, steps, share, text} —
    minutes never leaks inside `body`.
"""

import json

from django.test import TestCase
from rest_framework.test import APIClient

from fixtures.actors import make_student

import labgrants.sessions as _lab_sessions

from family_bridge_features.admin_core.services.admin import (
    ContentLifecycleService,
)

from ..services import registry
from ..wiring import PublishedContentActivityReader
from .helpers import auth_header, make_session


class R06WiringMinutesBase(TestCase):
    def setUp(self):
        registry.reset_registries()
        registry.register_session_resolver(_lab_sessions.resolve_session)
        # The PRODUCTION reader — this is the unit under test (no doubles).
        registry.register_content_reader(PublishedContentActivityReader())
        self.lifecycle = ContentLifecycleService()
        self.student = make_student()
        self.token, _ = make_session(self.student)
        self.client = APIClient()

    def tearDown(self):
        registry.reset_registries()

    def _publish(self, *, content_key: str, body: dict) -> None:
        draft = self.lifecycle.create_draft(
            actor_id="r06:wiring", kind="activity",
            title=f"Activity {content_key}",
            body=json.dumps(body, ensure_ascii=False), audience="joint",
            content_key=content_key)
        self.lifecycle.publish(actor_id="r06:wiring",
                               content_id=str(draft.id),
                               expected_revision=1)

    def _catalog(self):
        response = self.client.get("/api/v1/activities/catalog",
                                   format="json",
                                   **auth_header(self.token))
        self.assertEqual(response.status_code, 200, response.data)
        return {card["content_key"]: card
                for card in response.data["results"]}


class MinutesPassThroughTests(R06WiringMinutesBase):
    def test_body_minutes_surfaces_on_catalog_card(self):
        self._publish(content_key="r06-min-5", body={
            "goal": "Nghe nhau 5 phút", "steps": ["Bật mic", "Nghe hết"],
            "share": "Chỉ hai mẹ con", "minutes": 5})
        card = self._catalog()["r06-min-5"]
        self.assertEqual(card["minutes"], 5)
        # R06 typed body: goal/steps/share survive, minutes does NOT leak
        # inside body (it lives on the card's top-level minutes slot).
        self.assertEqual(card["body"], {
            "goal": "Nghe nhau 5 phút",
            "steps": ["Bật mic", "Nghe hết"],
            "share": "Chỉ hai mẹ con",
        })

    def test_upper_bound_1440_passes(self):
        self._publish(content_key="r06-min-1440", body={"minutes": 1440})
        self.assertEqual(self._catalog()["r06-min-1440"]["minutes"], 1440)

    def test_lower_bound_1_passes(self):
        self._publish(content_key="r06-min-1", body={"minutes": 1})
        self.assertEqual(self._catalog()["r06-min-1"]["minutes"], 1)


class MinutesHonestNullTests(R06WiringMinutesBase):
    def _assert_null(self, content_key: str) -> None:
        card = self._catalog()[content_key]
        self.assertIn("minutes", card)
        self.assertIsNone(card["minutes"], card)

    def test_zero_minutes_is_null(self):
        self._publish(content_key="r06-min-0", body={"minutes": 0})
        self._assert_null("r06-min-0")

    def test_over_1440_is_null(self):
        self._publish(content_key="r06-min-1441", body={"minutes": 1441})
        self._assert_null("r06-min-1441")

    def test_negative_minutes_is_null(self):
        self._publish(content_key="r06-min-neg", body={"minutes": -3})
        self._assert_null("r06-min-neg")

    def test_string_minutes_is_null(self):
        self._publish(content_key="r06-min-str", body={"minutes": "5"})
        self._assert_null("r06-min-str")

    def test_bool_minutes_is_null(self):
        self._publish(content_key="r06-min-bool", body={"minutes": True})
        self._assert_null("r06-min-bool")

    def test_float_minutes_is_null(self):
        self._publish(content_key="r06-min-float", body={"minutes": 5.5})
        self._assert_null("r06-min-float")

    def test_missing_minutes_is_null(self):
        self._publish(content_key="r06-min-absent", body={
            "goal": "Không có thời lượng trong nguồn"})
        self._assert_null("r06-min-absent")
