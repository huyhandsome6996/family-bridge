"""Suite deletion hook (F16): xoa du lieu lop theo giao thuc F15, idempotent."""

import datetime as dt
import importlib
import importlib.util
import uuid

from django.test import TestCase

from family_bridge_core.timeutils import UTC

from ..models import ClassAccount, CompanionProposal, LoginAttempt
from ..services.deletion import apply_user_deletion, ConnectionProposalDeletionHook
from ..services.ratelimit import guard_key_for_code, guard_key_for_ip
from .helpers import make_class_account, make_proposal


def _acct_attempts(user_id, count=2):
    LoginAttempt.objects.bulk_create([
        LoginAttempt(attempt_key=f"acct:{user_id}", outcome="wrong_password")
        for _ in range(count)])


def _shared_attempts(code="HS001", ip="10.1.1.9"):
    LoginAttempt.objects.bulk_create([
        LoginAttempt(attempt_key=guard_key_for_code(code), outcome="ok"),
        LoginAttempt(attempt_key=guard_key_for_ip(ip), outcome="ok"),
    ])


class AccountDeletionHookTests(TestCase):
    def test_hook_removes_proposals_account_acct_attempts_keeps_shared(self):
        student, student_user = make_class_account("HS001", "student",
                                                   external_ref="hs-001")
        caregiver, caregiver_user = make_class_account("PH001", "caregiver",
                                                       external_ref="ph-001")
        proposal = make_proposal(student, caregiver)
        _acct_attempts(student_user.pk)
        _acct_attempts(caregiver_user.pk, count=1)
        _shared_attempts()

        result = apply_user_deletion(user_id=str(student_user.pk),
                                     requested_at=dt.datetime.now(tz=UTC))
        self.assertTrue(result["ok"])
        # proposal (1) + classaccount (1) + 2 acct attempts cua student
        self.assertEqual(result["deleted"], 4)
        self.assertFalse(CompanionProposal.objects.filter(pk=proposal.pk)
                         .exists())
        self.assertFalse(ClassAccount.objects.filter(pk=student.pk).exists())
        self.assertFalse(LoginAttempt.objects.filter(
            attempt_key=f"acct:{student_user.pk}").exists())
        # Side cua caregiver VAN CON; attempts codeh/ip la du lieu chia se.
        self.assertTrue(ClassAccount.objects.filter(pk=caregiver.pk).exists())
        self.assertTrue(LoginAttempt.objects.filter(
            attempt_key__startswith="codeh:").exists())
        self.assertTrue(LoginAttempt.objects.filter(
            attempt_key__startswith="ip:").exists())

    def test_idempotent_second_run_zero_and_ok(self):
        _account, user = make_class_account("HS001", "student")
        _acct_attempts(user.pk)
        first = apply_user_deletion(user_id=str(user.pk))
        self.assertTrue(first["ok"])
        self.assertGreaterEqual(first["deleted"], 1)
        second = apply_user_deletion(user_id=str(user.pk))
        self.assertTrue(second["ok"])
        self.assertEqual(second["deleted"], 0)

    def test_hook_then_user_delete_no_protect_block(self):
        """PROTECT FK: proposal phai duoc hook giai truoc truoc khi xoa user."""
        from django.contrib.auth import get_user_model

        student, student_user = make_class_account("HS001", "student")
        caregiver, _ = make_class_account("PH001", "caregiver")
        make_proposal(student, caregiver)
        apply_user_deletion(user_id=str(student_user.pk))
        # Xoa auth user khong bi PROTECT chan (khong con row f16 tham chieu).
        get_user_model().objects.filter(pk=student_user.pk).delete()
        self.assertEqual(ClassAccount.objects.filter(
            user_id=student_user.pk).count(), 0)

    def test_user_without_class_account_only_acct_attempts(self):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        plain = User.objects.create_user(username="plain_user",
                                         password="AnyPass123!")
        _acct_attempts(plain.pk)
        result = apply_user_deletion(user_id=str(plain.pk))
        self.assertTrue(result["ok"])
        self.assertEqual(result["deleted"], 2)


class ConnectionsHookTests(TestCase):
    def test_connections_hook_removes_proposals_keeps_account(self):
        student, student_user = make_class_account("HS001", "student")
        caregiver, _ = make_class_account("PH001", "caregiver")
        make_proposal(student, caregiver)
        _acct_attempts(student_user.pk)

        hook = ConnectionProposalDeletionHook()
        result = hook.apply_user_deletion(user_id=str(student_user.pk),
                                          requested_at=dt.datetime.now(tz=UTC))
        self.assertTrue(result["ok"])
        self.assertEqual(result["deleted"], 1)
        self.assertEqual(CompanionProposal.objects.count(), 0)
        # Tai khoan lop van con — thuoc category "account".
        self.assertTrue(ClassAccount.objects.filter(pk=student.pk).exists())
        self.assertTrue(LoginAttempt.objects.filter(
            attempt_key=f"acct:{student_user.pk}").exists())


class RegistryWiringTests(TestCase):
    def test_core_registry_deletion_hook_resolves_to_hook_protocol(self):
        from family_bridge_core import registry

        entry = registry.get_feature("F16")
        self.assertIsNotNone(entry)
        dotted = entry["deletion_hook"]
        module_path, _, attr = dotted.rpartition(".")
        module = importlib.import_module(module_path)
        hook = getattr(module, attr)
        instance = hook() if isinstance(hook, type) else hook
        self.assertTrue(callable(
            getattr(instance, "apply_user_deletion", None)))

    def test_f15_category_registration_protocol(self):
        """Khi f15 co trong build: hook dang ky duoc vao category co san va
        runner cua F15 nhan dict co 'ok' (khong phai int — protocol that)."""
        if importlib.util.find_spec(
                "family_bridge_features.f15_privacy") is None:
            self.skipTest("f15_privacy khong co trong build nay")
        from family_bridge_features.f15_privacy.services import registry

        base = "family_bridge_features.f16_classroom.services.deletion"
        registry.register_deletion_hook(
            "account", f"{base}.ClassroomAccountDeletionHook")
        registry.register_deletion_hook(
            "connections", f"{base}.ConnectionProposalDeletionHook")
        for category in ("account", "connections"):
            hook = registry.get_deletion_hook(category)
            instance = hook() if isinstance(hook, type) else hook
            outcome = instance.apply_user_deletion(
                user_id=str(uuid.uuid4()), requested_at=None)
            self.assertIsInstance(outcome, dict)
            self.assertTrue(outcome["ok"])
            self.assertEqual(outcome["deleted"], 0)
