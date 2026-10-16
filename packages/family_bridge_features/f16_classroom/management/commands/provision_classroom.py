"""Lenh quan tri: nap tai khoan lop HS/PH + cap de xuat ket noi tu CSV.

KHONG BAO GIO nhan/in mat khau qua tham so dong lenh hay log. Mat khau khoi
tao doc tu bien moi truong (--initial-password-env, mac dinh
FB_CLASS_INITIAL_PASSWORD) va duoc phat cho HS/PH qua KENH RIENG (ngoai
he thong). Exit code: 0 khi OK, 2 khi co loi trong summary.
"""

from __future__ import annotations

import json
import os
import sys

from django.core.management.base import BaseCommand

from family_bridge_features.f16_classroom.services.provisioning import run_import


class Command(BaseCommand):
    help = ("Nap tai khoan lop HS/PH (CSV) va cap de xuat ket noi; idempotent "
            "theo external_ref. Mat khau khoi tao doc tu bien moi truong.")

    def add_arguments(self, parser):
        parser.add_argument("--csv", required=True,
                            help="Duong dan CSV tai khoan (header bat buoc: "
                                 "external_ref,login_code,role,class_ref,display_name)")
        parser.add_argument("--proposals-csv", default=None,
                            help="CSV cap HS/PH (student_login_code,caregiver_login_code)")
        parser.add_argument("--auto-pair-by-index", action="store_true",
                            help="Tu ghep cap theo chi so: HS{n} <-> PH{n}")
        parser.add_argument("--dry-run", action="store_true",
                            help="Chi kiem tra va bao cao, khong ghi DB")
        parser.add_argument("--json", action="store_true",
                            help="In summary JSON thay vi thong bao nguoi")
        parser.add_argument("--initial-password-env", default="FB_CLASS_INITIAL_PASSWORD",
                            help="Ten bien moi truong chua mat khau khoi tao "
                                 "(khong bao gio truyen mat khau qua argv)")

    def handle(self, *args, **options):
        dry_run = bool(options["dry_run"])
        env_name = options["initial_password_env"]
        initial_password = None
        if not dry_run:
            initial_password = os.environ.get(env_name)
            if not initial_password:
                self.stderr.write(
                    f"Loi: bien moi truong {env_name} chua duoc dat — tu choi "
                    f"ghi (fail-closed). Dat bien nay o phien dang chay, KHONG "
                    f"truyen mat khau qua dong lenh.")
                sys.exit(2)

        summary = run_import(
            csv_path=options["csv"],
            proposals_csv_path=options["proposals_csv"],
            auto_pair_by_index=bool(options["auto_pair_by_index"]),
            dry_run=dry_run,
            initial_password=initial_password,
        )

        if options["json"]:
            self.stdout.write(json.dumps(summary, ensure_ascii=False, indent=2))
        else:
            mode = "dry-run (khong ghi)" if dry_run else "apply"
            self.stdout.write(f"[F16] nap tai khoan lop — che do: {mode}")
            self.stdout.write(
                f"  Tai khoan: {summary['accounts_rows']} dong; "
                f"tao {summary['accounts_created']}; "
                f"da ton tai {summary['accounts_existing']}; "
                f"lech du lieu {summary['accounts_drifted']}.")
            if dry_run:
                self.stdout.write(
                    f"  Du kien tao (dry-run): {summary['accounts_to_create']} "
                    f"tai khoan, {summary['proposals_to_create']} cap de xuat.")
            self.stdout.write(
                f"  De xuat ket noi: {summary['proposals_rows']} cap; "
                f"tao {summary['proposals_created']}; "
                f"bo qua (da co) {summary['proposals_skipped_existing']}.")
            if summary["errors"]:
                self.stderr.write(f"  Loi: {len(summary['errors'])}")
                for error in summary["errors"][:20]:
                    self.stderr.write(f"   - {error}")
                if len(summary["errors"]) > 20:
                    self.stderr.write(
                        f"   ... va {len(summary['errors']) - 20} loi khac")
            else:
                self.stdout.write("  Khong co loi.")

        if summary["errors"] or not summary["ok"]:
            sys.exit(2)
