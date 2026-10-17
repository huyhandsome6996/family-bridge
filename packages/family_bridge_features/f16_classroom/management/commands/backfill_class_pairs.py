"""Lenh quan tri: nap/doi cac cap HS-PH DANG CHO thanh ket noi ACTIVE.

Dung cho chuyen doi bo du lieu mau hien co (100 tai khoan lop, 50 cap
proposal con mo) thanh ket noi active dung quan he — theo quyet dinh cua
Huy ngay 18/10/2026 (supersede menh de "hai ben tu xac nhan" cho dung pham
vi cap phat lop hoc; luong loi moi tu nguyen giu nguyen).

Nguyen tac:
- Doc-only truoc: khong co --apply → CHAY KHO (inventory + du kien, khong
  ghi gi). Lenh khong bao gio UPDATE toan bo bang; chi cap proposal CON MO
  va ca hai tai khoan con active moi duoc chuyen.
- Idempotent theo --batch-ref (bat buoc khi apply): chay lai cung batch →
  tra ket qua da luu, khong nhan doi.
- Cap da revoke/unlink → KHONG tu hoi sinh (bao o blocked_pairs).
- KHONG can mat khau: tai khoan da ton tai, khong doi mat khau/ma/ten.
- Khong bao gio in mat khau/token (SEC-22); in ma dang nhap + ten goi la
  du thong tin cho admin kiem tra.

Vi du:
  python manage.py backfill_class_pairs --json                    # kho toan DB (trong scope)
  python manage.py backfill_class_pairs --class-ref 10A1 --json   # kho 1 lop
  FB_ADMIN_PROVISION_BATCH_REF=<uuid> python manage.py backfill_class_pairs \
      --batch-ref-env FB_ADMIN_PROVISION_BATCH_REF --apply --json
"""

import os
import sys
import uuid

from django.core.management.base import BaseCommand

from family_bridge_features.f16_classroom.services import admin_provision


class Command(BaseCommand):
    help = ("Xem kho (inventory) va chuyen doi cac cap HS-PH DANG CHO "
            "thanh ket noi ACTIVE (admin-provisioned pairs).")

    def add_arguments(self, parser):
        parser.add_argument("--class-ref", default=None,
                            help="Gioi han mot lop (mac dinh: toan bo lop "
                                 "trong pham vi grant cua admin).")
        parser.add_argument("--admin-user-id", default=None,
                            help="UUID user cua admin actor (de ghi provenance "
                                 "source_admin). Bo qua neu dung --admin-code.")
        parser.add_argument("--admin-code", default=None,
                            help="Ma dang nhap lop cua admin (tim user tu "
                                 "ClassAccount).")
        parser.add_argument("--batch-ref", default=None,
                            help="Idempotency key (UUID) cua dot chuyen doi.")
        parser.add_argument("--batch-ref-env", default=None,
                            help="Doc batch_ref tu bien moi truong (khong dua "
                                 "gia tri vao argv/audit).")
        parser.add_argument("--apply", action="store_true",
                            help="THUC SU ghi (mac dinh chi kho/dry-run).")
        parser.add_argument("--json", action="store_true",
                            help="In ket qua JSON thay vi tom tat dang chu.")

    def handle(self, *args, **options):
        admin = self._resolve_admin(options)
        class_ref = options.get("class_ref")
        if class_ref:
            admin_provision.require_class_scope(admin, class_ref=class_ref)

        if not options["apply"]:
            inventory = admin_provision.backfill_inventory(
                admin, class_ref=class_ref)
            if options["json"]:
                self.stdout.write(self._dump(inventory))
                return
            self._print_inventory(inventory, apply_mode=False)
            return

        batch_ref = self._resolve_batch_ref(options)
        summary = admin_provision.backfill_apply(
            admin, batch_ref=batch_ref, class_ref=class_ref)
        if options["json"]:
            self.stdout.write(self._dump(summary))
        else:
            self._print_summary(summary)
        if not summary.get("ok", False) or summary.get("errors"):
            sys.exit(2)

    def _resolve_admin(self, options):
        from django.contrib.auth import get_user_model
        from ..models import ClassAccount
        from family_bridge_core.errors import NotFound

        User = get_user_model()
        admin_user_id = options.get("admin_user_id")
        admin_code = options.get("admin_code")
        if admin_user_id:
            user = User.objects.filter(pk=admin_user_id).first()
            if user is None:
                sys.exit(2)
            return user
        if admin_code:
            account = (ClassAccount.objects.select_related("user")
                       .filter(login_code=str(admin_code).strip().upper())
                       .first())
            if account is None:
                sys.exit(2)
            return account.user
        raise SystemExit(
            "Can --admin-user-id hoac --admin-code de xac dinh admin actor.")

    def _resolve_batch_ref(self, options) -> str:
        batch_ref = options.get("batch_ref")
        env_name = options.get("batch_ref_env")
        if env_name:
            batch_ref = os.environ.get(env_name) or batch_ref
        if not batch_ref:
            raise SystemExit(
                "Apply can --batch-ref hoac --batch-ref-env (idempotency key).")
        batch_ref = str(batch_ref).strip()
        try:
            return str(uuid.UUID(batch_ref))
        except ValueError:
            raise SystemExit("--batch-ref phai la UUID hop le.") from None

    def _dump(self, data) -> str:
        import json
        return json.dumps(data, ensure_ascii=False, indent=2, default=str)

    def _print_inventory(self, inventory, *, apply_mode: bool) -> None:
        accounts = inventory["accounts"]
        self.stdout.write(
            f"[F16] Kho cap dang cho — che do: "
            f"{'APPLY' if apply_mode else 'KHO (khong ghi)'}")
        self.stdout.write(
            f"  Tai khoan: {accounts['total']} "
            f"(HS {accounts['students']}, PH {accounts['caregivers']})")
        self.stdout.write(
            f"  Cap du dieu kien cho chuyen doi: "
            f"{inventory['proposals']['eligible_pending']}")
        self.stdout.write(
            f"  Cap bi chan (tai khoan bi khoa/da revoke): "
            f"{inventory['proposals']['blocked']}")
        self.stdout.write(
            f"  Cap da active truoc do: {inventory['already_active_pairs']}")
        for entry in inventory["eligible_pairs"][:20]:
            self.stdout.write(
                f"    - {entry['caregiver_code']} <-> {entry['student_code']}"
                f" ({entry['caregiver_name']} <-> {entry['student_name']})")
        if len(inventory["eligible_pairs"]) > 20:
            self.stdout.write(
                f"    ... va {len(inventory['eligible_pairs']) - 20} cap nua "
                f"(dung --json de xem day du)")

    def _print_summary(self, summary) -> None:
        self.stdout.write(
            f"[F16] Chuyen doi cap dang cho — activated="
            f"{summary.get('activated', 0)}, already_active="
            f"{summary.get('already_active', 0)}, blocked="
            f"{summary.get('blocked', 0)}, errors={summary.get('errors', 0)}")
        for row in summary.get("rows", [])[:20]:
            self.stdout.write(
                f"    - {row.get('caregiver_code')} <-> "
                f"{row.get('student_code')}: {row['status']}")
        if summary.get("replayed"):
            self.stdout.write("  (replay ket qua da luu — khong xu ly lai)")
