"""Concurrency suites canh tranh du lieu — chi chay tren MySQL that (SEC-15).

SQLite khong co SELECT ... FOR UPDATE (no-op) va khong chung minh y nghia
row-lock/unique race; cac case nay SKIP voi ly do ro rang khi khong co
FB_TEST_DB=mysql va duoc bao NOT_RUN trong report — khong bao gio dem la
PASS tren SQLite (idiom copy tu f01_identity/tests/test_race_mysql.py).
"""

import os
import threading
import unittest

from django.db import connections
from django.test import TransactionTestCase, override_settings

MYSQL = os.getenv("FB_TEST_DB", "sqlite") == "mysql"
SKIP_REASON = ("requires FB_TEST_DB=mysql: SQLite cannot prove row-lock/"
               "unique race semantics (DSA-07, verification plan)")

MD5_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]


def _seed_classroom_pair():
    from .helpers import accept_service_consent, make_class_account, make_proposal

    student, student_user = make_class_account("HS001", "student")
    caregiver, caregiver_user = make_class_account("PH001", "caregiver")
    proposal = make_proposal(student, caregiver)
    accept_service_consent(student_user)
    accept_service_consent(caregiver_user)
    return student, caregiver, proposal, student_user, caregiver_user


@unittest.skipIf(not MYSQL, SKIP_REASON)
@override_settings(PASSWORD_HASHERS=MD5_HASHERS)
class DoubleConfirmRaceTests(TransactionTestCase):
    """Hai thread xac nhan buoc hai cung luc → dung MOTT Connection active;
    ben thua nhan loi nghiep vu sach (khong 500, khong trang thai rac)."""

    def test_double_confirm_second_step_single_connection(self):
        from family_bridge_features.f01_identity.models import Connection

        from ..services.proposals import ProposalService

        _student, _caregiver, proposal, student_user, caregiver_user = \
            _seed_classroom_pair()
        service = ProposalService()
        service.confirm(student_user, str(proposal.id))  # buoc mot

        outcomes = []
        barrier = threading.Barrier(2)

        def confirm(user):
            barrier.wait()
            try:
                service.confirm(user, str(proposal.id))
                outcomes.append("ok")
            except Exception as exc:  # noqa: BLE001 — ben thua: loi nghiep vu
                outcomes.append(type(exc).__name__)
            finally:
                _close_all_connections()

        threads = [threading.Thread(target=confirm, args=(user,))
                   for user in (student_user, caregiver_user)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        self.assertIn("ok", outcomes)
        self.assertEqual(len(outcomes), 2)
        self.assertEqual(Connection.objects.count(), 1)
        proposal.refresh_from_db()
        self.assertEqual(proposal.status, "connected")
        self.assertIsNotNone(proposal.invite_id)


@unittest.skipIf(not MYSQL, SKIP_REASON)
@override_settings(PASSWORD_HASHERS=MD5_HASHERS)
class ConcurrentProvisioningRaceTests(TransactionTestCase):
    """Hai lenh provision chay song song cung CSV → khong user/account trung,
    dung mot proposal cho moi cap; ca hai lan chay ket thuc ok (ben thua doc
    lai nguoi thang — idempotent theo external_ref)."""

    CSV_ROWS = [
        ("hs-001", "HS001", "student", "10A1", "Hoc sinh 001"),
        ("ph-001", "PH001", "caregiver", "10A1", "Phu huynh 001"),
    ]

    def test_two_concurrent_imports_single_rows_no_crash(self):
        from django.contrib.auth import get_user_model

        from ..models import ClassAccount, CompanionProposal
        from ..services.provisioning import run_import
        from .helpers import (
            accounts_csv_text, cleanup_csv, proposals_csv_text,
            write_temp_csv,
        )

        accounts = write_temp_csv(accounts_csv_text(self.CSV_ROWS))
        pairs = write_temp_csv(proposals_csv_text([("HS001", "PH001")]))
        try:
            summaries = []
            barrier = threading.Barrier(2)

            def run_import_thread():
                barrier.wait()
                try:
                    summaries.append(run_import(
                        csv_path=accounts, proposals_csv_path=pairs,
                        auto_pair_by_index=False, dry_run=False,
                        initial_password="RacePass2026!"))
                finally:
                    _close_all_connections()

            threads = [threading.Thread(target=run_import_thread)
                       for _ in range(2)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join()

            self.assertEqual(len(summaries), 2)
            for summary in summaries:
                self.assertTrue(summary["ok"], summary)
            self.assertEqual(ClassAccount.objects.count(), 2)
            self.assertEqual(CompanionProposal.objects.count(), 1)
            self.assertEqual(
                get_user_model().objects.filter(
                    username__startswith="cls_").count(), 2)
            created_total = sum(item["accounts_created"]
                                for item in summaries)
            existing_total = sum(item["accounts_existing"]
                                 for item in summaries)
            # Dung MOT ben tao moi user; ben kia doc lai nhu "existing".
            self.assertEqual(created_total, 2)
            self.assertEqual(existing_total, 2)
        finally:
            cleanup_csv(accounts)
            cleanup_csv(pairs)
