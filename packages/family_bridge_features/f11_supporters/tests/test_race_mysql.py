"""F11 concurrency tests requiring real MySQL / TiDB constraints (WT-02-03)."""

import os
import threading
import unittest

from django.test import TransactionTestCase

MYSQL = os.getenv("FB_TEST_DB", "sqlite") == "mysql"
SKIP_REASON = ("requires FB_TEST_DB=mysql: SQLite cannot prove row-lock/"
               "unique race semantics (DSA-07, verification plan)")

from fixtures.actors import make_student, make_caregiver  # noqa: E402
from ..models import SupporterRole, STATUS_ACTIVE, STATUS_PENDING, STATUS_REVOKED
from ..services.supporters import SupporterService


@unittest.skipIf(not MYSQL, SKIP_REASON)
class SupporterRoleRaceTests(TransactionTestCase):
    def setUp(self):
        self.service = SupporterService()
        self.student = make_student()
        self.supporter = make_caregiver()

    def test_concurrent_invite_single_open_role(self):
        """Two concurrent calls to SupporterService.invite for the same student-supporter
        pair produce exactly 1 open SupporterRole; both return the same role ID safely.
        """
        outcomes = []
        barrier = threading.Barrier(2)

        def invite():
            barrier.wait()
            try:
                role = self.service.invite(
                    student_id=str(self.student.pk),
                    supporter_id=str(self.supporter.pk),
                    relationship_kind="family",
                )
                outcomes.append(str(role.id))
            except Exception as exc:
                outcomes.append((type(exc).__name__, getattr(exc, "details", {})))

        threads = [threading.Thread(target=invite) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(len(outcomes), 2)
        self.assertEqual(outcomes[0], outcomes[1])

        open_roles = SupporterRole.objects.filter(
            student_id=self.student.pk,
            supporter_id=self.supporter.pk,
            status__in=[STATUS_PENDING, STATUS_ACTIVE],
        )
        self.assertEqual(open_roles.count(), 1)

    def test_revoke_and_reinvite_lifecycle(self):
        """Ending/revoking an open role clears active_marker in MySQL/TiDB,
        allowing a fresh invitation without unique constraint conflict.
        """
        role1 = self.service.invite(
            student_id=str(self.student.pk),
            supporter_id=str(self.supporter.pk),
            relationship_kind="family",
        )
        self.assertEqual(role1.status, STATUS_PENDING)

        self.service.revoke(actor_id=str(self.student.pk), role_id=str(role1.id))
        role1.refresh_from_db()
        self.assertEqual(role1.status, STATUS_REVOKED)

        # Fresh invitation must succeed
        role2 = self.service.invite(
            student_id=str(self.student.pk),
            supporter_id=str(self.supporter.pk),
            relationship_kind="family",
        )
        self.assertEqual(role2.status, STATUS_PENDING)
        self.assertNotEqual(str(role1.id), str(role2.id))
