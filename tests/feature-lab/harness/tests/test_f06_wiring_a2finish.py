"""F06 production sender wiring (F04-A2-FINISH) — confirm-send đi đường THẬT.

Khác với family_bridge_features.f06_drafts tests (dùng FakeKindSender), file
này chứng minh đường production wire đúng như B18 sẽ chạy:

- Sender kind="text" là hàm do F06DraftsConfig.ready() đăng ký lúc boot
  (bằng chứng: snapshot registry lúc IMPORT module, trước mọi
  reset_registries của test khác) — chính là `send_text_draft_via_f05`
  trong f06_drafts/apps.py, KHÔNG fake sender trong file này.
- Chuỗi create → preview → confirm tạo Message QUA F05
  MessageTransportService thật (đếm row Message; F06 không tự insert
  Message ngoài F05).
- Idempotency key deterministic `draft:{id}:rev:{revision}`: retry sau
  unknown outcome replay CÙNG message (không nhân bản); draft khác →
  message riêng.
- Double confirm → 400 draft_already_sent, Message không tăng.
- kind="emotion_card" KHÔNG wire (thuộc F03 owner) → 503
  sender_not_wired trung thực, 0 Message.

Duy nhất ConnectionReader của f01 được thay bằng double labgrants
(TestConnectionReader) — harness không có dữ liệu connection f01; đây là
pattern chuẩn của harness cho mọi test F05/F06 (xem test_f04_e2e_a5.py).
"""

import datetime as dt
import uuid

from django.test import TestCase
from rest_framework.test import APIClient

from fixtures.actors import make_caregiver, make_student

import labgrants.models as lab_models
import labgrants.sessions as lab_sessions
from labgrants.f05_fixtures import TestConnectionReader, make_test_connection
from labgrants.f06_fixtures import ControlledClock

from family_bridge_features.f05_inbox.models import Message
from family_bridge_features.f05_inbox.services import registry as f05_registry
from family_bridge_features.f06_drafts.apps import (
    draft_idempotency_key,
    send_text_draft_via_f05,
)
from family_bridge_features.f06_drafts.models import Draft
from family_bridge_features.f06_drafts.services import registry as f06_registry

# Snapshot TRƯỚC khi bất kỳ test nào reset registry toàn cục: giá trị duy
# nhất trung thực về wiring lúc boot (AppConfig.ready()).
_PROD_TEXT_SENDER_AT_IMPORT = f06_registry.get_sender(kind="text")
MANUAL_TEXT = "Bố mẹ ơi, con muốn nói chuyện lúc 8 giờ tối."


def _session_token(user) -> str:
    raw = "a2f-lab-" + uuid.uuid4().hex
    lab_models.TestSession.objects.create(
        user=user,
        token_hash=lab_models.hash_token(raw),
        expires_at=dt.datetime.now(tz=dt.timezone.utc) + dt.timedelta(hours=24),
    )
    return raw


def _auth(raw_token: str) -> dict:
    return {"HTTP_AUTHORIZATION": f"Bearer {raw_token}"}


class F06ProductionWiringTests(TestCase):
    """confirm-send qua đường wire production: F06 port -> F05 transport."""

    def setUp(self):
        f06_registry.reset_registries()
        f05_registry.reset_registries()
        f06_registry.register_session_resolver(lab_sessions.resolve_session)
        self.clock = ControlledClock()
        f06_registry.register_clock(self.clock)
        # Đường production: đăng ký ĐÚNG hàm mà AppConfig.ready() đăng ký.
        f06_registry.register_sender(kind="text", fn=send_text_draft_via_f05)
        f05_registry.register_connection_reader(TestConnectionReader())
        self.client = APIClient()
        self.student = make_student()
        self.caregiver = make_caregiver()
        make_test_connection(self.student, self.caregiver)
        self.token = _session_token(self.student)

    def _create_draft(self, **overrides):
        payload = {"kind": "text", "body": MANUAL_TEXT,
                   "recipient_id": str(self.caregiver.pk)}
        payload.update(overrides)
        return self.client.post("/api/v1/drafts", payload, format="json",
                                **_auth(self.token))

    def _preview(self, draft_id):
        return self.client.post(f"/api/v1/drafts/{draft_id}/preview", {},
                                format="json", **_auth(self.token))

    def _confirm(self, draft_id, preview_id):
        return self.client.post(f"/api/v1/drafts/{draft_id}/confirm-send",
                                {"preview_id": preview_id}, format="json",
                                **_auth(self.token))

    def test_boot_wiring_registered_production_sender(self):
        # AppConfig.ready() đã wire production sender cho kind="text" lúc
        # Django setup (snapshot import), và hàm đó là hàm module-level.
        self.assertIs(_PROD_TEXT_SENDER_AT_IMPORT, send_text_draft_via_f05)

    def test_confirm_send_creates_message_via_f05_transport(self):
        created = self._create_draft()
        self.assertEqual(created.status_code, 201, created.data)
        draft_id = created.data["draft_id"]
        self.assertEqual(Message.objects.count(), 0)  # preview không gửi

        preview = self._preview(draft_id)
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertIsNone(preview.data["deadline"])  # không pause → không ép chờ
        self.assertEqual(Message.objects.count(), 0)

        confirmed = self._confirm(draft_id, preview.data["preview_id"])
        self.assertEqual(confirmed.status_code, 200, confirmed.data)
        message_id = confirmed.data["message_id"]
        self.assertTrue(message_id)
        self.assertEqual(confirmed.data["status"], "sent")

        # Message tồn tại duy nhất QUA F05, đúng nội dung duyệt cuối.
        self.assertEqual(Message.objects.count(), 1)
        row = Message.objects.get()
        self.assertEqual(str(row.id), message_id)
        self.assertEqual(str(row.sender_id), str(self.student.pk))
        self.assertEqual(str(row.recipient_id), str(self.caregiver.pk))
        self.assertEqual(row.kind, "text")
        self.assertEqual(row.approved_body, MANUAL_TEXT)
        self.assertEqual(row.idempotency_key,
                         draft_idempotency_key(Draft.objects.get(pk=draft_id)))
        self.assertEqual(row.idempotency_key, f"draft:{draft_id}:rev:1")

        draft = Draft.objects.get(pk=draft_id)
        self.assertEqual(draft.status, "sent")
        self.assertEqual(draft.sent_message_id, message_id)

    def test_double_confirm_draft_already_sent_no_duplicate(self):
        created = self._create_draft()
        draft_id = created.data["draft_id"]
        preview = self._preview(draft_id)
        first = self._confirm(draft_id, preview.data["preview_id"])
        self.assertEqual(first.status_code, 200, first.data)
        again = self._confirm(draft_id, preview.data["preview_id"])
        self.assertEqual(again.status_code, 400)
        self.assertEqual(again.data["error"]["details"]["reason"],
                         "draft_already_sent")
        self.assertEqual(Message.objects.count(), 1)  # không nhân message

    def test_retry_after_unknown_outcome_replays_same_message(self):
        # Mô phỏng crash giữa F05 commit và F06 đánh dấu sent: lần 1 gửi tới
        # F05 thành công (message đã tạo) nhưng draft chưa kịp đánh dấu —
        # retry confirm phải replay CÙNG message nhờ idempotency key.
        created = self._create_draft()
        draft_id = created.data["draft_id"]
        preview = self._preview(draft_id)
        self.assertEqual(preview.status_code, 200)
        draft = Draft.objects.get(pk=draft_id)

        direct = send_text_draft_via_f05(author_id=str(self.student.pk),
                                         draft=draft)
        self.assertEqual(Message.objects.count(), 1)

        confirmed = self._confirm(draft_id, preview.data["preview_id"])
        self.assertEqual(confirmed.status_code, 200, confirmed.data)
        self.assertEqual(confirmed.data["message_id"], direct["message_id"])
        self.assertEqual(Message.objects.count(), 1)  # replay, không nhân bản

    def test_second_draft_same_body_gets_own_message(self):
        first = self._create_draft()
        second = self._create_draft()
        for created in (first, second):
            self.assertEqual(created.status_code, 201, created.data)
            preview = self._preview(created.data["draft_id"])
            self.assertEqual(preview.status_code, 200)
            confirmed = self._confirm(created.data["draft_id"],
                                      preview.data["preview_id"])
            self.assertEqual(confirmed.status_code, 200, confirmed.data)
        # Key theo (draft, revision) — hai draft khác id là hai message riêng.
        self.assertEqual(Message.objects.count(), 2)
        self.assertEqual(len({m.idempotency_key
                              for m in Message.objects.all()}), 2)

    def test_emotion_card_unwired_503_truthful(self):
        # kind="emotion_card" thuộc F03 owner — không wire ở đây; confirm
        # phải 503 sender_not_wired (fail closed), 0 Message, draft không sent.
        created = self._create_draft(kind="emotion_card", card_id="card-01",
                                     card_version=1)
        self.assertEqual(created.status_code, 201, created.data)
        draft_id = created.data["draft_id"]
        preview = self._preview(draft_id)
        self.assertEqual(preview.status_code, 200, preview.data)
        confirmed = self._confirm(draft_id, preview.data["preview_id"])
        self.assertEqual(confirmed.status_code, 503)
        self.assertEqual(confirmed.data["error"]["details"]["reason"],
                         "sender_not_wired")
        self.assertEqual(Message.objects.count(), 0)
        self.assertEqual(Draft.objects.get(pk=draft_id).status, "editing")
