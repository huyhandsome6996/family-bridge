"""F04 deletion hook tests (frozen contract C9 / F04-T13 scope).

The F15 registry contract exposes category "ai"; F04 registers
AiSuggestionDeletionHook at startup (apps.py, F16 pattern). Tests here prove:
- author-scoped deletion (user A's deletion never touches user B);
- idempotency (second run deletes 0, still ok);
- deleted data never revives: a pending idempotent replay after deletion
  generates a NEW suggestion (fresh row), and the old id reads 404;
- the F15 registry actually resolves the "ai" category to the F04 hook.
"""

import importlib.util
from unittest import mock

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
            user_id=str(self.student_a.pk))
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
        first = hook.apply_user_deletion(user_id=str(self.student_a.pk))
        second = hook.apply_user_deletion(user_id=str(self.student_a.pk))
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
            user_id=str(self.student_a.pk))
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
            user_id="00000000-0000-0000-0000-000000000000")
        self.assertIsInstance(outcome, dict)
        self.assertTrue(outcome["ok"])


class ReplayAfterDeletionTests(F04ApiBase):
    def test_pending_replay_after_deletion_generates_new_suggestion(self):
        first = self._refine(self.student_token, key="ai-delafter-0001-ab")
        old_id = first.data["suggestion_id"]
        AiSuggestionDeletionHook().apply_user_deletion(
            user_id=str(self.student.pk))

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
