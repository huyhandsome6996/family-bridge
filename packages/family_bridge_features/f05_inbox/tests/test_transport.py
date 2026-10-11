"""F05 transport tests: single send path, idempotency, receipts, ACL,
pagination, DEC-13 fail-closed."""

import datetime as dt
import uuid

from django.test import TestCase

from family_bridge_core.errors import (
    DuplicateKeyPayloadMismatch, InputInvalid, NotAuthorized, NotFound,
)
from family_bridge_core.idempotency import send_payload_hash
from family_bridge_core.timeutils import UTC
from fixtures.actors import make_student, make_caregiver, make_system_admin

from labgrants.f05_fixtures import (
    TestConnectionReader, make_test_connection, validate_reply_context,
)
from labgrants.models import GrantRow, TestConnection

from ..models import Message
from ..services import registry
from ..services.transport import MessageTransportService


class F05Base(TestCase):
    def setUp(self):
        registry.reset_registries()
        registry.register_connection_reader(TestConnectionReader())
        registry.register_context_validator(validate_reply_context)
        self.service = MessageTransportService()
        self.student = make_student()
        self.caregiver = make_caregiver()
        self.stranger = make_student()
        self.connection = make_test_connection(self.student, self.caregiver)
        self.key = "send-0001-abcdef01"

    def hash_for(self, kind="text", recipient=None, body="xin chào con",
                 reply_to=None, context=None):
        target = recipient if recipient is not None else self.caregiver
        return send_payload_hash(
            kind=kind, recipient_id=str(getattr(target, "pk", target)),
            body=body, reply_to=reply_to,
            context_revision=(context or {}).get("revision"))


class SendPathTests(F05Base):
    def test_send_creates_message_with_current_generation(self):
        sent = self.service.send(
            sender_id=str(self.student.pk), recipient_id=str(self.caregiver.pk),
            kind="text", approved_body="xin chào con",
            idempotency_key=self.key, payload_hash_hex=self.hash_for())
        row = Message.objects.get(pk=sent.message_id)
        self.assertEqual(row.kind, "text")
        self.assertEqual(row.connection_generation, self.connection.generation)
        self.assertIsNone(row.read_at)

    def test_replay_same_key_same_hash_returns_same_message(self):
        first = self.service.send(
            sender_id=str(self.student.pk), recipient_id=str(self.caregiver.pk),
            kind="text", approved_body="xin chào con",
            idempotency_key=self.key, payload_hash_hex=self.hash_for())
        second = self.service.send(
            sender_id=str(self.student.pk), recipient_id=str(self.caregiver.pk),
            kind="text", approved_body="xin chào con",
            idempotency_key=self.key, payload_hash_hex=self.hash_for())
        self.assertEqual(first.message_id, second.message_id)
        self.assertEqual(Message.objects.count(), 1)

    def test_same_key_different_payload_rejected(self):
        self.service.send(sender_id=str(self.student.pk),
                          recipient_id=str(self.caregiver.pk),
                          kind="text", approved_body="xin chào con",
                          idempotency_key=self.key,
                          payload_hash_hex=self.hash_for())
        with self.assertRaises(DuplicateKeyPayloadMismatch):
            self.service.send(sender_id=str(self.student.pk),
                              recipient_id=str(self.caregiver.pk),
                              kind="text", approved_body="lời KHÁC",
                              idempotency_key=self.key,
                              payload_hash_hex=self.hash_for(body="lời KHÁC"))

    def test_hash_mismatch_rejected_loudly(self):
        with self.assertRaises(InputInvalid):
            self.service.send(sender_id=str(self.student.pk),
                              recipient_id=str(self.caregiver.pk),
                              kind="text", approved_body="xin chào con",
                              idempotency_key=self.key,
                              payload_hash_hex="0" * 64)

    def test_kind_allowlist(self):
        with self.assertRaises(InputInvalid):
            self.service.send(sender_id=str(self.student.pk),
                              recipient_id=str(self.caregiver.pk),
                              kind="threat", approved_body="x",
                              idempotency_key=self.key,
                              payload_hash_hex=self.hash_for(kind="threat"))

    def test_body_bounds_no_truncation(self):
        with self.assertRaises(InputInvalid):
            self.service.send(sender_id=str(self.student.pk),
                              recipient_id=str(self.caregiver.pk),
                              kind="text", approved_body="x" * 4001,
                              idempotency_key=self.key,
                              payload_hash_hex=self.hash_for(body="x" * 4001))

    def test_no_connection_denied(self):
        with self.assertRaises(NotAuthorized):
            self.service.send(sender_id=str(self.student.pk),
                              recipient_id=str(self.stranger.pk),
                              kind="text", approved_body="chào người lạ",
                              idempotency_key=self.key + "xx",
                              payload_hash_hex=self.hash_for(
                                  recipient=self.stranger, body="chào người lạ"))

    def test_revoked_connection_denied_send(self):
        TestConnection.objects.filter(pk=self.connection.pk).update(status="revoked")
        with self.assertRaises(NotAuthorized):
            self.service.send(sender_id=str(self.student.pk),
                              recipient_id=str(self.caregiver.pk),
                              kind="text", approved_body="gửi sau unlink",
                              idempotency_key=self.key,
                              payload_hash_hex=self.hash_for(body="gửi sau unlink"))

    def test_reply_target_must_be_addressed_to_sender(self):
        # caregiver replies to student: parent message must have recipient=caregiver
        parent = self.service.send(sender_id=str(self.student.pk),
                                   recipient_id=str(self.caregiver.pk),
                                   kind="text", approved_body="con gửi bố mẹ",
                                   idempotency_key=self.key,
                                   payload_hash_hex=self.hash_for(body="con gửi bố mẹ"))
        # stranger (not the recipient) cannot reply to it
        make_test_connection(self.stranger, self.caregiver)  # stranger has a connection too
        with self.assertRaises(NotFound):
            self.service.send(sender_id=str(self.stranger.pk),
                              recipient_id=str(self.student.pk),
                              kind="quick_reply", approved_body="trả lời giùm",
                              idempotency_key=self.key + "stranger",
                              reply_to=parent.message_id,
                              payload_hash_hex=self.hash_for(
                                  kind="quick_reply",
                                  recipient=self.student,
                                  body="trả lời giùm", reply_to=parent.message_id))
        # the real recipient can reply
        reply = self.service.send(sender_id=str(self.caregiver.pk),
                                  recipient_id=str(self.student.pk),
                                  kind="quick_reply",
                                  approved_body="bố mẹ đã đọc",
                                  idempotency_key=self.key + "reply",
                                  reply_to=parent.message_id,
                                  payload_hash_hex=self.hash_for(
                                      kind="quick_reply",
                                      recipient=self.student,
                                      body="bố mẹ đã đọc",
                                      reply_to=parent.message_id))
        self.assertEqual(str(reply.reply_to), parent.message_id)

    def test_context_reply_requires_valid_share(self):
        item_id = uuid.uuid4()
        GrantRow.objects.create(item_type="journal_page", item_id=item_id,
                                owner_id=str(self.student.pk),
                                recipient_id=str(self.caregiver.pk),
                                approved_revision=3)
        context = {"item_type": "journal_page", "item_id": str(item_id),
                   "owner_id": str(self.student.pk), "revision": 3}
        sent = self.service.send(sender_id=str(self.caregiver.pk),
                                 recipient_id=str(self.student.pk),
                                 kind="journal_reply",
                                 approved_body="bố mẹ đọc rồi, cảm ơn con",
                                 idempotency_key=self.key + "ctx",
                                 payload_hash_hex=self.hash_for(
                                     kind="journal_reply",
                                     recipient=self.student,
                                     body="bố mẹ đọc rồi, cảm ơn con",
                                     context=context),
                                 context=context)
        row = Message.objects.get(pk=sent.message_id)
        self.assertEqual(row.context_item_id, item_id)

        # revoked share → reply denied
        GrantRow.objects.filter(item_id=item_id).update(
            revoked_at=dt.datetime.now(tz=UTC))
        with self.assertRaises(NotAuthorized):
            self.service.send(sender_id=str(self.caregiver.pk),
                              recipient_id=str(self.student.pk),
                              kind="journal_reply",
                              approved_body="trả lời sau revoke",
                              idempotency_key=self.key + "ctx2",
                              payload_hash_hex=self.hash_for(
                                  kind="journal_reply", recipient=self.student,
                                  body="trả lời sau revoke", context=context),
                              context=context)

    def test_context_validator_unwired_fails_closed(self):
        registry.register_context_validator(None) if False else registry.reset_registries()
        registry.register_connection_reader(TestConnectionReader())
        context = {"item_type": "journal_page", "item_id": str(uuid.uuid4()),
                   "owner_id": str(self.student.pk), "revision": 1}
        with self.assertRaises(InputInvalid):
            self.service.send(sender_id=str(self.caregiver.pk),
                              recipient_id=str(self.student.pk),
                              kind="journal_reply", approved_body="x",
                              idempotency_key=self.key + "novalidator",
                              payload_hash_hex=self.hash_for(
                                  kind="journal_reply", recipient=self.student,
                                  body="x", context=context),
                              context=context)


class ReadReceiptTests(F05Base):
    def _sent(self):
        return self.service.send(sender_id=str(self.student.pk),
                                 recipient_id=str(self.caregiver.pk),
                                 kind="text", approved_body="tin nhắn",
                                 idempotency_key=self.key,
                                 payload_hash_hex=self.hash_for(body="tin nhắn"))

    def test_only_recipient_marks_read(self):
        sent = self._sent()
        with self.assertRaises(NotFound):
            self.service.mark_read(message_id=sent.message_id,
                                   actor_id=str(self.stranger.pk))
        now = dt.datetime.now(tz=UTC)
        self.service.mark_read(message_id=sent.message_id,
                               actor_id=str(self.caregiver.pk), at=now)
        row = Message.objects.get(pk=sent.message_id)
        self.assertEqual(row.read_at, now)

    def test_read_idempotent_earliest_kept(self):
        sent = self._sent()
        first = dt.datetime(2026, 10, 11, 10, 0, tzinfo=UTC)
        later = dt.datetime(2026, 10, 11, 11, 0, tzinfo=UTC)
        self.service.mark_read(message_id=sent.message_id,
                               actor_id=str(self.caregiver.pk), at=later)
        self.service.mark_read(message_id=sent.message_id,
                               actor_id=str(self.caregiver.pk), at=first)
        self.assertEqual(Message.objects.get(pk=sent.message_id).read_at, first)

    def test_sent_is_not_read(self):
        sent = self._sent()
        self.assertIsNone(Message.objects.get(pk=sent.message_id).read_at)


class InboxQueryTests(F05Base):
    def _seed(self, count=25):
        for index in range(count):
            self.service.send(sender_id=str(self.student.pk),
                              recipient_id=str(self.caregiver.pk),
                              kind="text", approved_body=f"tin {index}",
                              idempotency_key=f"{self.key}-{index:04d}",
                              payload_hash_hex=self.hash_for(body=f"tin {index}"))

    def test_inbox_pagination_cursor_no_overlap(self):
        self._seed(25)
        rows, cursor = self.service.inbox_page(
            actor_id=str(self.caregiver.pk), cursor=None, page_size=20)
        self.assertEqual(len(rows), 20)
        ids_first = {row.id for row in rows}
        rows2, cursor2 = self.service.inbox_page(
            actor_id=str(self.caregiver.pk), cursor=cursor, page_size=20)
        ids_second = {row.id for row in rows2}
        self.assertEqual(len(rows2), 5)
        self.assertFalse(ids_first & ids_second)
        self.assertIsNone(cursor2)

    def test_insert_between_pages_lands_correctly(self):
        self._seed(21)
        rows, cursor = self.service.inbox_page(actor_id=str(self.caregiver.pk),
                                               cursor=None, page_size=20)
        # actor (caregiver) inserts a reply that is newer → appears on page 1
        self.service.send(sender_id=str(self.caregiver.pk),
                          recipient_id=str(self.student.pk),
                          kind="text", approved_body="mới nhất",
                          idempotency_key=self.key + "-new",
                          payload_hash_hex=self.hash_for(
                              recipient=self.student, body="mới nhất"))
        rows2, _ = self.service.inbox_page(actor_id=str(self.caregiver.pk),
                                           cursor=None, page_size=20)
        self.assertEqual(rows2[0].approved_body, "mới nhất")
        # old cursor still walks the same position (stability)
        rows3, _ = self.service.inbox_page(actor_id=str(self.caregiver.pk),
                                           cursor=cursor, page_size=20)
        self.assertEqual({row.id for row in rows} & {row.id for row in rows3},
                         set())

    def test_query_count_bounded_page20_vs_50(self):
        from django.test.utils import CaptureQueriesContext
        from django.db import connection
        self._seed(50)
        with CaptureQueriesContext(connection) as ctx20:
            self.service.inbox_page(actor_id=str(self.caregiver.pk),
                                    cursor=None, page_size=20)
        with CaptureQueriesContext(connection) as ctx50:
            self.service.inbox_page(actor_id=str(self.caregiver.pk),
                                    cursor=None, page_size=50)
        self.assertLessEqual(len(ctx20), 3)
        self.assertLessEqual(len(ctx50), 3)
        self.assertLessEqual(abs(len(ctx20) - len(ctx50)), 1)


class Dec13UnlinkTests(F05Base):
    def test_recipient_loses_body_after_unlink_sender_keeps_own(self):
        sent = self.service.send(sender_id=str(self.student.pk),
                                 recipient_id=str(self.caregiver.pk),
                                 kind="text", approved_body="lời đã gửi",
                                 idempotency_key=self.key,
                                 payload_hash_hex=self.hash_for(body="lời đã gửi"))
        # both participants can read while connected
        self.assertIsNotNone(self.service.get_for_viewer(
            message_id=sent.message_id, viewer_id=str(self.caregiver.pk)))
        # unlink
        TestConnection.objects.filter(pk=self.connection.pk).update(status="revoked")
        with self.assertRaises(NotFound):
            self.service.get_for_viewer(message_id=sent.message_id,
                                        viewer_id=str(self.caregiver.pk))
        # sender keeps own copy
        self.assertEqual(self.service.get_for_viewer(
            message_id=sent.message_id,
            viewer_id=str(self.student.pk)).approved_body, "lời đã gửi")

    def test_stranger_cannot_enumerate_message(self):
        sent = self.service.send(sender_id=str(self.student.pk),
                                 recipient_id=str(self.caregiver.pk),
                                 kind="text", approved_body="riêng tư",
                                 idempotency_key=self.key,
                                 payload_hash_hex=self.hash_for(body="riêng tư"))
        admin = make_system_admin()
        with self.assertRaises(NotFound):
            self.service.get_for_viewer(message_id=sent.message_id,
                                        viewer_id=str(admin.pk))


class OperationLookupTests(F05Base):
    def test_lookup_after_send_and_not_found(self):
        self.assertIsNone(self.service.lookup_by_idempotency_key(
            sender_id=str(self.student.pk), idempotency_key=self.key))
        sent = self.service.send(sender_id=str(self.student.pk),
                                 recipient_id=str(self.caregiver.pk),
                                 kind="text", approved_body="tin",
                                 idempotency_key=self.key,
                                 payload_hash_hex=self.hash_for(body="tin"))
        found = self.service.lookup_by_idempotency_key(
            sender_id=str(self.student.pk), idempotency_key=self.key)
        self.assertEqual(found.message_id, sent.message_id)
        # other actors' keys are not visible (owner-only lookup)
        self.assertIsNone(self.service.lookup_by_idempotency_key(
            sender_id=str(self.caregiver.pk), idempotency_key=self.key))
