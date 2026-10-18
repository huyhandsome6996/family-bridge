"""Kiem thu cap phat/nap cap HS-PH do ADMIN (18/10/2026 — admin-provisioned
pairs, CAP-23 classroom.provision).

Cac case A01..A12 trong prompt Antigravity V2 duoc map vao cac test nay:
- A01: cap phap tao connection ACTIVE truoc khi nguoi dung dang nhap
- A02: hai phia dang nhap va thay dung doi tuong, khong qua /proposal
- A03: apply lai cung cap → khong nhan doi
- A04: HS/PH khong co grant → 404 (be mat khong ton tai)
- A05: admin ngoai pham vi lop → khong doc/khong cap lop khac (LOC THAT)
- A06: hang dao vai/cung nguoi/thieu/khoa → tu choi, khong ghi lech
- A08: mat khau/ma/ten da doi duoc giu nguyen khi nap lai
- A09: cap da revoke khong tu hoi sinh; reconnect co y thuc → generation moi
- A10: provisioning KHONG tao consent/grant rieng tu nao
- A11: backfill inventory/dry-run/apply/idempotency
- A12: round-trip API that voi session + grant capability
"""

import uuid

from django.test import override_settings
from rest_framework.test import APIClient

from family_bridge_features.f01_identity.models import (
    CONNECTION_ACTIVE, Connection,
)
from family_bridge_features.f01_identity.tests.helpers import (
    accept_service_consent, auth_header, make_session,
)

from ..models import CompanionProposal, PairProvisionBatch
from ..services import admin_provision
from .helpers import (
    ScopedThrottleTestCase, make_class_account, make_proposal,
)

CAP = "classroom.provision"
NEW_PASSWORD = "AdminInit2026!"


class AdminProvisionBase(ScopedThrottleTestCase):
    """Admin grant + session + APIClient dung chung."""

    @override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
    def setUp(self):
        super().setUp()
        self.admin_acct, self.admin = make_class_account(
            "ADM01", "caregiver", class_ref="10A1", display_name="Quản trị lớp")
        self.client = APIClient()
        token, _ = make_session(self.admin)
        self.admin_token = token
        from family_bridge_features.admin_core.models import AdminCapabilityGrant
        AdminCapabilityGrant.objects.create(
            user=self.admin, capability=CAP, scope_type="global",
            granted_by="bootstrap-operator")

    def _grant(self, user, *, scope_type="global", scope_ref=""):
        from family_bridge_features.admin_core.models import AdminCapabilityGrant
        return AdminCapabilityGrant.objects.create(
            user=user, capability=CAP, scope_type=scope_type,
            scope_ref=scope_ref, granted_by="bootstrap-operator")

    def _pair_row(self, caregiver_code, student_code, **extra):
        row = {"caregiver_code": caregiver_code, "student_code": student_code}
        row.update(extra)
        return row


class ServiceLevelTests(AdminProvisionBase):
    """A01/A03/A06/A08/A09/A10/A11 — service layer truc tiep."""

    def test_a01_apply_creates_active_connection_before_login(self):
        hs, hs_user = make_class_account("HS001", "student", class_ref="10A1")
        ph, ph_user = make_class_account("PH001", "caregiver", class_ref="10A1")
        result = admin_provision.apply_pairs(
            self.admin, class_ref="10A1", batch_ref=str(uuid.uuid4()),
            rows=[self._pair_row("PH001", "HS001")])
        self.assertTrue(result["ok"])
        self.assertEqual(result["connected"], 1)
        connection = Connection.objects.get(pk=result["rows"][0]["connection_id"])
        self.assertEqual(connection.status, CONNECTION_ACTIVE)
        self.assertEqual(connection.source, "admin_provisioned")
        self.assertEqual(connection.source_admin, str(self.admin.pk))
        self.assertIsNone(connection.invite)  # khong gia invite cua ai
        self.assertEqual(connection.generation, 1)
        # Nguoi dung CHUA dang nhap lan nao — connection da ACTIVE.

    def test_a01_preview_creates_missing_accounts(self):
        result = admin_provision.preview_pairs(
            self.admin, class_ref="10A1",
            rows=[self._pair_row("PH010", "HS010",
                                 caregiver_name="Phụ huynh mười",
                                 student_name="Học sinh mười")],
            initial_password=NEW_PASSWORD)
        self.assertTrue(result["ok"])
        self.assertEqual(
            result["summary"]["will_create_accounts_and_connect"], 1)
        self.assertEqual(result["summary"]["accounts_to_create"], 2)

    def test_a01_apply_creates_missing_accounts_and_connects(self):
        result = admin_provision.apply_pairs(
            self.admin, class_ref="10A1", batch_ref=str(uuid.uuid4()),
            rows=[self._pair_row("PH011", "HS011",
                                 caregiver_name="Phụ huynh mười một",
                                 student_name="Học sinh mười một")],
            initial_password=NEW_PASSWORD)
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["connected"], 1)
        from ..models import ClassAccount
        hs = ClassAccount.objects.get(login_code="HS011")
        ph = ClassAccount.objects.get(login_code="PH011")
        self.assertTrue(
            Connection.objects.filter(
                party_low_id=min(str(hs.user_id), str(ph.user_id)),
                party_high_id=max(str(hs.user_id), str(ph.user_id)),
                status=CONNECTION_ACTIVE).exists())

    def test_a03_reapply_same_rows_no_duplicate(self):
        make_class_account("HS002", "student", class_ref="10A1")
        make_class_account("PH002", "caregiver", class_ref="10A1")
        rows = [self._pair_row("PH002", "HS002")]
        first = admin_provision.apply_pairs(
            self.admin, class_ref="10A1", batch_ref=str(uuid.uuid4()),
            rows=rows)
        self.assertEqual(first["connected"], 1)
        second = admin_provision.apply_pairs(
            self.admin, class_ref="10A1", batch_ref=str(uuid.uuid4()),
            rows=rows)
        self.assertEqual(second["already_active"], 1)
        self.assertEqual(second["connected"], 0)
        self.assertEqual(Connection.objects.count(), 1)

    def test_a03_same_batch_ref_replays_stored_summary(self):
        make_class_account("HS003", "student", class_ref="10A1")
        make_class_account("PH003", "caregiver", class_ref="10A1")
        batch = str(uuid.uuid4())
        first = admin_provision.apply_pairs(
            self.admin, class_ref="10A1", batch_ref=batch,
            rows=[self._pair_row("PH003", "HS003")])
        second = admin_provision.apply_pairs(
            self.admin, class_ref="10A1", batch_ref=batch,
            rows=[self._pair_row("PH003", "HS003")])
        self.assertTrue(second["replayed"])
        self.assertEqual(second["batch_id"], first["batch_id"])
        self.assertEqual(Connection.objects.count(), 1)

    def test_a06_wrong_role_same_user_and_inactive_rejected(self):
        hs, _ = make_class_account("HS004", "student", class_ref="10A1")
        ph, _ = make_class_account("PH004", "caregiver", class_ref="10A1")
        hs_inactive, _ = make_class_account("HS005", "student",
                                            class_ref="10A1", is_active=False)
        rows = [
            self._pair_row("HS004", "HS004"),          # dao vai + cung nguoi
            self._pair_row("HS004", "PH004"),          # sai vai PH ben trai
            self._pair_row("PH004", "HS005"),          # tai khoan bi khoa
            self._pair_row("ZZZZZ1", "HS004"),         # ma khong ton tai
        ]
        result = admin_provision.apply_pairs(
            self.admin, class_ref="10A1", batch_ref=str(uuid.uuid4()),
            rows=rows)
        self.assertFalse(result["ok"])
        self.assertFalse(result["wrote"])  # KHONG ghi gi
        self.assertEqual(Connection.objects.count(), 0)
        statuses = [r["status"] for r in result["rows"]]
        self.assertEqual(statuses, ["error", "error", "error", "error"])

    def test_a06_new_accounts_without_password_rejected_no_partial_write(self):
        make_class_account("HS006", "student", class_ref="10A1")
        rows = [self._pair_row("PH006", "HS006",
                               caregiver_name="Phụ huynh sáu")]
        result = admin_provision.apply_pairs(
            self.admin, class_ref="10A1", batch_ref=str(uuid.uuid4()),
            rows=rows, initial_password=None)
        self.assertFalse(result["ok"])
        self.assertFalse(result["wrote"])
        self.assertFalse(
            Connection.objects.filter(status=CONNECTION_ACTIVE).exists())
        from ..models import ClassAccount
        self.assertFalse(
            ClassAccount.objects.filter(login_code="PH006").exists())

    def test_a08_existing_credentials_unchanged_after_reimport(self):
        _, hs_user = make_class_account("HS007", "student", class_ref="10A1",
                                        password="OldPass2026!")
        _, ph_user = make_class_account("PH007", "caregiver", class_ref="10A1",
                                        password="OldPass2026!")
        hs_user.set_password("Changed2026x")
        hs_user.save(update_fields=["password"])
        result = admin_provision.apply_pairs(
            self.admin, class_ref="10A1", batch_ref=str(uuid.uuid4()),
            rows=[self._pair_row("PH007", "HS007")])
        self.assertTrue(result["ok"])
        hs_user.refresh_from_db()
        self.assertTrue(hs_user.check_password("Changed2026x"))
        # Row da active → trang thai already_active, khong doi gi.

    def test_a09_revoked_pair_not_revived_without_explicit_reconnect(self):
        hs, hs_user = make_class_account("HS008", "student", class_ref="10A1")
        ph, ph_user = make_class_account("PH008", "caregiver", class_ref="10A1")
        # Cap da co ket noi roi bi revoke (generation 1).
        Connection.objects.create(
            party_low_id=min(str(hs_user.pk), str(ph_user.pk)),
            party_high_id=max(str(hs_user.pk), str(ph_user.pk)),
            invite=None, relationship_kind="primary",
            status="revoked", generation=1)
        preview = admin_provision.preview_pairs(
            self.admin, class_ref="10A1",
            rows=[self._pair_row("PH008", "HS008")])
        self.assertEqual(preview["rows"][0]["status"],
                         admin_provision.ROW_REVOKED)
        result = admin_provision.apply_pairs(
            self.admin, class_ref="10A1", batch_ref=str(uuid.uuid4()),
            rows=[self._pair_row("PH008", "HS008")])
        self.assertFalse(result["ok"])
        self.assertFalse(result["wrote"])
        self.assertEqual(
            Connection.objects.filter(status=CONNECTION_ACTIVE).count(), 0)

    def test_a09_explicit_reconnect_creates_new_generation(self):
        hs, hs_user = make_class_account("HS009", "student", class_ref="10A1")
        ph, ph_user = make_class_account("PH009", "caregiver", class_ref="10A1")
        Connection.objects.create(
            party_low_id=min(str(hs_user.pk), str(ph_user.pk)),
            party_high_id=max(str(hs_user.pk), str(ph_user.pk)),
            invite=None, relationship_kind="primary",
            status="revoked", generation=1)
        result = admin_provision.apply_pairs(
            self.admin, class_ref="10A1", batch_ref=str(uuid.uuid4()),
            rows=[self._pair_row("PH009", "HS009", allow_reconnect=True)])
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["reconnected"], 1)
        self.assertEqual(result["rows"][0]["generation"], 2)
        self.assertEqual(
            Connection.objects.filter(status=CONNECTION_ACTIVE).count(), 1)
        # Ket noi cu van revoked — khong hoi sinh grant cu.
        old = Connection.objects.filter(generation=1).first()
        self.assertEqual(old.status, "revoked")

    def test_a10_provisioning_creates_no_consent_and_no_share(self):
        make_class_account("HS010", "student", class_ref="10A1")
        make_class_account("PH010", "caregiver", class_ref="10A1")
        from family_bridge_features.f01_identity.models import ConsentRecord
        from family_bridge_features.f07_mood.models import MoodShare
        from family_bridge_features.f08_journal.models import JournalShare
        before = (ConsentRecord.objects.count(), MoodShare.objects.count(),
                  JournalShare.objects.count())
        admin_provision.apply_pairs(
            self.admin, class_ref="10A1", batch_ref=str(uuid.uuid4()),
            rows=[self._pair_row("PH010", "HS010")])
        after = (ConsentRecord.objects.count(), MoodShare.objects.count(),
                 JournalShare.objects.count())
        self.assertEqual(after, before)  # khong tu dong chia se/ghi consent

    def test_a11_backfill_inventory_and_apply_pending_pairs(self):
        pairs = []
        for i in range(1, 4):
            hs, _ = make_class_account(f"HS1{i:02d}", "student", class_ref="10A1")
            ph, _ = make_class_account(f"PH1{i:02d}", "caregiver", class_ref="10A1")
            pairs.append(make_proposal(hs, ph))
        inventory = admin_provision.backfill_inventory(self.admin)
        self.assertEqual(inventory["proposals"]["eligible_pending"], 3)
        dry = admin_provision.backfill_inventory(self.admin)
        self.assertEqual(dry["proposals"]["eligible_pending"], 3)
        self.assertEqual(Connection.objects.count(), 0)
        result = admin_provision.backfill_apply(
            self.admin, batch_ref=str(uuid.uuid4()))
        self.assertTrue(result["ok"])
        self.assertEqual(result["activated"], 3)
        self.assertEqual(
            Connection.objects.filter(status=CONNECTION_ACTIVE).count(), 3)
        for proposal in pairs:
            proposal.refresh_from_db()
            self.assertEqual(proposal.status, CompanionProposal.STATUS_CONNECTED)
            self.assertEqual(proposal.outcome_reason, "admin_provisioned")
            self.assertIsNone(proposal.first_confirmed_at)  # khong gia
        # Idempotent: chay lai → khong nhan doi.
        rerun = admin_provision.backfill_inventory(self.admin)
        self.assertEqual(rerun["proposals"]["eligible_pending"], 0)
        self.assertEqual(rerun["already_active_pairs"], 3)

    def test_a11_backfill_skips_inactive_and_revoked(self):
        hs_ok, _ = make_class_account("HS120", "student", class_ref="10A1")
        ph_ok, _ = make_class_account("PH120", "caregiver", class_ref="10A1")
        hs_bad, _ = make_class_account("HS121", "student", class_ref="10A1",
                                       is_active=False)
        ph_bad, _ = make_class_account("PH121", "caregiver", class_ref="10A1")
        make_proposal(hs_ok, ph_ok)
        make_proposal(hs_bad, ph_bad)
        result = admin_provision.backfill_apply(
            self.admin, batch_ref=str(uuid.uuid4()))
        self.assertEqual(result["activated"], 1)
        self.assertEqual(result["blocked"], 1)

    def test_scope_school_grant_only_matching_class(self):
        make_class_account("HS130", "student", class_ref="10A2")
        make_class_account("PH130", "caregiver", class_ref="10A2")
        _, other_admin = make_class_account("ADM02", "caregiver",
                                            class_ref="10A9")
        self._grant(other_admin, scope_type="school", scope_ref="10A1")
        from family_bridge_core.errors import NotAuthorized
        with self.assertRaises(NotAuthorized):
            admin_provision.apply_pairs(
                other_admin, class_ref="10A2", batch_ref=str(uuid.uuid4()),
                rows=[self._pair_row("PH130", "HS130")])


class ApiRoundTripTests(AdminProvisionBase):
    """A02/A04/A05/A12 — API that: session + grant + envelope."""

    def _post(self, path, payload, token=None):
        return self.client.post(
            path, payload, format="json",
            **auth_header(token or self.admin_token))

    def test_a12_admin_round_trip_creates_and_users_see_each_other(self):
        make_class_account("HS140", "student", class_ref="10A1")
        make_class_account("PH140", "caregiver", class_ref="10A1")
        classes = self.client.get(
            "/api/v1/classroom/admin/classes",
            **auth_header(self.admin_token))
        self.assertEqual(classes.status_code, 200)
        preview = self._post("/api/v1/classroom/admin/pairs-preview", {
            "class_ref": "10A1",
            "rows": [self._pair_row("PH140", "HS140")]})
        self.assertEqual(preview.status_code, 200, preview.content)
        self.assertEqual(
            preview.json()["summary"]["will_connect"], 1)
        apply = self._post("/api/v1/classroom/admin/pairs-apply", {
            "class_ref": "10A1",
            "rows": [self._pair_row("PH140", "HS140")],
            "batch_ref": str(uuid.uuid4())})
        self.assertEqual(apply.status_code, 200, apply.content)
        self.assertTrue(apply.json()["ok"])

        # A02: hai phia dang nhap that → thay dung doi tuong qua API ket noi.
        from ..services.accounts import ClassLoginService
        _, _, _, _, student_payload = ClassLoginService().login(
            code="HS140", password="InitPass2026!")
        _, _, _, _, caregiver_payload = ClassLoginService().login(
            code="PH140", password="InitPass2026!")
        student_view = self.client.get(
            "/api/v1/connections",
            **auth_header(student_payload["token"]))
        self.assertEqual(student_view.status_code, 200)
        self.assertEqual(len(student_view.json()["results"]), 1)
        caregiver_view = self.client.get(
            "/api/v1/connections",
            **auth_header(caregiver_payload["token"]))
        self.assertEqual(caregiver_view.status_code, 200)
        self.assertEqual(len(caregiver_view.json()["results"]), 1)

    def test_a04_end_users_cannot_provision_404(self):
        _, student_user = make_class_account("HS141", "student",
                                             class_ref="10A1")
        token, _ = make_session(student_user)
        response = self._post(
            "/api/v1/classroom/admin/pairs-apply",
            {"class_ref": "10A1", "rows": [self._pair_row("PH141", "HS141")],
             "batch_ref": str(uuid.uuid4())}, token=token)
        self.assertEqual(response.status_code, 404)
        listing = self.client.get(
            "/api/v1/classroom/admin/classes", **auth_header(token))
        self.assertEqual(listing.status_code, 404)

    def test_a05_out_of_scope_admin_cannot_read_or_provision_other_class(self):
        make_class_account("HS150", "student", class_ref="10B1")
        make_class_account("PH150", "caregiver", class_ref="10B1")
        _, scoped_admin = make_class_account("ADM03", "caregiver",
                                             class_ref="10A1")
        self._grant(scoped_admin, scope_type="school", scope_ref="10A1")
        token, _ = make_session(scoped_admin)
        # Doc lop ngoai pham vi → 403 class_out_of_scope
        preview = self._post(
            "/api/v1/classroom/admin/pairs-preview",
            {"class_ref": "10B1",
             "rows": [self._pair_row("PH150", "HS150")]}, token=token)
        self.assertEqual(preview.status_code, 403)
        self.assertEqual(
            preview.json()["error"]["code"], "not_authorized")
        inventory = self.client.get(
            "/api/v1/classroom/admin/backfill-inventory?class_ref=10B1",
            **auth_header(token))
        self.assertEqual(inventory.status_code, 403)
        # Lop dung pham vi → 200; row tro den tai khoan lop khac → bao
        # account_out_of_scope o hang (khong ghi).
        ok_preview = self._post(
            "/api/v1/classroom/admin/pairs-preview",
            {"class_ref": "10A1",
             "rows": [self._pair_row("PH150", "HS150")]}, token=token)
        self.assertEqual(ok_preview.status_code, 200)
        self.assertEqual(ok_preview.json()["rows"][0]["status"], "error")
        self.assertIn("account_out_of_scope",
                      ok_preview.json()["rows"][0]["problems"][0])
        # Chi thay lop trong pham vi grant
        classes_view = self.client.get(
            "/api/v1/classroom/admin/classes", **auth_header(token))
        self.assertEqual(classes_view.status_code, 200)
        refs = [c["class_ref"] for c in classes_view.json()["results"]]
        self.assertEqual(refs, ["10A1"])

    def test_a12_unknown_field_and_bad_batch_ref_rejected(self):
        response = self._post("/api/v1/classroom/admin/pairs-apply", {
            "class_ref": "10A1", "rows": [], "batch_ref": "not-a-uuid",
            "hacker_field": "x"})
        self.assertEqual(response.status_code, 400)

    def test_backfill_api_round_trip(self):
        hs, _ = make_class_account("HS160", "student", class_ref="10A1")
        ph, _ = make_class_account("PH160", "caregiver", class_ref="10A1")
        make_proposal(hs, ph)
        inventory = self.client.get(
            "/api/v1/classroom/admin/backfill-inventory?class_ref=10A1",
            **auth_header(self.admin_token))
        self.assertEqual(inventory.status_code, 200)
        self.assertEqual(
            inventory.json()["proposals"]["eligible_pending"], 1)
        apply = self._post("/api/v1/classroom/admin/backfill-apply", {
            "class_ref": "10A1", "batch_ref": str(uuid.uuid4())})
        self.assertEqual(apply.status_code, 200)
        self.assertEqual(apply.json()["activated"], 1)
        self.assertEqual(
            Connection.objects.filter(status=CONNECTION_ACTIVE).count(), 1)
