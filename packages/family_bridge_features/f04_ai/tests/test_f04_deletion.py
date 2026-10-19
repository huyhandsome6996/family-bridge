"""F04 deletion hook tests (frozen contract C9 / F04-T13 scope).

The F15 registry contract exposes category "ai"; F04 registers
AiSuggestionDeletionHook at startup (apps.py, F16 pattern). Tests here prove:
- author-scoped deletion (user A's deletion never touches user B);
- idempotency (second run deletes 0, still ok);
- cutoff-scoped deletion (R04 invariant, same as the F15 production hooks):
  only rows created BEFORE the cutoff are in scope — a retry/replay with the
  same cutoff never widens the deletion to rows created after it;
- invalid/missing cutoff raises ValueError (F15 hook convention — the F15
  runner reports a truthful failed category, never a widened deletion);
- deleted data never revives: a pending idempotent replay after deletion
  generates a NEW suggestion (fresh row), and the old id reads 404;
- the F15 registry actually resolves the "ai" category to the F04 hook.
"""

import datetime as dt
import importlib.util
from unittest import mock

from family_bridge_core.timeutils import UTC

from django.test import TestCase
from rest_framework.test import APIClient

import labgrants.sessions as _lab_sessions

from ..models import AiRefineOperation, AiSuggestion
from ..services import registry
from ..services.deletion import AiSuggestionDeletionHook
from .helpers import auth_header, make_session
from .test_f04 import F04ApiBase, HARSH, grant_ai_consent
from fixtures.actors import make_student


class DeletionHookUnitTests(TestCase):
    def setUp(self):
        self.student_a = make_student()
        self.student_b = make_student()

    def test_deletes_only_target_users_suggestions(self):
        AiSuggestion.objects.create(
            author_id=str(self.student_a.pk), purpose="refine_expression",
            suggested_text="A của A", provider_id="p", model_revision="m",
            prompt_revision="p1", idempotency_key="ai-del-a-00000001",
            payload_hash_hex="a" * 64)
        AiSuggestion.objects.create(
            author_id=str(self.student_b.pk), purpose="refine_expression",
            suggested_text="B của B", provider_id="p", model_revision="m",
            prompt_revision="p1", idempotency_key="ai-del-b-00000001",
            payload_hash_hex="b" * 64)

        outcome = AiSuggestionDeletionHook().apply_user_deletion(
            user_id=str(self.student_a.pk),
            requested_at=dt.datetime.now(tz=UTC))
        self.assertTrue(outcome["ok"])
        self.assertGreaterEqual(outcome["deleted"], 1)
        self.assertFalse(AiSuggestion.objects.filter(
            author_id=str(self.student_a.pk)).exists())
        self.assertTrue(AiSuggestion.objects.filter(
            author_id=str(self.student_b.pk)).exists())

    def test_idempotent_second_run_zero_deleted(self):
        AiSuggestion.objects.create(
            author_id=str(self.student_a.pk), purpose="refine_expression",
            suggested_text="A của A", provider_id="p", model_revision="m",
            prompt_revision="p1", idempotency_key="ai-del-a-00000002",
            payload_hash_hex="a" * 64)
        hook = AiSuggestionDeletionHook()
        cutoff = dt.datetime.now(tz=UTC)
        first = hook.apply_user_deletion(user_id=str(self.student_a.pk),
                                         requested_at=cutoff)
        second = hook.apply_user_deletion(user_id=str(self.student_a.pk),
                                          requested_at=cutoff)
        self.assertTrue(first["ok"])
        self.assertTrue(second["ok"])
        self.assertEqual(second["deleted"], 0)

    def test_deletion_clears_refine_operation_claims(self):
        """R1A2-01 marker hygiene: after deletion the author's idempotency
        keys must be claimable again — a stale COMPLETED claim without its
        suggestion would otherwise answer every retry with a strange-state
        409 instead of the documented fresh generation."""
        AiRefineOperation.objects.create(
            author_id=str(self.student_a.pk), idempotency_key="ai-del-op-01",
            payload_hash_hex="a" * 64)
        AiRefineOperation.objects.create(
            author_id=str(self.student_b.pk), idempotency_key="ai-del-op-02",
            payload_hash_hex="b" * 64)

        outcome = AiSuggestionDeletionHook().apply_user_deletion(
            user_id=str(self.student_a.pk),
            requested_at=dt.datetime.now(tz=UTC))
        self.assertTrue(outcome["ok"])
        self.assertFalse(AiRefineOperation.objects.filter(
            author_id=str(self.student_a.pk)).exists())
        self.assertTrue(AiRefineOperation.objects.filter(
            author_id=str(self.student_b.pk)).exists())

    def test_f15_registry_resolves_ai_category_to_f04_hook(self):
        if importlib.util.find_spec(
                "family_bridge_features.f15_privacy") is None:
            self.skipTest("f15_privacy not in this build")
        from family_bridge_features.f15_privacy.services import registry as \
            grant_registry

        # Re-run the startup wiring (idempotent, same dotted path) so this
        # test is deterministic even if another suite overwrote category
        # "ai" in the module-level registry (e.g. labgrants FailingHook).
        import family_bridge_features.f04_ai as f04_app_module
        from ..apps import F04AiConfig

        F04AiConfig("family_bridge_features.f04_ai", f04_app_module).ready()
        hook = grant_registry.get_deletion_hook("ai")
        self.assertIsNotNone(hook)
        instance = hook() if isinstance(hook, type) else hook
        self.assertTrue(callable(getattr(instance, "apply_user_deletion",
                                         None)))
        # Idempotent protocol probe on a user with no data (F15 runner
        # contract: dict with ok, not an int).
        outcome = instance.apply_user_deletion(
            user_id="00000000-0000-0000-0000-000000000000",
            requested_at=dt.datetime.now(tz=UTC))
        self.assertIsInstance(outcome, dict)
        self.assertTrue(outcome["ok"])


class CutoffScopeDeletionTests(TestCase):
    """R04/F15 invariant: deletion PHAI tôn trọng cutoff của request.

    Cùng hợp đồng với các hook F15 chuẩn (MoodDeletionHook, surveys,
    connections...): chỉ row tạo TRƯỚC cutoff nằm trong phạm vi; retry/replay
    với CÙNG cutoff không bao giờ nới phạm vi (row tạo SAU cutoff sống sót);
    thiếu/sai cutoff thì raise ValueError (runner F15 báo failed trung thực,
    không tự đoán phạm vi)."""

    def setUp(self):
        self.student = make_student()
        self.hook = AiSuggestionDeletionHook()

    def _suggestion(self, key):
        return AiSuggestion.objects.create(
            author_id=str(self.student.pk), purpose="refine_expression",
            suggested_text="nội dung của tôi", provider_id="p",
            model_revision="m", prompt_revision="p1", idempotency_key=key,
            payload_hash_hex="a" * 64)

    def _operation(self, key):
        return AiRefineOperation.objects.create(
            author_id=str(self.student.pk), idempotency_key=key,
            payload_hash_hex="a" * 64)

    def _age_rows(self, *rows, before=None, after=None):
        """Đặt created_at xác định (queryset update — không lệch clock)."""
        for row, ts in zip(rows, [before] * len(rows)):
            if ts is not None:
                row.__class__.objects.filter(pk=row.pk).update(created_at=ts)

    def test_deletes_only_rows_created_before_cutoff(self):
        cutoff = dt.datetime.now(tz=UTC)
        old_ts = cutoff - dt.timedelta(hours=1)
        new_ts = cutoff + dt.timedelta(hours=1)
        old_suggestion = self._suggestion("ai-cut-old-00000001")
        old_operation = self._operation("ai-cut-op-old-0001")
        new_suggestion = self._suggestion("ai-cut-new-00000001")
        new_operation = self._operation("ai-cut-op-new-0001")
        self._age_rows(old_suggestion, old_operation, before=old_ts)
        self._age_rows(new_suggestion, new_operation, after=new_ts)

        outcome = self.hook.apply_user_deletion(
            user_id=str(self.student.pk), requested_at=cutoff)

        self.assertTrue(outcome["ok"])
        # Đúng 2 row trong phạm vi bị xoá (1 suggestion + 1 claim).
        self.assertEqual(outcome["deleted"], 2)
        self.assertFalse(AiSuggestion.objects.filter(
            pk=old_suggestion.pk).exists())
        self.assertFalse(AiRefineOperation.objects.filter(
            pk=old_operation.pk).exists())
        # Row tạo SAU cutoff phải sống sót — deletion không nới phạm vi.
        self.assertTrue(AiSuggestion.objects.filter(
            pk=new_suggestion.pk).exists())
        self.assertTrue(AiRefineOperation.objects.filter(
            pk=new_operation.pk).exists())

    def test_accepts_iso_string_cutoff_like_f15_hooks(self):
        """requested_at là ISO-8601 string cũng phải chạy đúng (cách runner
        F15/ledger replay truyền cutoff)."""
        cutoff = dt.datetime.now(tz=UTC)
        old_suggestion = self._suggestion("ai-cut-iso-00000001")
        AiSuggestion.objects.filter(pk=old_suggestion.pk).update(
            created_at=cutoff - dt.timedelta(minutes=5))
        new_suggestion = self._suggestion("ai-cut-iso-00000002")
        AiSuggestion.objects.filter(pk=new_suggestion.pk).update(
            created_at=cutoff + dt.timedelta(minutes=5))

        outcome = self.hook.apply_user_deletion(
            user_id=str(self.student.pk), requested_at=cutoff.isoformat())

        self.assertTrue(outcome["ok"])
        self.assertFalse(AiSuggestion.objects.filter(
            pk=old_suggestion.pk).exists())
        self.assertTrue(AiSuggestion.objects.filter(
            pk=new_suggestion.pk).exists())

    def test_retry_with_same_cutoff_never_widens_scope(self):
        """Retry/replay với CÙNG cutoff: row sinh ra SAU deletion (kể cả
        suggestion mới của user) phải sống sót — idempotency giữ nguyên
        hành vi (chạy lại deleted=0, vẫn ok)."""
        cutoff = dt.datetime.now(tz=UTC)
        old_suggestion = self._suggestion("ai-cut-retry-00000001")
        AiSuggestion.objects.filter(pk=old_suggestion.pk).update(
            created_at=cutoff - dt.timedelta(hours=1))
        new_suggestion = self._suggestion("ai-cut-retry-00000002")
        AiSuggestion.objects.filter(pk=new_suggestion.pk).update(
            created_at=cutoff + dt.timedelta(hours=1))

        first = self.hook.apply_user_deletion(
            user_id=str(self.student.pk), requested_at=cutoff)
        self.assertTrue(first["ok"])
        self.assertFalse(AiSuggestion.objects.filter(
            pk=old_suggestion.pk).exists())
        self.assertTrue(AiSuggestion.objects.filter(
            pk=new_suggestion.pk).exists())

        # "User" tạo thêm dữ liệu MỚI sau deletion (created_at > cutoff).
        fresh_suggestion = self._suggestion("ai-cut-fresh-00000001")
        fresh_operation = self._operation("ai-cut-op-fresh-01")
        AiSuggestion.objects.filter(pk=fresh_suggestion.pk).update(
            created_at=cutoff + dt.timedelta(hours=2))
        AiRefineOperation.objects.filter(pk=fresh_operation.pk).update(
            created_at=cutoff + dt.timedelta(hours=2))

        # Replay cùng request (CÙNG cutoff): không được nới phạm vi.
        second = self.hook.apply_user_deletion(
            user_id=str(self.student.pk), requested_at=cutoff)
        self.assertTrue(second["ok"])
        self.assertEqual(second["deleted"], 0)
        self.assertTrue(AiSuggestion.objects.filter(
            pk=new_suggestion.pk).exists())
        self.assertTrue(AiSuggestion.objects.filter(
            pk=fresh_suggestion.pk).exists())
        self.assertTrue(AiRefineOperation.objects.filter(
            pk=fresh_operation.pk).exists())

    def test_missing_or_invalid_cutoff_raises_like_f15_hooks(self):
        """Thiếu/sai cutoff: raise ValueError y hệt _parse_cutoff của các
        hook F15 (MoodDeletionHook...) — không bao giờ đoán phạm vi rộng."""
        self._suggestion("ai-cut-bad-00000001")
        with self.assertRaises(ValueError):
            self.hook.apply_user_deletion(user_id=str(self.student.pk),
                                          requested_at=None)
        with self.assertRaises(ValueError):
            self.hook.apply_user_deletion(user_id=str(self.student.pk),
                                          requested_at="khong-phai-ngay")
        # Fail-loud: không có row nào bị xoá khi cutoff sai.
        self.assertTrue(AiSuggestion.objects.filter(
            author_id=str(self.student.pk)).exists())


class ReplayAfterDeletionTests(F04ApiBase):
    def test_pending_replay_after_deletion_generates_new_suggestion(self):
        first = self._refine(self.student_token, key="ai-delafter-0001-ab")
        old_id = first.data["suggestion_id"]
        AiSuggestionDeletionHook().apply_user_deletion(
            user_id=str(self.student.pk),
            requested_at=dt.datetime.now(tz=UTC))

        old_get = self.client.get(f"/api/v1/ai/suggestions/{old_id}",
                                  format="json",
                                  **auth_header(self.student_token))
        self.assertEqual(old_get.status_code, 404)

        # Same key + same payload after deletion: replay finds NOTHING to
        # revive — a fresh generation creates a NEW row (never the old one).
        again = self._refine(self.student_token, key="ai-delafter-0001-ab")
        self.assertEqual(again.status_code, 201)
        self.assertNotEqual(again.data["suggestion_id"], old_id)
        self.assertEqual(len(self.provider.calls), 2)  # second generation ran
        self.assertEqual(AiSuggestion.objects.count(), 1)


class LateProviderResultAfterDeletionTests(F04ApiBase):
    """R02 (QA F04 18/10): kết quả của provider call BẮT ĐẦU trước deletion
    nhưng finalize SAU khi deletion completed phải bị BỎ — không được tái
    tạo suggestion (assertion: suggestion count phải còn đúng 0)."""

    def test_finalize_after_deletion_completed_stores_nothing(self):
        from labgrants.f04_fixtures import TestAiProvider

        class DeletionDuringCallProvider(TestAiProvider):
            """Provider 'chậm': GIỮA lời gọi, quy trình deletion thật chạy
            (hook F04 thật — xoá suggestion + claim của author). Kết quả
            trả về SAU deletion — đúng cửa sổ race mà QA probe."""

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

        response = self._refine(self.student_token, key="ai-fence-0001-ab")

        # Deletion đã hoàn tất THẬT trước khi finalize chạy.
        self.assertIsNotNone(provider.deletion_outcome)
        self.assertTrue(provider.deletion_outcome["ok"])
        # Assertion cốt lõi của QA: phải còn đúng 0.
        self.assertEqual(AiSuggestion.objects.filter(
            author_id=str(self.student.pk)).count(), 0)
        self.assertEqual(AiRefineOperation.objects.filter(
            author_id=str(self.student.pk)).count(), 0)
        # Kết quả bị bỏ một cách trung thực (503, không 500, không im lặng).
        self.assertEqual(response.status_code, 503)
        self.assertEqual(
            response.data["error"]["details"]["reason"],
            "refine_result_discarded_after_deletion")

    def test_fence_does_not_block_normal_refine(self):
        # Control: không có deletion giữa chừng -> refine vẫn bình thường.
        response = self._refine(self.student_token, key="ai-fence-0002-cd")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(AiSuggestion.objects.filter(
            author_id=str(self.student.pk)).count(), 1)
        self.assertEqual(AiRefineOperation.objects.filter(
            author_id=str(self.student.pk),
            idempotency_key="ai-fence-0002-cd",
            status="completed").count(), 1)
