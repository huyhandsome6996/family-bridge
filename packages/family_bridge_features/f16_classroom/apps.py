from django.apps import AppConfig


class F16ClassroomConfig(AppConfig):
    name = "family_bridge_features.f16_classroom"
    label = "f16_classroom"
    verbose_name = "F16 Dang nhap lop HS/PH va de xuat ket noi"

    def ready(self) -> None:
        """Dang ky deletion hook vao co che cua F15 (category co san).

        f15 khong co trong build (test standalone f16) → bo qua im lang;
        khong bao gio lam chet khoi dong app vi thanh ghi hook.
        """
        try:
            from family_bridge_features.f15_privacy.services import (
                registry as grant_registry,
            )
        except ImportError:
            return
        base = "family_bridge_features.f16_classroom.services.deletion"
        registrations = (
            ("account", f"{base}.ClassroomAccountDeletionHook"),
            ("connections", f"{base}.ConnectionProposalDeletionHook"),
        )
        for category, dotted in registrations:
            try:
                grant_registry.register_deletion_hook(category, dotted)
            except (ValueError, ImportError):
                continue  # category khong ton tai/loi import: khong fake OK
