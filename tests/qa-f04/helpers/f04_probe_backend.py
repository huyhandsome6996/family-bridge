"""A5 probe backend (F04R2-A5) — Django thật, DB sqlite EPHEMERAL trong tmp.

Dùng bởi tests/qa-f04/n03-cross-client-recipient.test.mjs và
tests/qa-f04/n06-cross-client-draft-conflict.test.mjs (node:test) theo mẫu
audit repro/ec29ab/audit_server.py, khác 3 điểm (không đổi logic domain):
  - DB sqlite đặt tại F04_PROBE_DB (tmp dir của probe, không đụng repo/DB ai);
  - port do F04_PROBE_PORT cấp (node chọn port rảnh, tránh vào cổng người khác);
  - tự migrate + provision synthetic HS/PH941-945 (lớp F04-A5-PROBE) rồi in
    một dòng `PROBE_READY {json}` ra stdout cho node đọc (mật khẩu class chỉ
    đi qua pipe, không ghi file evidence).

Provider AI: fake LOCAL_SYNTHETIC_PROVIDER giống audit_server.py (nhãn rõ).
"""
import csv
import json
import os
import secrets
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path[:0] = [
    str(REPO_ROOT / "backend"),
    str(REPO_ROOT / "packages"),
    str(REPO_ROOT),
]

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
os.environ.setdefault("DJANGO_ENV", "development")
os.environ.setdefault("DB_ENGINE", "sqlite")
os.environ.setdefault("FB_AI_ENABLED", "false")

import django  # noqa: E402

django.setup()

# Redirect sqlite ra tmp DIR (mặc định settings ghi backend/db.sqlite3 — probe
# không được tạo file thừa trong cây product).
from django.conf import settings  # noqa: E402

db_path = os.environ["F04_PROBE_DB"]
settings.DATABASES["default"]["NAME"] = db_path

from django.core.management import call_command  # noqa: E402

call_command("migrate", interactive=False, verbosity=0)

# Provider AI fake có nhãn (parity với audit repro/ec29ab/audit_server.py).
from family_bridge_features.f04_ai.services import registry  # noqa: E402


class AuditProvider:
    provider_id = "LOCAL_SYNTHETIC_PROVIDER"

    def refine(self, **kwargs):
        if "AUDIT_FORCE_OUTAGE" in kwargs["text"]:
            class Outage(Exception):
                fb_provider_reason = "provider_outage"
            raise Outage()
        return {
            "suggested_text": "AUDIT_FINAL_SUGGESTION — Tôi muốn được lắng nghe.",
            "provider_id": self.provider_id,
            "model_revision": "synthetic",
            "prompt_revision": "synthetic",
        }


registry.register_ai_provider(AuditProvider())

# Synthetic accounts HS/PH941-945 (parity prepare_browser.py của audit).
password = secrets.token_urlsafe(22)
os.environ["FB_CLASS_INITIAL_PASSWORD"] = password
tmpdir = tempfile.mkdtemp(prefix="f04-a5-probe-csv-")
accounts = Path(tmpdir) / "synthetic.csv"
with accounts.open("w", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["external_ref", "login_code", "role", "class_ref", "display_name"])
    for i in range(941, 946):
        for prefix, role in [("HS", "student"), ("PH", "caregiver")]:
            w.writerow([f"probe-f04-a5-{prefix}{i}", f"{prefix}{i}", role,
                        "F04-A5-PROBE", f"Probe {prefix}{i}"])
call_command("provision_classroom", "--csv", str(accounts),
             "--auto-pair-by-index", "--json", verbosity=0)

port = os.environ["F04_PROBE_PORT"]
print("PROBE_READY " + json.dumps({"ready": True, "port": port,
                                   "password": password, "db": db_path}),
      flush=True)

from django.core.management import execute_from_command_line  # noqa: E402

execute_from_command_line(
    ["manage.py", "runserver", f"127.0.0.1:{port}", "--noreload"])
