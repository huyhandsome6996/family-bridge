"""F07 local fixtures — SYNTHETIC accounts cho E2E cục bộ (KHÔNG dữ liệu
người thật). Tạo từ đầu theo external_ref riêng, idempotent: chạy lại chỉ
đảm bảo tồn tại, không đụng tài khoản khác.

Tạo:
- HS "HSZE2E01" / PH "PHZE2E01" (cặp admin_provisioned, Connection ACTIVE
  invite NULL theo CAP-23) + HS "HSZE2E99" (người lạ, không kết nối).
- Mật khẩu riêng của fixture, không ghi vào repo tài liệu ngoài file này.

Chạy từ repo root với backend settings:
  cd backend && DJANGO_ENV=development DB_ENGINE=sqlite \
    DJANGO_SETTINGS_MODULE=config.settings python \
    ../scripts/f07_local_fixtures.py
"""

from __future__ import annotations

import datetime as dt
import os
import sys

FIXTURE_PASSWORD = "E2e-local-2026!"
CLASS_REF = "F07-E2E"


def main() -> int:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    os.environ.setdefault("DJANGO_ENV", "development")
    os.environ.setdefault("DB_ENGINE", "sqlite")
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "packages"))
    import django
    django.setup()

    from django.contrib.auth import get_user_model
    from django.db import transaction

    from family_bridge_features.f01_identity.models import Connection
    from family_bridge_features.f16_classroom.models import ClassAccount

    User = get_user_model()

    def ensure_actor(code: str, role: str, first_name: str):
        account = ClassAccount.objects.filter(login_code=code).first()
        if account:
            return account.user
        with transaction.atomic():
            user = User.objects.create_user(
                username=f"e2e-{code.lower()}",
                first_name=first_name,
                password=FIXTURE_PASSWORD,
            )
            ClassAccount.objects.create(
                user=user, login_code=code, role=role,
                class_ref=CLASS_REF, external_ref=f"e2e:{code}",
            )
        return user

    student = ensure_actor("HSZE2E01", "student", "Lan (E2E)")
    caregiver = ensure_actor("PHZE2E01", "caregiver", "Mẹ Lan (E2E)")
    stranger = ensure_actor("HSZE2E99", "student", "Bạn lạ (E2E)")

    # Reset trạng thái dữ liệu mood CỦA CHÍNH fixture E2E để luồng E2E chạy
    # lại được từ đầu (chỉ đụng dữ liệu synthetic của 3 tài khoản e2e:*).
    from family_bridge_features.f07_mood.models import MoodEntry, MoodShare
    e2e_ids = [str(student.pk), str(caregiver.pk), str(stranger.pk)]
    deleted_entries, _ = MoodEntry.objects.filter(
        owner_id__in=e2e_ids).delete()
    deleted_received = MoodShare.objects.filter(
        recipient_id__in=e2e_ids).update(
        revoked_at=dt.datetime.now(dt.timezone.utc))
    if deleted_entries or deleted_received:
        print(f"Đã reset dữ liệu mood fixture (entries={deleted_entries}).")

    low, high = sorted([str(student.pk), str(caregiver.pk)])
    connection = Connection.objects.filter(
        party_low_id=low, party_high_id=high, status="active").first()
    if connection is None:
        revoked = Connection.objects.filter(
            party_low_id=low, party_high_id=high).order_by("-generation").first()
        Connection.objects.create(
            party_low_id=low, party_high_id=high,
            relationship_kind="primary", invite=None,
            source="admin_provisioned", source_admin="f07-local-e2e",
            status="active",
            generation=(revoked.generation + 1) if revoked else 1)
        print("Đã tạo Connection admin_provisioned (invite NULL).")
    else:
        print("Connection đã tồn tại — giữ nguyên.")
    print(f"Fixture OK: HSZE2E01 / PHZE2E01 / HSZE2E99, mật khẩu fixture: {FIXTURE_PASSWORD}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
