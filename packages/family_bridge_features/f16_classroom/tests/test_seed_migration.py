"""Real migration upgrades must preserve existing classroom state."""
from django.contrib.auth import get_user_model
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase

from family_bridge_features.f01_identity.models import Connection
from ..models import ClassAccount, CompanionProposal, LoginAttempt


class ClassroomUpgradeTests(TransactionTestCase):
    previous = [("f16_classroom", "0002_admin_pairs_f16")]
    target = [("f16_classroom", "0003_seed_pilot_accounts")]

    def setUp(self):
        MigrationExecutor(connection).migrate(self.previous)
        self.addCleanup(lambda: MigrationExecutor(connection).migrate(self.target))

    def snapshot(self):
        return {
            model._meta.label: list(model.objects.order_by("pk").values())
            for model in [get_user_model(), ClassAccount, CompanionProposal,
                          Connection, LoginAttempt]
        }

    def upgrade(self):
        MigrationExecutor(connection).migrate(self.target)

    def test_existing_codes_passwords_revocations_and_lockouts_survive_upgrade(self):
        User = get_user_model()
        student = User.objects.create(username="synthetic-hs", password="!disabled", is_active=False)
        parent = User.objects.create(username="synthetic-ph", password="!existing")
        hs = ClassAccount.objects.create(user=student, login_code="HS001",
            role="student", class_ref="SYNTHETIC", external_ref="pilot-2026-HS001")
        ph = ClassAccount.objects.create(user=parent, login_code="PH001",
            role="caregiver", class_ref="SYNTHETIC", external_ref="pilot-2026-PH001")
        CompanionProposal.objects.create(student_account=hs, caregiver_account=ph,
                                         status="canceled", revision=4)
        low, high = sorted([student.pk, parent.pk], key=str)
        Connection.objects.create(party_low_id=low, party_high_id=high,
            status="revoked", relationship_kind="parent_child", generation=2, revision=3,
            source="admin_provisioned", source_admin="synthetic", source_batch="synthetic")
        LoginAttempt.objects.create(attempt_key="codeh:" + "a" * 64, outcome="locked_out")
        before = self.snapshot()
        self.upgrade()
        self.assertEqual(self.snapshot(), before)
        # A subsequent deploy/migrate is idempotent as well.
        self.upgrade()
        self.assertEqual(self.snapshot(), before)

    def test_fresh_install_does_not_create_accounts_with_shared_credentials(self):
        before = self.snapshot()
        self.upgrade()
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(ClassAccount.objects.count(), 0)
