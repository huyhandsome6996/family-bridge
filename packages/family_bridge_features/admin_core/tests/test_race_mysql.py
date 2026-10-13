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
        active unrevoked grant; both return the same grant ID safely.
        """
        outcomes = []
        barrier = threading.Barrier(2)

        def grant():
            barrier.wait()
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

        threads = [threading.Thread(target=grant) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(len(outcomes), 2)
        self.assertEqual(outcomes[0], outcomes[1])

        active_grants = AdminCapabilityGrant.objects.filter(
            user_id=self.target.pk,
            capability="content.manage",
            scope_type="global",
            scope_ref="",
            revoked_at__isnull=True,
        )
        self.assertEqual(active_grants.count(), 1)

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
