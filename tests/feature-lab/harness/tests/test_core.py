"""B00 core contract tests: registry, errors, validation, idempotency,
audit redaction, timeutils. Pure-Django-light tests via the harness."""

import datetime as dt

from django.test import SimpleTestCase

from family_bridge_core import registry, timeutils
from family_bridge_core.audit import build_audit_event
from family_bridge_core.errors import (
    DuplicateKeyPayloadMismatch, FamilyBridgeError, InputInvalid, sanitize_details,
)
from family_bridge_core.idempotency import payload_hash, send_payload_hash
from family_bridge_core.validation import (
    reject_unknown_fields, validate_enum, validate_idempotency_key,
    validate_page_size, validate_revision, validate_text, validate_uuid,
)


class RegistryTests(SimpleTestCase):
    def test_registry_is_valid_allowlist(self):
        self.assertEqual(registry.validate_registry(), [])
        self.assertEqual(len(registry.FEATURES), 18)  # F01..F16 + B16 + B17
        self.assertEqual(sorted(registry.feature_ids())[0], "B16")

    def test_registry_ports_and_labels_unique(self):
        labels = [f["backend"]["app_label"] for f in registry.FEATURES]
        self.assertEqual(len(labels), len(set(labels)))
        branches = [f["branch"] for f in registry.FEATURES]
        self.assertEqual(len(branches), len(set(branches)))

    def test_message_kinds_match_transport_contract(self):
        self.assertIn("listening_signal", registry._MESSAGE_KINDS)
        self.assertIn("emotion_card", registry._MESSAGE_KINDS)

    def test_listening_needs_fixed_by_F10_contract(self):
        self.assertEqual(set(registry._LISTENING_NEEDS),
                         {"conversation", "being_present", "arrange_chat"})

    def test_relationship_kinds(self):
        self.assertEqual(set(registry._RELATIONSHIP_KINDS), {"primary", "backup"})


class ErrorEnvelopeTests(SimpleTestCase):
    def test_codes_and_status_mapping(self):
        err = DuplicateKeyPayloadMismatch({"reason": "same_key_different_payload"})
        self.assertEqual(err.http_status, 409)
        payload = err.to_payload()
        self.assertEqual(payload["error"]["code"], "duplicate_key_payload_mismatch")

    def test_sanitize_drops_forbidden_keys(self):
        cleaned = sanitize_details({"token": "ghp_secret", "field": "kind"})
        self.assertNotIn("token", cleaned)
        self.assertIn("field", cleaned)


class ValidationTests(SimpleTestCase):
    def test_text_bounds_reject_without_truncation(self):
        with self.assertRaises(InputInvalid):
            validate_text("x" * 4001, field="body")
        cleaned = validate_text("  lời nhắn  ", field="body")
        self.assertEqual(cleaned, "lời nhắn")

    def test_control_chars_removed_but_text_kept(self):
        cleaned = validate_text("a\x00b\x1fcd", field="body")
        self.assertEqual(cleaned, "abcd")

    def test_enum_allowlist(self):
        self.assertEqual(validate_enum("primary", field="kind",
                                       allowed=["primary", "backup"]), "primary")
        with self.assertRaises(InputInvalid):
            validate_enum("family", field="kind", allowed=["primary", "backup"])

    def test_uuid_and_idempotency_key(self):
        self.assertEqual(validate_uuid("6f0a67ef-0e12-4a8e-9df4-3a2b1c0d9e8f",
                                       field="id").hex,
                         "6f0a67ef0e124a8e9df43a2b1c0d9e8f")
        with self.assertRaises(InputInvalid):
            validate_idempotency_key("short")
        self.assertEqual(validate_idempotency_key("send-2026-10-11-abcdef01"),
                         "send-2026-10-11-abcdef01")

    def test_page_size_clamp_and_revision(self):
        self.assertEqual(validate_page_size(None), 20)
        self.assertEqual(validate_page_size(999), 50)
        with self.assertRaises(InputInvalid):
            validate_revision(0)

    def test_unknown_fields_rejected(self):
        with self.assertRaises(InputInvalid):
            reject_unknown_fields({"kind": "text", "is_staff": True},
                                  allowed={"kind"})


class IdempotencyTests(SimpleTestCase):
    def test_hash_stable_across_key_order(self):
        a = payload_hash({"a": 1, "b": [1, 2]})
        b = payload_hash({"b": [1, 2], "a": 1})
        self.assertEqual(a, b)

    def test_send_hash_changes_with_body_and_recipient(self):
        base = send_payload_hash(kind="text", recipient_id="r1", body="xin chào")
        changed_body = send_payload_hash(kind="text", recipient_id="r1", body="xin chào!")
        changed_recipient = send_payload_hash(kind="text", recipient_id="r2", body="xin chào")
        self.assertEqual(base, send_payload_hash(kind="text", recipient_id="r1", body="xin chào"))
        self.assertNotEqual(base, changed_body)
        self.assertNotEqual(base, changed_recipient)


class AuditRedactionTests(SimpleTestCase):
    def test_forbidden_metadata_keys_dropped(self):
        event = build_audit_event(
            actor_id="user-1", action="message.send", target_ref="msg-1",
            outcome="allowed", metadata={"body": "tâm sự riêng", "kind": "text"})
        self.assertNotIn("body", event["metadata"])
        self.assertEqual(event["metadata"]["kind"], "text")

    def test_invalid_action_rejected(self):
        with self.assertRaises(ValueError):
            build_audit_event(actor_id="u", action="bad action/with/slash",
                              target_ref="t", outcome="denied")


class TimeUtilsTests(SimpleTestCase):
    def test_cooldown_fixed_300_seconds_server_side(self):
        now = dt.datetime(2026, 10, 11, 9, 0, 0, tzinfo=dt.timezone.utc)
        deadline = timeutils.cooldown_deadline(now)
        self.assertEqual(int((deadline - now).total_seconds()), 300)

    def test_local_day_vietnam(self):
        utc_late = dt.datetime(2026, 10, 11, 18, 30, tzinfo=dt.timezone.utc)
        # 18:30 UTC = 01:30 next day in Vietnam
        self.assertEqual(timeutils.local_day(utc_late).isoformat(), "2026-10-12")

    def test_timezone_allowlist(self):
        with self.assertRaises(ValueError):
            timeutils.to_timezone(dt.datetime.now(dt.timezone.utc), "Mars/Phobos")
