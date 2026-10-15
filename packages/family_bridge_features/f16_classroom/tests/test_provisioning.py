"""Suite provisioning: import CSV tai khoan lop + cap de xuat (F16).

Moi truong: SQLite harness (FB_FEATURES co f16_classroom). Truong hop race
MySQL that nam o test_races_mysql.py (SKIP khi khong co MySQL).
"""

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.test import TestCase, override_settings

from family_bridge_features.f01_identity.services.display import save_display_name

from ..models import ClassAccount, CompanionProposal
from ..services.provisioning import run_import
from .helpers import (
    DEFAULT_PASSWORD, accounts_csv_text, cleanup_csv, make_class_account,
    proposals_csv_text, write_temp_csv,
)

MD5_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]


class DryRunTests(TestCase):
    def test_dry_run_zero_writes(self):
        path = write_temp_csv(accounts_csv_text([
            ("hs-001", "HS001", "student", "10A1", "Nguyen Van A"),
            ("ph-001", "PH001", "caregiver", "10A1", "Cha cua A"),
        ]))
        pairs = write_temp_csv(proposals_csv_text([("HS001", "PH001")]))
        try:
            summary = run_import(csv_path=path, proposals_csv_path=pairs,
                                 auto_pair_by_index=False, dry_run=True,
                                 initial_password=None)
            self.assertTrue(summary["ok"])
            self.assertEqual(summary["accounts_to_create"], 2)
            self.assertEqual(summary["proposals_to_create"], 1)
            self.assertEqual(ClassAccount.objects.count(), 0)
            self.assertEqual(CompanionProposal.objects.count(), 0)
            self.assertEqual(get_user_model().objects.count(), 0)
        finally:
            cleanup_csv(path)
            cleanup_csv(pairs)


@override_settings(PASSWORD_HASHERS=MD5_HASHERS)
class ImportAccountsTests(TestCase):
    def _rows_100(self):
        rows = []
        for i in range(1, 51):
            rows.append((f"hs-{i:03d}", f"HS{i:03d}", "student", "10A1",
                         f"Hoc sinh {i:03d}"))
        for i in range(1, 51):
            rows.append((f"ph-{i:03d}", f"PH{i:03d}", "caregiver", "10A1",
                         f"Phu huynh {i:03d}"))
        return rows

    def test_import_100_accounts_and_auto_pair_50(self):
        path = write_temp_csv(accounts_csv_text(self._rows_100()))
        try:
            summary = run_import(csv_path=path, proposals_csv_path=None,
                                 auto_pair_by_index=True, dry_run=False,
                                 initial_password=DEFAULT_PASSWORD)
            self.assertTrue(summary["ok"], summary)
            self.assertEqual(summary["accounts_created"], 100)
            self.assertEqual(summary["proposals_created"], 50)
            self.assertEqual(ClassAccount.objects.count(), 100)
            self.assertEqual(CompanionProposal.objects.count(), 50)
            user = ClassAccount.objects.get(login_code="HS001").user
            self.assertTrue(user.username.startswith("cls_"))
            self.assertEqual(user.first_name, "Hoc sinh 001")
            self.assertTrue(user.check_password(DEFAULT_PASSWORD))
            pair = CompanionProposal.objects.first()
            self.assertEqual(pair.status, CompanionProposal.STATUS_PROPOSED)
        finally:
            cleanup_csv(path)

    def test_rerun_identical_file_zero_new_and_state_preserved(self):
        path = write_temp_csv(accounts_csv_text(
            [("hs-001", "HS001", "student", "10A1", "Nguyen Van A")]))
        try:
            first = run_import(csv_path=path, proposals_csv_path=None,
                               auto_pair_by_index=False, dry_run=False,
                               initial_password=DEFAULT_PASSWORD)
            self.assertTrue(first["ok"])
            account = ClassAccount.objects.get(external_ref="hs-001")
            password_hash_before = account.user.password
            save_display_name(account.user, "Ten goi da doi")

            second = run_import(csv_path=path, proposals_csv_path=None,
                                auto_pair_by_index=False, dry_run=False,
                                initial_password=DEFAULT_PASSWORD)
            self.assertTrue(second["ok"])
            self.assertEqual(second["accounts_created"], 0)
            self.assertEqual(second["accounts_existing"], 1)
            account.refresh_from_db()
            # Idempotent: khong doi password (byte giong het) va giu ten goi
            # da duoc user tu dat sau khi import.
            self.assertEqual(account.user.password, password_hash_before)
            self.assertEqual(account.user.first_name, "Ten goi da doi")
            self.assertEqual(get_user_model().objects.count(), 1)
        finally:
            cleanup_csv(path)

    def test_drift_row_skipped_others_imported(self):
        account, _user = make_class_account("HS001", "student",
                                            external_ref="hs-001",
                                            class_ref="10A1")
        original_hash = account.user.password
        path = write_temp_csv(accounts_csv_text([
            ("hs-001", "HS001", "caregiver", "10A1", "Sai vai tro"),
            ("hs-002", "HS002", "student", "10A1", "Hoc sinh moi"),
        ]))
        try:
            summary = run_import(csv_path=path, proposals_csv_path=None,
                                 auto_pair_by_index=False, dry_run=False,
                                 initial_password=DEFAULT_PASSWORD)
            self.assertFalse(summary["ok"])
            self.assertEqual(summary["accounts_drifted"], 1)
            self.assertEqual(summary["accounts_created"], 1)
            reasons = {error["reason"] for error in summary["errors"]}
            self.assertIn("account_drift", reasons)
            account.refresh_from_db()
            self.assertEqual(account.role, "student")
            self.assertEqual(account.user.password, original_hash)
            self.assertFalse(ClassAccount.objects.filter(
                external_ref="hs-001", role="caregiver").exists())
        finally:
            cleanup_csv(path)

    def test_duplicate_in_file_errors_nothing_written(self):
        path = write_temp_csv(accounts_csv_text([
            ("hs-001", "HS001", "student", "10A1", "A"),
            ("hs-002", "HS001", "student", "10A1", "B"),
        ]))
        try:
            summary = run_import(csv_path=path, proposals_csv_path=None,
                                 auto_pair_by_index=False, dry_run=False,
                                 initial_password=DEFAULT_PASSWORD)
            self.assertFalse(summary["ok"])
            self.assertIn("duplicate_login_code_in_file",
                          [error["reason"] for error in summary["errors"]])
            self.assertEqual(ClassAccount.objects.count(), 0)
            self.assertEqual(get_user_model().objects.count(), 0)
        finally:
            cleanup_csv(path)

    def test_invalid_row_blocks_whole_import(self):
        path = write_temp_csv(accounts_csv_text([
            ("hs-001", "HS001", "student", "10A1", "A"),
            ("hs-002", "not valid!", "student", "10A1", "B"),
        ]))
        try:
            summary = run_import(csv_path=path, proposals_csv_path=None,
                                 auto_pair_by_index=False, dry_run=False,
                                 initial_password=DEFAULT_PASSWORD)
            self.assertFalse(summary["ok"])
            self.assertEqual(ClassAccount.objects.count(), 0)
        finally:
            cleanup_csv(path)


@override_settings(PASSWORD_HASHERS=MD5_HASHERS)
class ProposalImportTests(TestCase):
    def _seed_two(self):
        student, _ = make_class_account("HS001", "student", external_ref="hs-001")
        caregiver, _ = make_class_account("PH001", "caregiver",
                                          external_ref="ph-001")
        return student, caregiver

    def test_pair_with_unknown_code_error_no_proposal(self):
        path = write_temp_csv(accounts_csv_text(
            [("hs-001", "HS001", "student", "10A1", "A")]))
        pairs = write_temp_csv(proposals_csv_text([("HS001", "PH404")]))
        try:
            summary = run_import(csv_path=path, proposals_csv_path=pairs,
                                 auto_pair_by_index=False, dry_run=False,
                                 initial_password=DEFAULT_PASSWORD)
            self.assertFalse(summary["ok"])
            self.assertIn("pair_unknown_code",
                          [error["reason"] for error in summary["errors"]])
            self.assertEqual(CompanionProposal.objects.count(), 0)
        finally:
            cleanup_csv(path)
            cleanup_csv(pairs)

    def test_pair_role_mismatch_error(self):
        path = write_temp_csv(accounts_csv_text([
            ("hs-001", "HS001", "student", "10A1", "A"),
            ("ph-001", "PH001", "student", "10A1", "B"),
        ]))
        pairs = write_temp_csv(proposals_csv_text([("HS001", "PH001")]))
        try:
            summary = run_import(csv_path=path, proposals_csv_path=pairs,
                                 auto_pair_by_index=False, dry_run=False,
                                 initial_password=DEFAULT_PASSWORD)
            self.assertFalse(summary["ok"])
            self.assertEqual(CompanionProposal.objects.count(), 0)
        finally:
            cleanup_csv(path)
            cleanup_csv(pairs)

    def test_canceled_proposal_rerun_skipped_and_stays_canceled(self):
        student, caregiver = self._seed_two()
        proposal = CompanionProposal.objects.create(
            student_account=student, caregiver_account=caregiver,
            status=CompanionProposal.STATUS_CANCELED,
            outcome_reason="canceled_by_student")
        path = write_temp_csv(accounts_csv_text(
            [("hs-001", "HS001", "student", "10A1", "A"),
             ("ph-001", "PH001", "caregiver", "10A1", "B")]))
        pairs = write_temp_csv(proposals_csv_text([("HS001", "PH001")]))
        try:
            summary = run_import(csv_path=path, proposals_csv_path=pairs,
                                 auto_pair_by_index=False, dry_run=False,
                                 initial_password=DEFAULT_PASSWORD)
            self.assertTrue(summary["ok"], summary)
            self.assertEqual(summary["proposals_skipped_existing"], 1)
            self.assertEqual(summary["proposals_created"], 0)
            proposal.refresh_from_db()
            self.assertEqual(proposal.status,
                             CompanionProposal.STATUS_CANCELED)
            self.assertEqual(CompanionProposal.objects.count(), 1)
        finally:
            cleanup_csv(path)
            cleanup_csv(pairs)


class FailClosedTests(TestCase):
    def test_missing_password_apply_mode_writes_nothing(self):
        path = write_temp_csv(accounts_csv_text(
            [("hs-001", "HS001", "student", "10A1", "A")]))
        try:
            summary = run_import(csv_path=path, proposals_csv_path=None,
                                 auto_pair_by_index=False, dry_run=False,
                                 initial_password=None)
            self.assertFalse(summary["ok"])
            self.assertIn("initial_password_required",
                          [error["reason"] for error in summary["errors"]])
            self.assertEqual(ClassAccount.objects.count(), 0)
            self.assertEqual(get_user_model().objects.count(), 0)

            weak = run_import(csv_path=path, proposals_csv_path=None,
                              auto_pair_by_index=False, dry_run=False,
                              initial_password="ngan")
            self.assertFalse(weak["ok"])
            self.assertIn("initial_password_too_short",
                          [error["reason"] for error in weak["errors"]])
            self.assertEqual(ClassAccount.objects.count(), 0)
        finally:
            cleanup_csv(path)


@override_settings(PASSWORD_HASHERS=MD5_HASHERS)
class IntegrityRaceBestEffortTests(TestCase):
    """Per-row savepoint + re-fetch: SQLite best-effort (MySQL that o suite
    rieng). Mo phong xung dot username: user ton tai truoc voi username
    trung cls_<ext> nhung CHUA co ClassAccount."""

    def test_username_conflict_recorded_row_error_import_continues(self):
        User = get_user_model()
        User.objects.create_user(username="cls_ext-x", password="AnyPass123!")
        path = write_temp_csv(accounts_csv_text([
            ("ext-x", "HS001", "student", "10A1", "Bi xung dot"),
            ("ext-y", "HS002", "student", "10A1", "Chay tiep"),
        ]))
        try:
            summary = run_import(csv_path=path, proposals_csv_path=None,
                                 auto_pair_by_index=False, dry_run=False,
                                 initial_password=DEFAULT_PASSWORD)
            self.assertFalse(summary["ok"])
            reasons = [error["reason"] for error in summary["errors"]]
            self.assertIn("account_conflict", reasons)
            self.assertEqual(summary["accounts_created"], 1)
            self.assertTrue(ClassAccount.objects.filter(
                external_ref="ext-y", login_code="HS002").exists())
            self.assertFalse(ClassAccount.objects.filter(
                external_ref="ext-x").exists())
        finally:
            cleanup_csv(path)
