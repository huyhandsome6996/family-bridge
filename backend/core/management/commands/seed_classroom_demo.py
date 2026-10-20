"""Management command to seed demo counselor/handlers for F12 appointment operations."""

import os
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from family_bridge_features.admin_core.models import (
    AdminCapabilityGrant, CAP_APPOINTMENT_HANDLE, CAP_APPOINTMENT_ASSIGN, SCOPE_GLOBAL,
)
from family_bridge_features.f16_classroom.models import ClassAccount, ROLE_CAREGIVER


class Command(BaseCommand):
    help = "Seed demo counselor account with appointment handler capabilities (idempotent)."

    def handle(self, *args, **options):
        User = get_user_model()
        initial_password = os.environ.get("FB_CLASS_INITIAL_PASSWORD", "FamilyBridge@2026")

        user, _ = User.objects.get_or_create(
            username="GV001",
            defaults={
                "email": "counselor.demo@familybridge.local",
                "first_name": "Thầy/Cô Phụ trách",
                "last_name": "Tham vấn Học đường",
                "is_active": True,
            },
        )
        user.set_password(initial_password)
        user.save()

        ClassAccount.objects.get_or_create(
            user=user,
            defaults={
                "login_code": "GV001",
                "role": ROLE_CAREGIVER,
                "class_ref": "DEMO",
                "external_ref": "gv-001",
            },
        )

        for cap in (CAP_APPOINTMENT_HANDLE, CAP_APPOINTMENT_ASSIGN):
            AdminCapabilityGrant.objects.get_or_create(
                user=user,
                capability=cap,
                scope_type=SCOPE_GLOBAL,
                scope_ref="",
                revoked_at__isnull=True,
                defaults={
                    "granted_by": "system_bootstrap",
                },
            )

        self.stdout.write(
            self.style.SUCCESS("Đã khởi tạo thành công tài khoản GV001 với quyền tiếp nhận lịch hẹn (F12).")
        )
