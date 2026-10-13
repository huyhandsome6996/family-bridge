"""Admin Core concurrency tests requiring real MySQL / TiDB constraints (WT-02-03)."""

import os
import threading
import unittest

from django.test import TransactionTestCase

MYSQL = os.getenv("FB_TEST_DB", "sqlite") == "mysql"
SKIP_REASON = ("requires FB_TEST_DB=mysql: SQLite cannot prove row-lock/"
               "unique race semantics (DSA-07, verification plan)")

from fixtures.actors import make_system_admin, make_user  # noqa: E402
from ..models import AdminCapabilityGrant
from ..services.admin import AdminCapabilityService


@unittest.skipIf(not MYSQL, SKIP_REASON)
class AdminGrantRaceTests(TransactionTestCase):
    def setUp(self):
        self.service = AdminCapabilityService()
        self.admin = make_system_admin()
        self.target = make_user("teacher")

    def test_concurrent_grant_single_active_grant(self):
        """Two concurrent calls to AdminCapabilityService.grant produce exactly 1
        active unrevoked grant; both return the same valid UUID string matching
        the single database record.
        """
        from django.db import connection
        outcomes = []
        barrier = threading.Barrier(2)

        def grant():
            barrier.wait(timeout=10)
            try:
                g = self.service.grant(
                    actor_id=str(self.admin.pk),
                    user_id=str(self.target.pk),
                    capability="content.manage",
                    scope_type="global",
                    scope_ref="",
                    ttl_days=30,
                )
                outcomes.append(str(g.id))
            except Exception as exc:
                outcomes.append((type(exc).__name__, getattr(exc, "details", {})))
            finally:
                connection.close()

        threads = [threading.Thread(target=grant) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)
            self.assertFalse(t.is_alive())

        self.assertEqual(len(outcomes), 2)
        # Assert both outcomes are valid UUID strings (not exception tuples)
        self.assertTrue(isinstance(outcomes[0], str), f"Outcome 0 was not a string: {outcomes[0]}")
        self.assertTrue(isinstance(outcomes[1], str), f"Outcome 1 was not a string: {outcomes[1]}")
        self.assertEqual(outcomes[0], outcomes[1])

        active_grants = list(AdminCapabilityGrant.objects.filter(
            user_id=self.target.pk,
            capability="content.manage",
            scope_type="global",
            scope_ref="",
            revoked_at__isnull=True,
        ))
        self.assertEqual(len(active_grants), 1)
        self.assertEqual(outcomes[0], str(active_grants[0].id))

    def test_direct_db_constraint_and_lifecycle(self):
        """Direct database constraint tests:
        1. Duplicate active grant (revoked_at is NULL) violates uniq_f16_active_grant.
        2. Revoking grant sets active_marker to NULL, allowing new grant.
        3. Multiple revoked grants can coexist.
        """
        import datetime as dt
        from django.db import IntegrityError
        from django.utils import timezone
        now = timezone.now()
        ttl = now + dt.timedelta(days=30)

        g1 = AdminCapabilityGrant.objects.create(
            user=self.target, capability="content.manage",
            scope_type="global", scope_ref="",
            granted_by=str(self.admin.pk), expires_at=ttl,
            revoked_at=None,
        )
        from django.db import transaction
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                AdminCapabilityGrant.objects.create(
                    user=self.target, capability="content.manage",
                    scope_type="global", scope_ref="",
                    granted_by=str(self.admin.pk), expires_at=ttl,
                    revoked_at=None,
                )

        g1.revoked_at = now
        g1.save()

        g2 = AdminCapabilityGrant.objects.create(
            user=self.target, capability="content.manage",
            scope_type="global", scope_ref="",
            granted_by=str(self.admin.pk), expires_at=ttl,
            revoked_at=None,
        )
        self.assertNotEqual(g1.id, g2.id)

        g2.revoked_at = now
        g2.save()

        self.assertEqual(AdminCapabilityGrant.objects.filter(
            user=self.target, capability="content.manage",
            scope_type="global", scope_ref="",
            revoked_at__isnull=False,
        ).count(), 2)

    def test_revoke_and_regrant_lifecycle(self):
        """Revoking an active grant sets active_marker to NULL in MySQL/TiDB,
        allowing a fresh grant for the same capability without constraint error.
        """
        g1 = self.service.grant(
            actor_id=str(self.admin.pk),
            user_id=str(self.target.pk),
            capability="content.manage",
            scope_type="global",
            scope_ref="",
            ttl_days=30,
        )
        self.assertIsNone(g1.revoked_at)

        self.service.revoke(
            actor_id=str(self.admin.pk),
            grant_id=str(g1.id),
            reason="test revocation",
        )
        g1.refresh_from_db()
        self.assertIsNotNone(g1.revoked_at)

        g2 = self.service.grant(
            actor_id=str(self.admin.pk),
            user_id=str(self.target.pk),
            capability="content.manage",
            scope_type="global",
            scope_ref="",
            ttl_days=60,
        )
        self.assertIsNone(g2.revoked_at)
        self.assertNotEqual(str(g1.id), str(g2.id))
