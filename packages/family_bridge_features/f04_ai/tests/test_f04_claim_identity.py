"""F04 claim-identity fencing tests (N02 — QA probe, P1 18/10).

Phiên race QA xác nhận (probe ngoài source, thứ tự giao nhau xác định):
1. Request A claim key K (row X, INFLIGHT, payload H_A); provider A đang chờ.
2. F15 deletion category "ai" process completed → hook xoá claim X (và
   suggestions của author).
3. Request B bắt đầu lại sau deletion, claim lại key K qua
   `_claim_refine_operation` THẬT → row mới Y (payload khác); B dừng TRƯỚC
   khi provider trả.
4. Provider A trả kết quả cũ.
5. Finalize cũ của A chỉ filter (author, key, INFLIGHT) → NHẬT NHẦM row Y của
   B → lưu suggestion (hồi sinh dữ liệu đã xoá) + hoàn tất claim Y (cướp
   claim của B).

Nghiệm thu N02: finalize phải bị FENCE theo identity (pk + payload hash) của
claim mà CHÍNH request đó tạo lúc nhận quyền gọi provider. Kết quả của request
cũ KHÔNG được lưu dù key được tái dùng (deletion) hoặc reclaim sau TTL. TTL
reclaim 60s giữ nguyên hành vi (retry của user là hợp lệ) — chỉ finalize cũ
bị fence.

Mọi thao tác DB đều đi qua CODE THẬT (deletion hook F15 thật,
_claim_refine_operation thật); provider double chỉ DỰNG WINDOW giao nhau
trong lúc "provider đang chờ" — cùng pattern DeletionDuringCallProvider
trong test_f04_deletion.py. Không mock DB-level, không mock claim service.

Ghi chú thiết kế cho case 3 (finalize race): R1A2-01 đảm bảo KHÔNG BAO GIỜ
có 2 provider call cùng sống với 1 claim còn INFLIGHT — nên "provider 2 lần,
cùng 1 claim" chỉ tồn tại ở cửa sổ finalize race (winner commit TRƯỚC khi
finalize của thua cuộc chạy, cùng pattern RaceIntegrityTests trong
test_f04.py). Test này pin: thua cuộc replay winner (đúng 1 suggestion),
chỉ hoàn tất claim CỦA CHÍNH NÓ (pk-scoped), không đánh dấu claim nào khác.
"""

import datetime as dt
from unittest import mock

from family_bridge_core.idempotency import send_payload_hash
from family_bridge_core.timeutils import UTC

import labgrants.sessions as _lab_sessions
from labgrants.f04_fixtures import TestAiProvider

from ..models import (
    STATUS_COMPLETED, STATUS_INFLIGHT, STATUS_SUGGESTED, AiRefineOperation,
    AiSuggestion,
)
from ..services import registry
from ..services.deletion import AiSuggestionDeletionHook
from ..services.express import REFINE_OPERATION_TTL_SECONDS, AiExpressService
from .helpers import auth_header, make_session
from .test_f04 import F04ApiBase, HARSH, grant_ai_consent


def _hash_for(text, revision=None):
    """Cùng công thức payload hash với refine() (kind=ai_refine)."""
    return send_payload_hash(kind="ai_refine", recipient_id="", body=text,
                             reply_to=None, context_revision=revision)


class ClaimReuseAfterDeletionTests(F04ApiBase):
    """N02 case 1: deletion completed giữa chừng → request B claim lại key
    (payload khác) qua service thật → finalize của A (kết quả cũ) phải bị
    DROP: 0 suggestion (không hồi sinh dữ liệu đã xoá), claim Y của B vẫn
    INFLIGHT (không bị cướp), phản hồi 503 trung thực."""

    def test_claim_reuse_after_deletion_old_result_dropped(self):
        key = "ai-identity-del-0001"
        hash_b = _hash_for("Request B sau deletion — payload khác hẳn request A")

        class DeletionThenReclaimProvider(TestAiProvider):
            """Hook chạy GIỮA lời gọi provider của A: deletion thật hoàn tất,
            request B claim lại key qua service thật → row Y (payload khác).
            Kết quả của A trả SAU CÙNG — đúng cửa sổ race QA probe."""

            def __init__(self, victim_id, victim_key, other_hash):
                super().__init__()
                self._victim_id = victim_id
                self._key = victim_key
                self._other_hash = other_hash
                self.deletion_outcome = None
                self.young_row_pk = None

            def refine(self, *, text, purpose, timeout_seconds=None):
                # (2) F15 deletion category "ai" HOÀN TẤT trong lúc chờ
                # (cutoff = bây giờ — đúng cách runner F15 truyền cutoff):
                self.deletion_outcome = AiSuggestionDeletionHook() \
                    .apply_user_deletion(
                        user_id=self._victim_id,
                        requested_at=dt.datetime.now(tz=UTC))
                # (3) Request B claim lại key K qua service thật → row Y.
                AiExpressService()._claim_refine_operation(
                    author_id=self._victim_id, idempotency_key=self._key,
                    payload_hash=self._other_hash)
                self.young_row_pk = str(AiRefineOperation.objects.get(
                    author_id=self._victim_id,
                    idempotency_key=self._key).pk)
                # (4) Provider A trả kết quả cũ SAU CÙNG.
                return super().refine(text=text, purpose=purpose,
                                      timeout_seconds=timeout_seconds)

        provider = DeletionThenReclaimProvider(str(self.student.pk), key,
                                               hash_b)
        registry.reset_registries()
        registry.register_session_resolver(_lab_sessions.resolve_session)
        registry.register_ai_provider(provider)

        response = self._refine(self.student_token, key=key)

        # Deletion thật đã chạy hoàn tất trước khi finalize của A chạy.
        self.assertIsNotNone(provider.deletion_outcome)
        self.assertTrue(provider.deletion_outcome["ok"])
        self.assertIsNotNone(provider.young_row_pk)
        # Assertion cốt lõi N02: kết quả cũ KHÔNG được lưu — không hồi sinh
        # suggestion sau khi deletion completed (phải còn đúng 0).
        self.assertEqual(AiSuggestion.objects.filter(
            author_id=str(self.student.pk)).count(), 0)
        # Claim Y của B không bị finalize cũ đánh dấu COMPLETED (cướp claim).
        young = AiRefineOperation.objects.get(pk=provider.young_row_pk)
        self.assertEqual(young.status, STATUS_INFLIGHT)
        self.assertEqual(young.payload_hash_hex, hash_b)
        # Kết quả bị bỏ một cách trung thực (503, không 500, không 201 giả).
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["error"]["details"]["reason"],
                         "refine_result_discarded_after_deletion")
        # Không còn claim nào khác sóng lại (X đã xoá, chỉ còn Y INFLIGHT).
        self.assertEqual(AiRefineOperation.objects.filter(
            author_id=str(self.student.pk),
            idempotency_key=key, status=STATUS_INFLIGHT).count(), 1)


class TtlReclaimFenceTests(F04ApiBase):
    """N02 case 2: claim A (X) quá TTL 60s → user retry (B) reclaim HỢP LỆ
    qua service thật (xoá X, tạo Y — CÙNG payload, đúng hợp đồng TTL giữ
    nguyên) → finalize MUỘN của A (kết quả cũ) phải bị fence theo pk: 0
    suggestion, Y vẫn INFLIGHT cho finalize thật sự của B."""

    def test_ttl_reclaim_old_completion_fenced(self):
        key = "ai-identity-ttl-0001"

        class ReclaimDuringCallProvider(TestAiProvider):
            """Hook giữa lời gọi provider của A: aging claim X quá TTL trên
            server clock (pattern _age_claim trong test_f04.py), sau đó retry
            của user reclaim qua service thật (cùng payload). Provider A trả
            kết quả cũ SAU CÙNG."""

            def __init__(self, victim_id, victim_key):
                super().__init__()
                self._victim_id = victim_id
                self._key = victim_key
                self.young_row_pk = None

            def refine(self, *, text, purpose, timeout_seconds=None):
                op = AiRefineOperation.objects.get(
                    author_id=self._victim_id, idempotency_key=self._key)
                stale = dt.datetime.now(tz=UTC) - dt.timedelta(
                    seconds=REFINE_OPERATION_TTL_SECONDS + 5)
                AiRefineOperation.objects.filter(pk=op.pk).update(
                    created_at=stale, updated_at=stale)
                # TTL reclaim giữ nguyên hành vi: cùng payload mới được nhận.
                AiExpressService()._claim_refine_operation(
                    author_id=self._victim_id, idempotency_key=self._key,
                    payload_hash=_hash_for(text))
                self.young_row_pk = str(AiRefineOperation.objects.get(
                    author_id=self._victim_id,
                    idempotency_key=self._key).pk)
                return super().refine(text=text, purpose=purpose,
                                      timeout_seconds=timeout_seconds)

        provider = ReclaimDuringCallProvider(str(self.student.pk), key)
        registry.reset_registries()
        registry.register_session_resolver(_lab_sessions.resolve_session)
        registry.register_ai_provider(provider)

        response = self._refine(self.student_token, key=key)

        # Reclaim đã thật sự diễn ra (X bị xoá, Y đã sinh trong lúc A chờ).
        self.assertIsNotNone(provider.young_row_pk)
        # Kết quả cũ của A KHÔNG được lưu dù key được reclaim sau TTL.
        self.assertEqual(AiSuggestion.objects.filter(
            author_id=str(self.student.pk)).count(), 0)
        # Claim Y (thế hệ reclaim) không bị finalize cũ hoàn tất thay.
        young = AiRefineOperation.objects.get(pk=provider.young_row_pk)
        self.assertEqual(young.status, STATUS_INFLIGHT)
        self.assertEqual(young.payload_hash_hex, _hash_for(HARSH))
        # Fence 503 trung thực (reclaim-deleted cùng họng mapping với deletion
        # — kết quả cũ bị bỏ, không tự lưu dưới bất kỳ hình thức nào).
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["error"]["details"]["reason"],
                         "refine_result_discarded_after_deletion")


class FinalizeRaceReplayTests(F04ApiBase):
    """N02 case 3: cùng 1 claim, finalize race (winner commit trước khi
    finalize của thua cuộc chạy) → thua cuộc replay winner: đúng 1 suggestion,
    KHÔNG đánh dấu claim nào khác ngoài claim của chính nó (pk-scoped),
    retry cùng key vẫn replay (không provider call thêm)."""

    def test_finalize_race_replays_winner_same_claim(self):
        key = "ai-identity-race-0001"
        winner_text = "Bản ghi thắng cuộc đua (cùng claim)"
        winner_hash = _hash_for(HARSH)
        entered = []

        class WinnerDuringCallProvider(TestAiProvider):
            def __init__(self, victim_id):
                super().__init__()
                self._victim_id = victim_id

            def refine(self, *, text, purpose, timeout_seconds=None):
                entered.append(1)
                # Winner cùng key commit TRƯỚC finalize của A (window race
                # thật — cùng pattern RaceIntegrityTests trong test_f04.py).
                AiSuggestion.objects.create(
                    author_id=self._victim_id, purpose=purpose,
                    status=STATUS_SUGGESTED, original_text=text,
                    suggested_text=winner_text,
                    provider_id=self.provider_id,
                    model_revision=self.model_revision,
                    prompt_revision=self.prompt_revision,
                    idempotency_key=key, payload_hash_hex=winner_hash)
                return super().refine(text=text, purpose=purpose,
                                      timeout_seconds=timeout_seconds)

        # Claim "lạ" cùng author nhưng KHÁC key: finalize của A không được
        # đụng đến (không update mù theo author).
        decoy = AiRefineOperation.objects.create(
            author_id=str(self.student.pk), idempotency_key="ai-identity-decoy",
            payload_hash_hex=winner_hash, status=STATUS_INFLIGHT)

        provider = WinnerDuringCallProvider(str(self.student.pk))
        registry.reset_registries()
        registry.register_session_resolver(_lab_sessions.resolve_session)
        registry.register_ai_provider(provider)

        response = self._refine(self.student_token, key=key)

        self.assertEqual(response.status_code, 201)
        # Lần finalize đầu: thua cuộc REPLAY winner, không lưu row thứ 2.
        self.assertEqual(response.data["suggested_text"], winner_text)
        self.assertEqual(len(entered), 1)  # đúng 1 generation (R1A2-01 giữ nguyên)
        self.assertEqual(AiSuggestion.objects.filter(
            author_id=str(self.student.pk)).count(), 1)
        own = AiRefineOperation.objects.get(
            author_id=str(self.student.pk), idempotency_key=key)
        self.assertEqual(own.status, STATUS_COMPLETED)  # chỉ claim của mình
        # Claim khác (decoy) phải còn nguyên INFLIGHT.
        decoy.refresh_from_db()
        self.assertEqual(decoy.status, STATUS_INFLIGHT)
        # Lần 2 (client retry cùng key): replay winner, không provider thêm.
        retry = self._refine(self.student_token, key=key)
        self.assertEqual(retry.status_code, 201)
        self.assertEqual(retry.data["suggested_text"], winner_text)
        self.assertEqual(retry.data["suggestion_id"],
                         response.data["suggestion_id"])
        self.assertEqual(len(entered), 1)
        self.assertEqual(AiSuggestion.objects.count(), 1)
        self.assertEqual(AiRefineOperation.objects.filter(
            author_id=str(self.student.pk), idempotency_key=key).count(), 1)


class NormalFlowUnaffectedTests(F04ApiBase):
    """N02 case 4: regression chống sửa phá luồng thường — claim → provider
    OK → finalize → 1 suggestion + claim COMPLETED, hash khớp payload."""

    def test_normal_flow_unaffected(self):
        key = "ai-identity-ok-0001"
        response = self._refine(self.student_token, key=key)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(self.provider.calls), 1)
        row = AiSuggestion.objects.get(pk=response.data["suggestion_id"])
        self.assertEqual(row.status, "suggested")
        self.assertEqual(row.payload_hash_hex, _hash_for(HARSH))
        op = AiRefineOperation.objects.get(
            author_id=str(self.student.pk), idempotency_key=key)
        self.assertEqual(op.status, STATUS_COMPLETED)
        self.assertEqual(op.payload_hash_hex, row.payload_hash_hex)
        # Replay sau thành công vẫn trả đúng row cũ, không provider thêm.
        replay = self._refine(self.student_token, key=key)
        self.assertEqual(replay.status_code, 201)
        self.assertEqual(replay.data["suggestion_id"], str(row.pk))
        self.assertEqual(len(self.provider.calls), 1)


class DeletionInflightBasicTests(F04ApiBase):
    """N02 case 5: giữ logic R02 cũ (XANH) — deletion trong khi provider chờ,
    KHÔNG có reclaim → finalize bị chặn, 0 suggestion, claim dọn sạch.
    Mirror gọn của LateProviderResultAfterDeletionTests (test_f04_deletion.py)."""

    def test_deletion_inflight_basic_kept_green(self):
        class DeletionDuringCallProvider(TestAiProvider):
            def __init__(self, victim_id):
                super().__init__()
                self._victim_id = victim_id
                self.deletion_outcome = None

            def refine(self, *, text, purpose, timeout_seconds=None):
                self.deletion_outcome = AiSuggestionDeletionHook() \
                    .apply_user_deletion(
                        user_id=self._victim_id,
                        requested_at=dt.datetime.now(tz=UTC))
                return super().refine(text=text, purpose=purpose,
                                      timeout_seconds=timeout_seconds)

        provider = DeletionDuringCallProvider(str(self.student.pk))
        registry.reset_registries()
        registry.register_session_resolver(_lab_sessions.resolve_session)
        registry.register_ai_provider(provider)

        response = self._refine(self.student_token, key="ai-identity-r02-0001")

        self.assertIsNotNone(provider.deletion_outcome)
        self.assertTrue(provider.deletion_outcome["ok"])
        self.assertEqual(AiSuggestion.objects.filter(
            author_id=str(self.student.pk)).count(), 0)
        self.assertEqual(AiRefineOperation.objects.filter(
            author_id=str(self.student.pk)).count(), 0)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["error"]["details"]["reason"],
                         "refine_result_discarded_after_deletion")
