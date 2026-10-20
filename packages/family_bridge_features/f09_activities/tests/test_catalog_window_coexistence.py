"""F09 catalog window (50) coexistence with a real imported bundle.

Guarantees under test:
1. OLD published data must NOT push a fresh bundle release out of the
   window: with 30 synthetic OLD activities + the 24-item bundle (54
   rows > 50), ALL bundle activities/lessons stay reachable in the
   service catalog (newest-first window keeps the fresh release set).
2. When NEWER releases push bundle items OUT of the window (30 newer
   synthetic items on top), the bounded catalog list may legitimately
   omit them — but every PINNED (content_key, revision=1) stays
   resolvable through the exact single-row getter (R3-analog), so
   progress rows and invites never break.
3. The service-level kind/audience filters still hold.

Synthetic items live ONLY in the test DB — nothing is written to any
production or user-facing surface (bundle import itself creates zero
user-side rows).
"""

import json
import os
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from fixtures.actors import make_student, make_staff

from family_bridge_features.f09_activities import wiring as f09_wiring
from family_bridge_features.f09_activities.services.activities import (
    ActivityService,
)
from family_bridge_features.admin_core.services.admin import (
    AdminCapabilityService, ContentLifecycleService,
)

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__),
                                         "..", "..", "..", ".."))
BUNDLE_PATH = os.path.join(
    REPO_ROOT, "ops", "content", "fb-pilot-dong-hanh-4-tuan",
    "content-items.json")

DUMMY_BODY = json.dumps({
    "goal": "Hoạt động giả lập để đẩy cửa sổ catalog (chỉ trong test DB).",
    "steps": ["Bước giả lập."],
    "share": "Không dùng ngoài test.",
    "minutes": 5,
}, ensure_ascii=False)


def _bundle_keys_by_kind():
    with open(BUNDLE_PATH, encoding="utf-8") as fh:
        items = json.load(fh)["items"]
    return {i["content_key"]: i["kind"] for i in items}


class CatalogWindowCoexistenceTests(TestCase):
    def setUp(self):
        self.operator = make_staff()
        self.publisher = make_student()
        caps = AdminCapabilityService()
        for cap in ("content.manage", "content.publish"):
            caps.grant(actor_id=str(self.operator.pk),
                       user_id=str(self.publisher.pk), capability=cap,
                       scope_type="global", scope_ref="", ttl_days=None)
        self.lifecycle = ContentLifecycleService()

    def _publish_dummy(self, prefix: str, index: int) -> None:
        item = self.lifecycle.create_draft(
            actor_id=str(self.operator.pk), kind="activity",
            title=f"Dummy {prefix} {index:02d}", body=DUMMY_BODY,
            audience="joint", content_key=f"dummy-{prefix}-{index:02d}")
        self.lifecycle.publish(actor_id=str(self.operator.pk),
                               content_id=str(item.id),
                               expected_revision=item.revision)

    def _import_bundle(self) -> None:
        call_command("import_content_bundle", "--source", BUNDLE_PATH,
                     "--publish", "--actor", str(self.publisher.pk),
                     stdout=StringIO())

    def test_old_data_does_not_push_fresh_bundle_out_of_window(self):
        for i in range(30):                    # older synthetic data
            self._publish_dummy("old", i)
        self._import_bundle()                  # 24 fresh releases (newest)
        service = ActivityService()
        activities = service.catalog(kind="activity")
        lessons = service.catalog(kind="micro_lesson")
        keys = {c["content_key"] for c in activities}
        lesson_keys = {c["content_key"] for c in lessons}
        bundle = _bundle_keys_by_kind()
        want_activities = {k for k, v in bundle.items() if v == "activity"}
        want_lessons = {k for k, v in bundle.items() if v == "micro_lesson"}
        self.assertTrue(want_activities.issubset(keys),
                        f"missing: {sorted(want_activities - keys)}")
        self.assertTrue(want_lessons.issubset(lesson_keys),
                        f"missing: {sorted(want_lessons - lesson_keys)}")
        reader = f09_wiring.PublishedContentActivityReader()
        self.assertLessEqual(len(reader.list_published(limit=50)), 50)

    def test_pinned_revision_resolves_even_outside_window(self):
        for i in range(30):                    # older synthetic data
            self._publish_dummy("old", i)
        self._import_bundle()
        for i in range(30):                    # NEWER releases on top
            self._publish_dummy("new", i)
        # Window (newest 50) now holds 30 new dummies + 20 of the bundle:
        # the other 4 bundle items legitimately fall out of the BROWSE
        # list — but their pinned (key, revision 1) MUST still resolve.
        service = ActivityService()
        reader = f09_wiring.PublishedContentActivityReader()
        in_window = {c["content_key"] for c in service.catalog(
            kind="activity")}
        bundle = _bundle_keys_by_kind()
        want_activities = sorted(k for k, v in bundle.items()
                                 if v == "activity")
        self.assertLess(len(in_window & set(want_activities)), 16,
                        "test setup must actually push items out of window")
        for key in want_activities:
            card = service._published_card(key, 1)
            self.assertEqual(card["content_key"], key)
            self.assertEqual(card["revision"], 1)
        self.assertLessEqual(len(reader.list_published(limit=50)), 50)

    def test_audience_contract_on_imported_lessons(self):
        self._import_bundle()
        service = ActivityService()
        for audience in ("student", "caregiver"):
            cards = service.catalog(kind="micro_lesson", audience=audience)
            self.assertEqual(len(cards), 4)  # 4 HS + 4 PH trong bundle
            for card in cards:
                self.assertIn(card["audience"], (audience, "neutral"))
