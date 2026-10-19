"""Script tạo tài khoản học sinh, phụ huynh và dữ liệu mẫu kiểm thử F10-F13."""
import os
import sys
import uuid
import datetime as dt

if os.environ.get("RENDER") or os.environ.get("DJANGO_ENV") == "production":
    raise RuntimeError(
        "CRITICAL: create_test_student.py is strictly restricted to local development/test. "
        "Execution on production/Render is forbidden."
    )

# Set Django settings
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
os.environ.setdefault("DB_ENGINE", "sqlite")
os.environ.setdefault("DJANGO_ENV", "development")

# Add backend and packages to sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(BASE_DIR, "backend"))
sys.path.insert(0, os.path.join(BASE_DIR, "packages"))

import django
django.setup()

from django.contrib.auth import get_user_model
from django.utils import timezone
from family_bridge_core.timeutils import UTC

User = get_user_model()
from family_bridge_features.f16_classroom.models import ClassAccount
from family_bridge_features.f01_identity.models import (
    ConsentRecord, Connection, CONNECTION_ACTIVE, CONNECTION_SOURCE_ADMIN,
    RELATIONSHIP_PRIMARY, RELATIONSHIP_BACKUP,
)
from family_bridge_features.f11_supporters.models import SupporterRole, STATUS_ACTIVE, KIND_TEACHER

def run():
    now = dt.datetime.now(tz=UTC)
    print("=== TẠO TÀI KHOẢN HỌC SINH & DỮ LIỆU KIỂM THỬ ===")

    # 1. Tạo tài khoản Học sinh
    hs_user, created = User.objects.get_or_create(username="hs_an")
    hs_user.first_name = "Em An"
    hs_user.set_password("HocSinh@2026")
    hs_user.is_active = True
    hs_user.save()

    hs_acc, _ = ClassAccount.objects.get_or_create(
        user=hs_user,
        defaults={
            "login_code": "HS001",
            "role": "student",
            "class_ref": "LOP10A1",
            "external_ref": "ext_hs_an_10a1",
        }
    )
    if hs_acc.login_code != "HS001":
        hs_acc.login_code = "HS001"
        hs_acc.save()

    # Pre-record consent cho học sinh
    ConsentRecord.objects.get_or_create(
        user=hs_user,
        purpose="service",
        defaults={"policy_version": "service-v1", "decision": "accepted", "recorded_at": now}
    )
    ConsentRecord.objects.get_or_create(
        user=hs_user,
        purpose="ai_processing",
        defaults={"policy_version": "ai_processing-v1", "decision": "accepted", "recorded_at": now}
    )

    print(f"-> Học sinh: Username={hs_user.username}, Mã={hs_acc.login_code}, Mật khẩu=HocSinh@2026, ID={hs_user.id}")

    # 2. Tạo tài khoản Phụ huynh (để HS có thể gửi tín hiệu F10)
    ph_user, created = User.objects.get_or_create(username="ph_lan")
    ph_user.first_name = "Mẹ Lan"
    ph_user.set_password("PhuHuynh@2026")
    ph_user.is_active = True
    ph_user.save()

    ph_acc, _ = ClassAccount.objects.get_or_create(
        user=ph_user,
        defaults={
            "login_code": "PH001",
            "role": "caregiver",
            "class_ref": "LOP10A1",
            "external_ref": "ext_ph_lan_10a1",
        }
    )

    ConsentRecord.objects.get_or_create(
        user=ph_user,
        purpose="service",
        defaults={"policy_version": "service-v1", "decision": "accepted", "recorded_at": now}
    )

    print(f"-> Phụ huynh: Username={ph_user.username}, Mã={ph_acc.login_code}, Mật khẩu=PhuHuynh@2026, ID={ph_user.id}")

    # 3. Tạo Kết nối (Connection) giữa Học sinh và Phụ huynh
    p_low, p_high = (hs_user, ph_user) if str(hs_user.id) < str(ph_user.id) else (ph_user, hs_user)
    conn, _ = Connection.objects.get_or_create(
        party_low=p_low,
        party_high=p_high,
        defaults={
            "relationship_kind": RELATIONSHIP_PRIMARY,
            "source": CONNECTION_SOURCE_ADMIN,
            "status": CONNECTION_ACTIVE,
            "generation": 1,
            "revision": 1,
            "created_at": now,
        }
    )
    if conn.status != CONNECTION_ACTIVE:
        conn.status = CONNECTION_ACTIVE
        conn.save()

    print(f"-> Kết nối gia đình HS-PH: ID={conn.id}, Status={conn.status}")

    # 4. Tạo Giáo viên làm Điểm tựa (F11)
    gv_user, _ = User.objects.get_or_create(username="gv_mai")
    gv_user.first_name = "Cô Mai (Tư vấn)"
    gv_user.set_password("GiaoVien@2026")
    gv_user.is_active = True
    gv_user.save()

    gv_acc, _ = ClassAccount.objects.get_or_create(
        user=gv_user,
        defaults={
            "login_code": "GV001",
            "role": "caregiver",
            "class_ref": "LOP10A1",
            "external_ref": "ext_gv_mai_10a1",
        }
    )

    # Kết nối HS - GV
    p_low_gv, p_high_gv = (hs_user, gv_user) if str(hs_user.id) < str(gv_user.id) else (gv_user, hs_user)
    conn_gv, _ = Connection.objects.get_or_create(
        party_low=p_low_gv,
        party_high=p_high_gv,
        defaults={
            "relationship_kind": RELATIONSHIP_BACKUP,
            "source": CONNECTION_SOURCE_ADMIN,
            "status": CONNECTION_ACTIVE,
            "generation": 1,
            "revision": 1,
            "created_at": now,
        }
    )

    # Vai trò điểm tựa F11
    sup_role, _ = SupporterRole.objects.get_or_create(
        student=hs_user,
        supporter=gv_user,
        defaults={
            "relationship_kind": KIND_TEACHER,
            "status": STATUS_ACTIVE,
            "invited_at": now,
            "responded_at": now,
            "expires_at": now + dt.timedelta(days=90),
        }
    )
    if sup_role.status != STATUS_ACTIVE:
        sup_role.status = STATUS_ACTIVE
        sup_role.expires_at = now + dt.timedelta(days=90)
        sup_role.save()

    print(f"-> Điểm tựa dự phòng (F11): Cô Mai ({gv_user.id}), Status={sup_role.status}")
    print("=== HOÀN TẤT KHỞI TẠO ===")

if __name__ == "__main__":
    run()
