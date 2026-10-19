"""F04-A5 independent E2E tests — written FROM the frozen contract v1 and
the acceptance matrix F04-T01..T20 (handoff 01 §7 + Phụ lục A.5), BEFORE
looking at any implementation diff of agents A1–A4.

Own rule set (coordinator-frozen contract v1, tests assert EXACTLY this):
- POST /api/v1/ai/refine: body {original_text (1..4000), purpose:"refine_expression",
  input_revision? int dương}; header X-Idempotency-Key bắt buộc; 201 DTO =
  {suggestion_id, purpose, status, original_text, suggested_text, model_revision,
  prompt_revision, input_revision, created_at, decided_at}.
- Replay cùng key+payload KHÔNG gọi provider lần 2; same key khác payload
  (kể khác input_revision) → 409.
- Consent purpose "ai_processing": thiếu/declined/withdrawn/policy-cũ → 403
  consent_required, provider_calls = 0.
- Provider I/O phải chạy NGOÀI atomic transaction (in_atomic_block False tại
  thời điểm provider chạy); finalize recheck consent/state.
- AI off / kill switch (FB_AI_ENABLED) → status {ai_enabled:false}; refine 503;
  Django/manual path vẫn sống.
- Provider failure modes (timeout/429/5xx/bad JSON/safety-block/empty/truncated)
  → 503 temporarily_unavailable reason cụ thể, KHÔNG suggestion rác, KHÔNG tự retry.
- No-auto-send: refine/accept/discard/retry KHÔNG BAO GIỜ tăng Message/draft/
  operation/outbox — đếm row trước/sau.
- Author-private: recipient/stranger/staff/admin đọc suggestion người khác → 404;
  mass-assign author bị từ chối; message detail chỉ chứa final body (F05 final-only).
- F15: xóa category "ai" scoped theo user, idempotent, restore replay không hồi sinh.

Doubles are TEST-ONLY (provider/clock/sender/hook) mirroring the labgrants
pattern. No real Gemini key, no network. Known environment limits are recorded
in docs/features/f04/test.md, not hidden here.
"""

import datetime as dt
import inspect
import os
import threading
import uuid
from unittest import mock, skipUnless

from django.db import IntegrityError, connection, connections
from django.test import TestCase, TransactionTestCase
from rest_framework.test import APIClient

from fixtures.actors import make_caregiver, make_staff, make_student, make_system_admin

import labgrants.sessions as lab_sessions
from labgrants.f05_fixtures import TestConnectionReader, make_test_connection
from labgrants.f06_fixtures import ControlledClock, FakeKindSender

from family_bridge_features.f01_identity.models import ConsentRecord, Session
from family_bridge_features.f01_identity.models import hash_token as f01_hash_token
from family_bridge_features.f01_identity.services.identity import (
    has_active_consent,
    record_consent,
)
from family_bridge_features.f04_ai.models import AiRefineOperation, AiSuggestion
from family_bridge_features.f04_ai.services import registry as f04_registry
from family_bridge_features.f04_ai.services.express import AiExpressService
from family_bridge_features.f05_inbox.models import Message
from family_bridge_features.f05_inbox.services import registry as f05_registry
from family_bridge_features.f06_drafts.models import Draft
from family_bridge_features.f06_drafts.services import registry as f06_registry
from family_bridge_features.f15_privacy.models import DeletionRequest
from family_bridge_features.f15_privacy.services import registry as f15_registry
from family_bridge_features.f15_privacy.services.deletion import DeletionService


class _AllowAllAuthorizer:
    """TEST-ONLY synthetic handler authorization (DEC-14/18 gate mở trong
    test đúng idiom F15 tự dùng; production vẫn fail-closed khi thiếu
    capability privacy.case)."""

    def authorize(self, *, actor_id, action, request_id):
        return True


_A5_OPERATOR_ID = "00000000-0000-0000-0000-00000000a5a5"  # handler tổng hợp test-only

AI_POLICY_VERSION = "ai-v1"  # CURRENT_POLICY_VERSIONS["ai_processing"]
# Snapshot BEFORE any test resets the f15 registry: apps.py ready() đăng ký
# hook 'ai' của f04_ai lúc Django setup; các test reset registry toàn cục
# nên giá trị duy nhất trung thực là giá trị lúc import.
_AI_HOOK_AT_IMPORT = f15_registry.get_deletion_hook("ai")
HARSH = "Con mệt mỏi lắm rồi, bố mẹ không bao giờ chịu nghe con cả!"
MANUAL_TEXT = "Bố mẹ ơi, con muốn nói chuyện lúc 8 giờ tối."
FINAL_TEXT = "Con thấy áp lực và muốn bố mẹ cùng mình trao đổi lúc 8 giờ tối."


# --------------------------------------------------------------------------
# TEST-ONLY doubles (prefix A5 to make provenance obvious in defect logs)
# --------------------------------------------------------------------------
class _A5ProviderFailure(Exception):
    """Provider-side failure carrying the transport-mapped reason."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.fb_provider_reason = reason


class A5FakeAiProvider:
    """Fake refine port: deterministic, counts calls, records whether the DB
    connection was inside an atomic block when the provider I/O happened.
    Supports the failure modes named by F04-T19. Mirrors the real provider
    port including the runtime kill-switch guard (see wiring.py: the service
    asks the provider `kill_switch_active()` which re-reads settings)."""

    provider_id = "a5-fake-ai"
    model_revision = "a5-model-2026.10"
    prompt_revision = "a5-pr-001"

    def kill_switch_active(self) -> bool:
        """Mirror the SERVICE-level kill-switch dimension: FB_AI_ENABLED off
        → guard active. (Key-presence is a wiring-time concern: a provider
        without a key never gets registered — see wiring.py fail-closed.)"""
        from django.conf import settings as dj_settings

        return not bool(getattr(dj_settings, "FB_AI_ENABLED", False))

    def __init__(self, mode: str = "ok") -> None:
        self.mode = mode
        self.calls = []                      # every refine() invocation
        self.in_atomic_block_at_call = []    # connection.in_atomic_block snapshots
        self.during_call = None              # optional side-effect callback

    def set_mode(self, mode: str) -> None:
        self.mode = mode

    def refine(self, *, text, purpose, timeout_seconds=None):
        from django.db import connection as _conn

        self.calls.append({"text": text, "purpose": purpose,
                           "at": dt.datetime.now(tz=dt.timezone.utc).isoformat()})
        self.in_atomic_block_at_call.append(bool(_conn.in_atomic_block))
        if self.during_call is not None:
            self.during_call()
        if self.mode == "timeout":
            raise _A5ProviderFailure("provider_timeout")
        if self.mode == "outage":
            raise _A5ProviderFailure("provider_outage")
        if self.mode == "quota":
            raise _A5ProviderFailure("provider_quota_exceeded")
        if self.mode == "safety_block":
            raise _A5ProviderFailure("provider_safety_blocked")
        if self.mode == "truncated":
            raise _A5ProviderFailure("provider_output_truncated")
        if self.mode == "bad_json":
            return "this is not a dict"      # malformed provider payload
        if self.mode == "empty":
            return {"suggested_text": "   "}
        cleaned = " ".join(str(text).split())
        return {
            "suggested_text": (
                f"Mình cảm thấy {(cleaned[:60] + '…') if len(cleaned) > 60 else cleaned} "
                "— mình cần được lắng nghe."),
            "provider_id": self.provider_id,
            "model_revision": self.model_revision,
            "prompt_revision": self.prompt_revision,
        }


class A5AiDeletionHook:
    """TEST-ONLY stand-in for the F04-owned F15 deletion hook (category 'ai').

    Proves the F15 machinery contract (scoped, idempotent, replay-safe). The
    PRODUCTION hook must be registered by f04_ai itself — asserted separately
    (test_f04_registers_ai_deletion_hook), which is RED until A2 wires it."""

    def apply_user_deletion(self, *, user_id: str, requested_at):
        count, _ = AiSuggestion.objects.filter(author_id=str(user_id)).delete()
        return {"ok": True,
                "detail": f"removed {count} ai suggestions (A5 test hook)"}


# --------------------------------------------------------------------------
# Shared helpers
# --------------------------------------------------------------------------
def _session_token(user) -> str:
    """Known-raw lab session token for f04/f05/f06/f15 auth resolvers."""
    raw = "a5-lab-" + uuid.uuid4().hex
    import labgrants.models as lab_models

    lab_models.TestSession.objects.create(
        user=user,
        token_hash=lab_models.hash_token(raw),
        expires_at=dt.datetime.now(tz=dt.timezone.utc) + dt.timedelta(hours=24),
    )
    return raw


def _f01_session_token(user) -> str:
    """f01-issued session (consent endpoints authenticate via f01)."""
    raw = "a5-f01-" + uuid.uuid4().hex
    Session.objects.create(
        user=user,
        token_hash=f01_hash_token(raw),
        expires_at=dt.datetime.now(tz=dt.timezone.utc) + dt.timedelta(hours=24),
    )
    return raw


def _auth(raw_token: str) -> dict:
    return {"HTTP_AUTHORIZATION": f"Bearer {raw_token}"}


def _grant_ai_consent(user, *, version: str = AI_POLICY_VERSION,
                      decision: str = "accepted") -> ConsentRecord:
    if version == AI_POLICY_VERSION:
        return record_consent(user=user, purpose="ai_processing",
                              policy_version=version, decision=decision)
    # Direct row for historical versions (record_consent rejects non-current
    # versions by design — the ledger row simulates an OLD acceptance).
    return ConsentRecord.objects.create(
        user=user, purpose="ai_processing", policy_version=version,
        decision=decision)


def _refine(client, token, *, text=HARSH, key=None, purpose="refine_expression",
            extra=None):
    payload = {"original_text": text, "purpose": purpose}
    if extra:
        payload.update(extra)
    headers = _auth(token)
    if key is not None:
        headers["HTTP_X_IDEMPOTENCY_KEY"] = key
    return client.post("/api/v1/ai/refine", payload, format="json", **headers)


class F04A5BaseMixin:
    """Common wiring: f04 registry + lab sessions + consented author."""

    def _wire_f04(self, provider=None):
        f04_registry.reset_registries()
        f04_registry.register_session_resolver(lab_sessions.resolve_session)
        self.provider = provider or A5FakeAiProvider()
        f04_registry.register_ai_provider(self.provider)
        # Kill-switch guard: harness settings không định nghĩa FB_AI_ENABLED —
        # mặc định BẬT cho suite này; ca kill switch riêng patch False.
        self._kill_switch_patch = mock.patch(
            "django.conf.settings.FB_AI_ENABLED", True, create=True)
        self._kill_switch_patch.start()
        self.addCleanup(self._kill_switch_patch.stop)
        self.client = APIClient()

    def _make_actor(self, maker):
        user = maker()
        return user, _session_token(user)


# ==========================================================================
# F04-T02 — Consent gate: thiếu/declined/withdrawn/policy-cũ → 403, calls=0
# ==========================================================================
class F04A5ConsentGateTests(F04A5BaseMixin, TestCase):
    def setUp(self):
        self._wire_f04()
        self.student, self.token = self._make_actor(make_student)

    def test_missing_consent_rejected_before_provider(self):
        self.assertFalse(has_active_consent(self.student.pk, "ai_processing"))
        response = _refine(self.client, self.token, key="a5-c-0001-abcdef01")
        self.assertEqual(response.status_code, 403,
                         "thiếu consent phải bị chặn TRƯỚC provider (F04-T02)")
        self.assertEqual(response.data["error"]["code"], "consent_required")
        details = response.data["error"].get("details") or {}
        if "purpose" in details:
            self.assertEqual(details["purpose"], "ai_processing")
        self.assertEqual(self.provider.calls, [],
                         "không được gọi provider khi chưa consent")

    def test_declined_consent_rejected(self):
        _grant_ai_consent(self.student, decision="declined")
        self.assertFalse(has_active_consent(self.student.pk, "ai_processing"))
        response = _refine(self.client, self.token, key="a5-c-0002-abcdef01")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["error"]["code"], "consent_required")
        self.assertEqual(self.provider.calls, [])

    def test_withdrawn_consent_rejected(self):
        record = _grant_ai_consent(self.student)
        record.withdraw()  # ledger semantics: withdrawn_at set, row kept
        self.assertFalse(has_active_consent(self.student.pk, "ai_processing"))
        response = _refine(self.client, self.token, key="a5-c-0003-abcdef01")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["error"]["code"], "consent_required")
        self.assertEqual(self.provider.calls, [])

    def test_old_policy_version_rejected(self):
        _grant_ai_consent(self.student, version="ai-v0")
        self.assertFalse(has_active_consent(self.student.pk, "ai_processing"),
                         "policy cũ không tự thành consent hiệu lực")
        response = _refine(self.client, self.token, key="a5-c-0004-abcdef01")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["error"]["code"], "consent_required")
        self.assertEqual(self.provider.calls, [])

    def test_current_accepted_consent_allows_refine(self):
        _grant_ai_consent(self.student)
        self.assertTrue(has_active_consent(self.student.pk, "ai_processing"))
        response = _refine(self.client, self.token, key="a5-c-0005-abcdef01")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(self.provider.calls), 1)

    def test_consent_api_shape_and_then_refine(self):
        """E2E-01 step 3: user đọc disclosure và chủ động chấp nhận policy
        hiện hành qua Consent API; sau đó refine hợp lệ."""
        f01_token = _f01_session_token(self.student)
        created = self.client.post(
            "/api/v1/consents",
            {"purpose": "ai_processing", "policy_version": AI_POLICY_VERSION,
             "decision": "accepted"},
            format="json", **_auth(f01_token))
        self.assertEqual(created.status_code, 201)
        listing = self.client.get("/api/v1/consents", format="json",
                                  **_auth(f01_token))
        self.assertEqual(listing.status_code, 200)
        entry = next((row for row in listing.data["consents"]
                      if row["purpose"] == "ai_processing"), None)
        self.assertIsNotNone(entry)
        self.assertEqual(entry["decision"], "accepted")
        response = _refine(self.client, self.token, key="a5-c-0006-abcdef01")
        self.assertEqual(response.status_code, 201)


# ==========================================================================
# F04-T07 — Idempotency: replay 1 lần gọi provider; khác payload → 409;
#            input_revision tham gia hash + được echo trong DTO
# ==========================================================================
class F04A5IdempotencyTests(F04A5BaseMixin, TestCase):
    def setUp(self):
        self._wire_f04()
        self.student, self.token = self._make_actor(make_student)
        _grant_ai_consent(self.student)

    def test_replay_same_key_same_payload_no_second_provider_call(self):
        first = _refine(self.client, self.token, key="a5-i-0001-abcdef01")
        self.assertEqual(first.status_code, 201)
        replay = _refine(self.client, self.token, key="a5-i-0001-abcdef01")
        self.assertEqual(replay.status_code, 201)
        self.assertEqual(replay.data["suggestion_id"],
                         first.data["suggestion_id"])
        self.assertEqual(len(self.provider.calls), 1,
                         "replay cùng key+payload không được gọi provider lần 2")

    def test_same_key_different_text_conflict_409(self):
        _refine(self.client, self.token, key="a5-i-0002-abcdef01")
        clash = _refine(self.client, self.token, key="a5-i-0002-abcdef01",
                        text="Lời khác hoàn toàn đối với cùng một key")
        self.assertEqual(clash.status_code, 409)
        self.assertEqual(clash.data["error"]["code"],
                         "duplicate_key_payload_mismatch")

    def test_same_key_different_input_revision_conflict_409(self):
        """Freeze v1: input_revision tham gia payload hash — same key khác
        input_revision KHÔNG được replay thành công (phải 409)."""
        first = _refine(self.client, self.token, key="a5-i-0003-abcdef01",
                        extra={"input_revision": 1})
        self.assertEqual(first.status_code, 201)
        clash = _refine(self.client, self.token, key="a5-i-0003-abcdef01",
                        extra={"input_revision": 2})
        self.assertEqual(clash.status_code, 409,
                         "same key khác input_revision phải 409, không replay")
        self.assertEqual(clash.data["error"]["code"],
                         "duplicate_key_payload_mismatch")

    def test_dto_echoes_input_revision(self):
        response = _refine(self.client, self.token, key="a5-i-0004-abcdef01",
                           extra={"input_revision": 7})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data.get("input_revision"), 7,
                         "DTO phải echo input_revision để UI đối chiếu stale")

    def test_dto_field_set_matches_frozen_contract(self):
        response = _refine(self.client, self.token, key="a5-i-0005-abcdef01",
                           extra={"input_revision": 3})
        self.assertEqual(response.status_code, 201)
        expected = {"suggestion_id", "purpose", "status", "original_text",
                    "suggested_text", "model_revision", "prompt_revision",
                    "input_revision", "created_at", "decided_at"}
        self.assertEqual(set(response.data.keys()), expected)
        # Tên field duy nhất cho text gợi ý là suggested_text (freeze v1).
        self.assertNotIn("refined_text", response.data)
        self.assertTrue(response.data["suggested_text"])

    def test_unique_constraint_author_idempotency_enforced(self):
        """IntegrityError path (SQLite-safe): DB phải tự chặn 2 row cùng
        (author, idempotency_key) — nền tảng cho chống double-charge."""
        author_id = str(self.student.pk)
        common = dict(purpose="refine_expression", original_text=HARSH,
                      suggested_text="gợi ý", provider_id="p",
                      model_revision="m", prompt_revision="pr",
                      idempotency_key="a5-i-0006-abcdef01",
                      payload_hash_hex="0" * 64)
        AiSuggestion.objects.create(author_id=author_id, **common)
        with self.assertRaises(IntegrityError):
            AiSuggestion.objects.create(author_id=author_id, **common)


# ==========================================================================
# F04-T07 (race) — concurrent cùng key: đúng MỘT provider effect.
# Gated: FB_TEST_DB=mysql (SQLite serialize writer, không tái hiện race).
# Disposition (task 2-c, MySQL evidence): người thua claim race CÙNG payload
# KHÔNG fail cứng slot_unavailable — express._claim_refine_operation chờ có
# bounds (poll 0.1s, tổng <= 2s, thấp hơn hẳn TTL 60s) cho winner finalize
# rồi REPLAY kết quả đã lưu; quá bound mới trả 409 truthful. Provider vẫn
# đúng 1 lần (người chờ không bao giờ gọi provider), claim của winner không
# bị reclaim/đụng tới trong cửa sổ chờ.
# ==========================================================================
class F04A5ConcurrentKeyTests(F04A5BaseMixin, TransactionTestCase):
    KEY = "a5-race-0001-abcdef01"

    def setUp(self):
        self._wire_f04()
        self.student, self.token = self._make_actor(make_student)
        _grant_ai_consent(self.student)
        self.author_id = str(self.student.pk)

    @skipUnless(os.getenv("FB_TEST_DB") == "mysql",
                "NOT_RUN on SQLite: race concurrency cần MySQL "
                "(FB_TEST_DB=mysql ...). SQLite không tái hiện được race ghi.")
    def test_concurrent_same_key_single_provider_effect(self):
        barrier = threading.Barrier(2)
        results, errors = [], []

        def worker():
            try:
                barrier.wait(timeout=10)
                suggestion = AiExpressService().refine(
                    author_id=self.author_id, original_text=HARSH,
                    purpose="refine_expression", idempotency_key=self.KEY)
                results.append(str(suggestion.id))
            except Exception as exc:  # noqa: BLE001 — race outcome is data
                errors.append(exc)
            finally:
                connections.close_all()

        threads = [threading.Thread(target=worker) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=30)

        self.assertEqual(errors, [],
                         f"request nào cũng phải thành công hoặc replay, thấy: {errors}")
        self.assertEqual(len(results), 2)
        self.assertEqual(len(set(results)), 1,
                         "cùng key+payload phải trả CÙNG suggestion")
        self.assertEqual(AiSuggestion.objects.count(), 1)
        self.assertEqual(AiRefineOperation.objects.count(), 1,
                         "chỉ một thế hệ claim: người thua chờ-replay, "
                         "không reclaim claim của winner")
        self.assertEqual(len(self.provider.calls), 1,
                         "đúng MỘT provider effect cho cùng key (không double-charge)")


# ==========================================================================
# F04-T08 — Provider I/O NGOÀI atomic transaction (TransactionTestCase bắt buộc
# — TestCase tự bọc transaction nên đo in_atomic_block sẽ sai).
# ==========================================================================
class F04A5ProviderOutsideTransactionTests(F04A5BaseMixin, TransactionTestCase):
    def setUp(self):
        self._wire_f04()
        self.student, self.token = self._make_actor(make_student)
        _grant_ai_consent(self.student)

    def test_provider_io_runs_outside_atomic_block(self):
        self.assertFalse(connection.in_atomic_block,
                         "TransactionTestCase: đo đạc ngoài atomic là hợp lệ")
        response = _refine(self.client, self.token, key="a5-t-0001-abcdef01")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(self.provider.in_atomic_block_at_call), 1)
        self.assertIs(
            self.provider.in_atomic_block_at_call[0], False,
            "F04-T08: provider I/O phải chạy NGOÀI atomic transaction "
            "(in_atomic_block=False tại thời điểm provider chạy)")

    def test_finalize_rechecks_consent_withdrawn_inflight(self):
        """Consent bị rút NGAY KHI provider đang chạy → finalize phải recheck
        consent hiện hành và KHÔNG tạo suggestion (F04-T08)."""
        record = ConsentRecord.objects.filter(
            user=self.student, purpose="ai_processing").order_by(
            "-recorded_at", "-id").first()

        def _withdraw_inflight():
            record.withdraw()

        self.provider.during_call = _withdraw_inflight
        response = _refine(self.client, self.token, key="a5-t-0002-abcdef01")
        self.assertEqual(len(self.provider.calls), 1)
        self.assertFalse(has_active_consent(self.student.pk, "ai_processing"))
        self.assertEqual(
            AiSuggestion.objects.count(), 0,
            "finalize phải recheck consent; revoke inflight không được chôn "
            "kết quả provider thành suggestion")


# ==========================================================================
# F04-T09 — Author-private + mass-assignment + F05 final-only
# ==========================================================================
class F04A5SuggestionPrivacyTests(F04A5BaseMixin, TestCase):
    def setUp(self):
        self._wire_f04()
        f05_registry.reset_registries()
        f05_registry.register_session_resolver(lab_sessions.resolve_session)
        f05_registry.register_connection_reader(TestConnectionReader())
        self.student, self.student_token = self._make_actor(make_student)
        self.caregiver, self.caregiver_token = self._make_actor(make_caregiver)
        self.stranger, self.stranger_token = self._make_actor(make_student)
        self.admin, self.admin_token = self._make_actor(make_system_admin)
        self.staff, self.staff_token = self._make_actor(make_staff)
        self.connection = make_test_connection(self.student, self.caregiver)
        _grant_ai_consent(self.student)
        self.suggestion_id = _refine(
            self.client, self.student_token, key="a5-p-0001-abcdef01").data[
            "suggestion_id"]

    def test_recipient_stranger_staff_admin_get_404(self):
        for label, token in (("recipient-active-connection", self.caregiver_token),
                             ("stranger", self.stranger_token),
                             ("staff", self.staff_token),
                             ("system-admin", self.admin_token)):
            response = self.client.get(
                f"/api/v1/ai/suggestions/{self.suggestion_id}",
                format="json", **_auth(token))
            self.assertEqual(response.status_code, 404, label)
            self.assertEqual(response.data["error"]["code"], "not_found", label)

    def test_mass_assign_author_and_status_rejected(self):
        other, _ = self._make_actor(make_student)
        for extra in ({"author": str(other.pk)},
                      {"author_id": str(other.pk)},
                      {"status": "accepted"}):
            response = _refine(self.client, self.student_token,
                               key="a5-p-mass-" + uuid.uuid4().hex[:12],
                               extra=extra)
            self.assertEqual(response.status_code, 400, extra)
        hijack = self.client.post(
            f"/api/v1/ai/suggestions/{self.suggestion_id}/accept",
            {"author_id": str(other.pk)}, format="json",
            **_auth(self.student_token))
        self.assertEqual(hijack.status_code, 400,
                         "creator không được mass-assign author qua body")
        row = AiSuggestion.objects.get(pk=self.suggestion_id)
        self.assertEqual(str(row.author_id), str(self.student.pk))
        self.assertEqual(row.status, "suggested")

    def test_message_detail_carries_final_body_only(self):
        """F05 final-only: recipient đọc đúng final; DTO thư KHÔNG chứa
        original/suggestion; suggestion của sender không đọc được qua API."""
        sent = self.client.post(
            "/api/v1/messages",
            {"kind": "text", "recipient_id": str(self.caregiver.pk),
             "body": FINAL_TEXT},
            format="json", HTTP_X_IDEMPOTENCY_KEY="a5-p-send-0001-abc1",
            **_auth(self.student_token))
        self.assertEqual(sent.status_code, 201)
        message_id = sent.data["message_id"]
        detail = self.client.get(f"/api/v1/messages/{message_id}",
                                 format="json", **_auth(self.caregiver_token))
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["body"], FINAL_TEXT)
        for forbidden in ("original_text", "suggested_text", "suggestion_id",
                          "model_revision", "prompt_revision",
                          "input_revision"):
            self.assertNotIn(forbidden, detail.data,
                             f"message detail không được chứa {forbidden}")
        self.assertNotEqual(detail.data["body"], HARSH)
        blocked = self.client.get(
            f"/api/v1/ai/suggestions/{self.suggestion_id}",
            format="json", **_auth(self.caregiver_token))
        self.assertEqual(blocked.status_code, 404)


# ==========================================================================
# F04-T04 + T11 — No-auto-send: đếm Message/draft/operation trước/sau
# ==========================================================================
class F04A5NoAutoSendTests(F04A5BaseMixin, TestCase):
    def setUp(self):
        self._wire_f04()
        f06_registry.reset_registries()
        f06_registry.register_session_resolver(lab_sessions.resolve_session)
        self.clock = ControlledClock()
        f06_registry.register_clock(self.clock)
        self.sender = FakeKindSender()
        f06_registry.register_sender(kind="text", fn=self.sender)
        self.student, self.student_token = self._make_actor(make_student)
        self.caregiver, _ = self._make_actor(make_caregiver)
        self.connection = make_test_connection(self.student, self.caregiver)
        _grant_ai_consent(self.student)

    def _counters(self):
        """Message (F05), outbox/operation: f05 không có bảng outbox/operation
        riêng — operation là lookup trên Message theo idempotency_key, nên
        đếm Message là đủ để bắt mọi path tự gửi."""
        return {
            "message": Message.objects.count(),
            "draft": Draft.objects.count(),
            "sender_calls": len(self.sender.sent),
        }

    def test_refine_accept_discard_retry_never_send(self):
        before = self._counters()
        created = _refine(self.client, self.student_token,
                          key="a5-n-0001-abcdef01")
        self.assertEqual(created.status_code, 201)
        suggestion_id = created.data["suggestion_id"]
        accepted = self.client.post(
            f"/api/v1/ai/suggestions/{suggestion_id}/accept", {}, format="json",
            **_auth(self.student_token))
        self.assertEqual(accepted.status_code, 200)
        replay = _refine(self.client, self.student_token,
                         key="a5-n-0001-abcdef01")
        self.assertEqual(replay.status_code, 201)
        second = _refine(self.client, self.student_token,
                         key="a5-n-0002-abcdef01")
        discarded = self.client.post(
            f"/api/v1/ai/suggestions/{second.data['suggestion_id']}/discard",
            {}, format="json", **_auth(self.student_token))
        self.assertEqual(discarded.status_code, 200)
        after = self._counters()
        self.assertEqual(after, before,
                         "refine/accept/discard/replay KHÔNG được tăng "
                         "Message/draft/operation (F04-T04/T11)")

    def test_discard_keeps_manual_text_accept_has_no_send_authority(self):
        draft = self.client.post(
            "/api/v1/drafts",
            {"kind": "text", "body": MANUAL_TEXT,
             "recipient_id": str(self.caregiver.pk)},
            format="json", **_auth(self.student_token))
        self.assertEqual(draft.status_code, 201)
        draft_id = draft.data["draft_id"]
        suggestion = _refine(self.client, self.student_token,
                             key="a5-n-0003-abcdef01")
        suggestion_id = suggestion.data["suggestion_id"]
        discarded = self.client.post(
            f"/api/v1/ai/suggestions/{suggestion_id}/discard", {}, format="json",
            **_auth(self.student_token))
        self.assertEqual(discarded.status_code, 200)
        reread = self.client.get(f"/api/v1/drafts/{draft_id}", format="json",
                                 **_auth(self.student_token))
        self.assertEqual(reread.status_code, 200)
        self.assertEqual(reread.data["body"], MANUAL_TEXT,
                         "bỏ gợi ý phải giữ nguyên manual text")
        self.assertEqual(self._counters()["message"], 0)
        accepted = self.client.post(
            f"/api/v1/ai/suggestions/{suggestion_id}/accept", {}, format="json",
            **_auth(self.student_token))
        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(self._counters()["sender_calls"], 0,
                         "accept KHÔNG có quyền gửi (one send path là F06/F05)")

    def test_only_explicit_confirm_send_delivers(self):
        """Path DUY NHẤT đi tới gửi là preview + confirm-send của user."""
        draft = self.client.post(
            "/api/v1/drafts",
            {"kind": "text", "body": MANUAL_TEXT,
             "recipient_id": str(self.caregiver.pk)},
            format="json", **_auth(self.student_token))
        draft_id = draft.data["draft_id"]
        _refine(self.client, self.student_token, key="a5-n-0004-abcdef01")
        self.assertEqual(self._counters()["sender_calls"], 0)
        paused = self.client.post(f"/api/v1/drafts/{draft_id}/pause", {},
                                  format="json",
                                  **_auth(self.student_token))
        self.assertEqual(paused.status_code, 200)
        too_early = self.client.post(f"/api/v1/drafts/{draft_id}/preview", {},
                                     format="json",
                                     **_auth(self.student_token))
        self.assertEqual(too_early.status_code, 409,
                         "t<300 chưa được preview (server clock)")
        self.clock.advance(seconds=301)
        preview = self.client.post(f"/api/v1/drafts/{draft_id}/preview", {},
                                   format="json",
                                   **_auth(self.student_token))
        self.assertEqual(preview.status_code, 200)
        confirmed = self.client.post(
            f"/api/v1/drafts/{draft_id}/confirm-send",
            {"preview_id": preview.data["preview_id"]}, format="json",
            **_auth(self.student_token))
        self.assertEqual(confirmed.status_code, 200)
        self.assertEqual(self._counters()["sender_calls"], 1)
        self.assertEqual(self.sender.sent[0]["body"], MANUAL_TEXT,
                         "final gửi đi là do user duyệt, không phải bản AI")


# ==========================================================================
# F04-T18 — AI off / kill switch: fail closed, Django + manual path vẫn sống
# ==========================================================================
class F04A5AiOffFailClosedTests(F04A5BaseMixin, TestCase):
    def setUp(self):
        self.student, self.token = self._make_actor(make_student)
        _grant_ai_consent(self.student)
        self.client = APIClient()

    def _wire_provider(self):
        f04_registry.reset_registries()
        f04_registry.register_session_resolver(lab_sessions.resolve_session)
        self.provider = A5FakeAiProvider()
        f04_registry.register_ai_provider(self.provider)

    def _manual_path_alive(self):
        health = self.client.get("/api/v1/health/")
        self.assertEqual(health.status_code, 200)
        f06_registry.reset_registries()
        f06_registry.register_session_resolver(lab_sessions.resolve_session)
        self.clock = ControlledClock()
        f06_registry.register_clock(self.clock)
        draft = self.client.post(
            "/api/v1/drafts", {"kind": "text", "body": MANUAL_TEXT},
            format="json", **_auth(self.token))
        self.assertEqual(draft.status_code, 201,
                         "manual path phải sống khi AI off")
        f05_registry.reset_registries()
        f05_registry.register_session_resolver(lab_sessions.resolve_session)
        messages = self.client.get("/api/v1/messages", format="json",
                                   **_auth(self.token))
        self.assertEqual(messages.status_code, 200)

    def test_no_provider_registered_fails_closed(self):
        f04_registry.reset_registries()
        f04_registry.register_session_resolver(lab_sessions.resolve_session)
        status = self.client.get("/api/v1/ai/status", format="json",
                                 **_auth(self.token))
        self.assertEqual(status.status_code, 200)
        self.assertEqual(status.data, {"ai_enabled": False})
        response = _refine(self.client, self.token, key="a5-k-0001-abcdef01")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["error"]["code"], "module_unavailable")
        self.assertEqual(response.data["error"]["details"]["reason"],
                         "ai_unavailable_or_off")
        self._manual_path_alive()

    def test_fb_ai_enabled_off_is_kill_switch(self):
        """FB_AI_ENABLED=0 phải là kill switch: status false + refine 503 dù
        provider có wired (đặt cả env lẫn settings để không phụ thuộc cách
        A2 đọc cấu hình)."""
        self._wire_provider()
        env_patch = mock.patch.dict(os.environ, {"FB_AI_ENABLED": "0"})
        settings_patch = mock.patch(
            "django.conf.settings.FB_AI_ENABLED", False, create=True)
        with env_patch, settings_patch:
            status = self.client.get("/api/v1/ai/status", format="json",
                                     **_auth(self.token))
            self.assertEqual(
                status.data, {"ai_enabled": False},
                "kill switch FB_AI_ENABLED=0 phải tắt status truthfully")
            response = _refine(self.client, self.token,
                               key="a5-k-0002-abcdef01")
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.data["error"]["code"],
                             "module_unavailable")
        self._manual_path_alive()

    def test_fb_ai_enabled_on_keeps_status_truthful(self):
        self._wire_provider()
        patch = mock.patch("django.conf.settings.FB_AI_ENABLED", True,
                           create=True)
        with patch:
            status = self.client.get("/api/v1/ai/status", format="json",
                                     **_auth(self.token))
            self.assertEqual(status.data, {"ai_enabled": True})


# ==========================================================================
# F04-T19 — Provider failure modes → 503 reason cụ thể, không suggestion rác,
#           không tự retry generation.
# ==========================================================================
class F04A5ProviderFailureMappingTests(F04A5BaseMixin, TestCase):
    CASES = (
        # (mode, expected reason theo hợp đồng freeze v1)
        ("timeout", "provider_timeout"),
        ("outage", "provider_outage"),
        ("quota", "provider_quota_exceeded"),
        ("safety_block", "provider_safety_blocked"),
        ("truncated", "provider_output_truncated"),
        ("bad_json", "provider_output_invalid"),
        ("empty", "provider_output_invalid"),
    )

    def setUp(self):
        self.student, self.token = self._make_actor(make_student)
        _grant_ai_consent(self.student)
        self.client = APIClient()
        f05_registry.reset_registries()

    def _fresh_provider(self, mode):
        f04_registry.reset_registries()
        f04_registry.register_session_resolver(lab_sessions.resolve_session)
        provider = A5FakeAiProvider(mode)
        f04_registry.register_ai_provider(provider)
        patch = mock.patch("django.conf.settings.FB_AI_ENABLED", True,
                           create=True)
        patch.start()
        self.addCleanup(patch.stop)
        return provider

    def test_failure_modes_map_to_503_with_reason_no_junk_row(self):
        for index, (mode, reason) in enumerate(self.CASES):
            with self.subTest(mode=mode):
                provider = self._fresh_provider(mode)
                response = _refine(
                    self.client, self.token,
                    key=f"a5-f-{index:04d}-abcdef01")
                self.assertEqual(response.status_code, 503, mode)
                self.assertEqual(response.data["error"]["code"],
                                 "temporarily_unavailable", mode)
                self.assertEqual(
                    response.data["error"]["details"]["reason"], reason, mode)
                self.assertEqual(AiSuggestion.objects.count(), 0,
                                 f"{mode}: không được tạo suggestion rác")
                self.assertEqual(Message.objects.count(), 0,
                                 f"{mode}: không được tạo message")
                self.assertEqual(len(provider.calls), 1,
                                 f"{mode}: KHÔNG tự retry generation")

    def test_503_body_never_carries_suggestion_payload(self):
        self._fresh_provider("timeout")
        response = _refine(self.client, self.token, key="a5-f-9000-abcdef01")
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("suggested_text", response.data)
        self.assertNotIn("refined_text", response.data)


# ==========================================================================
# F04-T13 — F15 deletion category "ai": scoped, idempotent, replay-an-toàn
# ==========================================================================
class F04A5AiDeletionTests(F04A5BaseMixin, TestCase):
    def setUp(self):
        self._wire_f04()
        f15_registry.reset_registries()  # global registry: mỗi test khởi sạch
        self.student, self.student_token = self._make_actor(make_student)
        self.other, self.other_token = self._make_actor(make_student)
        _grant_ai_consent(self.student)
        _grant_ai_consent(self.other)

    def _register_test_hook(self):
        f15_registry.reset_registries()
        f15_registry.register_deletion_hook(
            "ai", "harness.tests.test_f04_e2e_a5.A5AiDeletionHook")

    def _suggestion_for(self, token, key):
        response = _refine(self.client, token, key=key)
        self.assertEqual(response.status_code, 201)
        return response.data["suggestion_id"]

    def test_ai_deletion_scoped_idempotent_replay_safe(self):
        self._register_test_hook()
        sid_a = self._suggestion_for(self.student_token, "a5-d-0001-abcdef01")
        sid_b = self._suggestion_for(self.other_token, "a5-d-0002-abcdef01")

        service = DeletionService()
        requested = service.request_deletion(user=self.student,
                                             categories=["ai"])
        self.assertFalse(requested.get("duplicate"))
        service.verify_request(request_id=requested["request_id"],
                               verifier_ref="a5-test-verifier",
                               actor_id=_A5_OPERATOR_ID,
                               authorizer=_AllowAllAuthorizer())
        done = service.process_request(request_id=requested["request_id"])
        self.assertEqual(done.status, DeletionRequest.STATUS_COMPLETED,
                         f"hook 'ai' ok → completed, thấy {done.failure_detail}")
        self.assertFalse(AiSuggestion.objects.filter(pk=sid_a).exists(),
                         "suggestion của A bị xóa")
        self.assertTrue(AiSuggestion.objects.filter(pk=sid_b).exists(),
                         "suggestion của B PHẢI còn nguyên (scoped theo user)")

        # Idempotent: yêu cầu xóa lần nữa vẫn completed, không nứt gì thêm.
        again = service.request_deletion(user=self.student, categories=["ai"])
        service.verify_request(request_id=again["request_id"],
                               verifier_ref="a5-test-verifier",
                               actor_id=_A5_OPERATOR_ID,
                               authorizer=_AllowAllAuthorizer())
        done2 = service.process_request(request_id=again["request_id"])
        self.assertEqual(done2.status, DeletionRequest.STATUS_COMPLETED)
        self.assertTrue(AiSuggestion.objects.filter(pk=sid_b).exists())

        # "Backup restore" mô phỏng: suggestion A xuất hiện lại → restore
        # replay ledger phải xóa lại (dữ liệu đã xóa không hồi sinh).
        self._suggestion_for(self.student_token, "a5-d-0003-abcdef01")
        summary = DeletionService.replay_ledger_for_restore(
            target_user_id=str(self.student.pk))
        self.assertGreaterEqual(summary["applied"], 1)
        self.assertFalse(
            AiSuggestion.objects.filter(author_id=str(self.student.pk)).exists(),
            "restore replay không được hồi sinh dữ liệu AI đã xóa")
        self.assertTrue(AiSuggestion.objects.filter(pk=sid_b).exists())

    def test_f04_registers_ai_deletion_hook(self):
        """Hợp đồng F04↔F15: hook xóa category 'ai' phải do f04_ai sở hữu và
        tự đăng ký khi app load (registry FEATURES: deletion_hook không còn
        'pending'). Giá trị chụp lúc import module — TRƯỚC khi test nào reset
        registry toàn cục. RED nếu f04_ai không tự đăng ký hook lúc boot."""
        hook = _AI_HOOK_AT_IMPORT
        self.assertIsNotNone(
            hook,
            "F15 category 'ai' phải có hook do F04 đăng ký khi app load")
        module = inspect.getmodule(hook)
        self.assertTrue(
            getattr(module, "__name__", "").startswith(
                "family_bridge_features.f04_ai"),
            f"hook 'ai' phải nằm trong f04_ai, thấy: {module}")
