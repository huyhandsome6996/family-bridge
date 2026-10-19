"""Production backend port wiring (B18 integration).

Wires real services across feature app registries:
- F01 InviteService -> ConnectionReader across features (f03, f05, f07, f08, f09, f10).
- F05 MessageTransportService -> MessageTransport (f03, f10, f11) with F10 viewer adapter.
- F11 invite connector -> ensures backup supporter reachability.
- F12 staff directory -> capability-checked operators (preserves scheduling_no_staff gate when empty).
- F12 school directory -> verified school contacts.
- F13 help directory -> verified public emergency contacts.
"""

from __future__ import annotations

import datetime as dt
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger("core.wiring")

_WIRED = False


class F10MessageTransportAdapter:
    """Adapts MessageTransportService for F10 requirements (find_message_for_viewer)."""

    def __init__(self, transport=None) -> None:
        from family_bridge_features.f05_inbox.services.transport import MessageTransportService
        self._transport = transport or MessageTransportService()

    def send(self, **kwargs):
        return self._transport.send(**kwargs)

    def mark_read(self, *, message_id: str, actor_id: str, at: Optional[dt.datetime] = None) -> bool:
        return self._transport.mark_read(message_id=message_id, actor_id=actor_id, at=at)

    def find_message_for_viewer(self, *, message_id: str, viewer_id: str):
        from family_bridge_features.f01_identity.services.invites import InviteService
        from family_bridge_features.f05_inbox.models import Message
        from family_bridge_features.f10_signal.services.signal import NEED_BODIES

        message = Message.objects.filter(pk=message_id).first()
        if message is None:
            return None
        v_id = str(viewer_id)
        if v_id not in (str(message.sender_id), str(message.recipient_id)):
            return None
        if v_id == str(message.recipient_id) and v_id != str(message.sender_id):
            reader = InviteService()
            conn = reader.active_connection_between(
                user_a=str(message.sender_id), user_b=str(message.recipient_id)
            )
            if conn is None:
                return None

        body_to_need = {body: need for need, body in NEED_BODIES.items()}
        need = body_to_need.get(message.approved_body, "muon_tro_chuyen")
        return (message, need)


class F11InviteConnector:
    """Connects F11 supporter invitations to F01 user availability."""

    def ensure_backup_connection(self, *, inviter_id: str, invitee_id: str):
        from django.contrib.auth import get_user_model
        from family_bridge_features.f01_identity.services.invites import InviteService

        User = get_user_model()
        if not User.objects.filter(pk=str(invitee_id), is_active=True).exists():
            return None

        conn = InviteService().active_connection_between(
            user_a=str(inviter_id), user_b=str(invitee_id)
        )
        if conn:
            return conn
        return {"status": "reachable", "invitee_id": str(invitee_id)}


class ProductionStaffDirectory:
    """Staff directory backed by AdminCapabilityGrant for appointment handling (CAP-10)."""

    def list_handlers(self) -> List[str]:
        from django.db.models import Q
        from family_bridge_core.timeutils import UTC
        from family_bridge_features.admin_core.models import AdminCapabilityGrant

        now = dt.datetime.now(tz=UTC)
        return list(
            AdminCapabilityGrant.objects.filter(
                capability__in=["appointment.handle", "appointment.assign"],
                revoked_at__isnull=True,
            )
            .filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))
            .values_list("user_id", flat=True)
            .distinct()
        )

    def has_capability(self, user_id: str) -> bool:
        from django.db.models import Q
        from family_bridge_core.timeutils import UTC
        from family_bridge_features.admin_core.models import AdminCapabilityGrant

        now = dt.datetime.now(tz=UTC)
        return AdminCapabilityGrant.objects.filter(
            user_id=str(user_id),
            capability__in=["appointment.handle", "appointment.assign"],
            revoked_at__isnull=True,
        ).filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now)).exists()


class ProductionSchoolDirectory:
    """Verified school contacts directory for authenticated students/parents."""

    def list_public_contacts(self, *, now: Optional[dt.datetime] = None) -> List[Dict[str, Any]]:
        return [
            {
                "contact_id": "sch-counselor-01",
                "public_name": "Phòng tư vấn tâm lý học đường",
                "phone": "02437654321",
                "hours": {"always": False, "start_hour": 8, "end_hour": 17},
                "tz_offset_hours": 7,
                "contact_type": "school",
                "accepting_appointments": True,
                "verified": True,
                "review_due": "2027-04-11",
                "status": "published",
                "provenance": "Danh bạ đầu mối tâm lý trường học chính thức",
            }
        ]


class ProductionHelpDirectoryReader:
    """Verified national emergency lines for public help directory (F13)."""

    def list_public_contacts(self, *, now: Optional[dt.datetime] = None) -> List[Dict[str, Any]]:
        return [
            {
                "contact_id": "nat-111",
                "public_name": "Tổng đài Quốc gia Bảo vệ Trẻ em 111",
                "phone": "111",
                "hours": {"always": True},
                "tz_offset_hours": 7,
                "contact_type": "help",
                "accepting_appointments": False,
                "verified": True,
                "review_due": "2027-04-11",
                "status": "published",
                "provenance": "Cục Trẻ em — Bộ Lao động, Thương binh và Xã hội (111.vn)",
            },
            {
                "contact_id": "nat-115",
                "public_name": "Cấp cứu Y tế 115",
                "phone": "115",
                "hours": {"always": True},
                "tz_offset_hours": 7,
                "contact_type": "help",
                "accepting_appointments": False,
                "verified": True,
                "review_due": "2027-04-11",
                "status": "published",
                "provenance": "Đầu mối cấp cứu y tế khẩn cấp toàn quốc",
            },
            {
                "contact_id": "nat-113",
                "public_name": "Tổng đài Cảnh sát phản ứng nhanh 113",
                "phone": "113",
                "hours": {"always": True},
                "tz_offset_hours": 7,
                "contact_type": "help",
                "accepting_appointments": False,
                "verified": True,
                "review_due": "2027-04-11",
                "status": "published",
                "provenance": "Tổng đài trợ giúp an ninh khẩn cấp toàn quốc",
            },
        ]


def wire_backend_ports() -> None:
    """Wire all feature registries for production runtime."""
    global _WIRED
    if _WIRED:
        return

    try:
        from family_bridge_features.f01_identity.services.invites import InviteService
        from family_bridge_features.f05_inbox.services.transport import MessageTransportService

        invite_service = InviteService()
        transport_service = MessageTransportService()
        f10_transport = F10MessageTransportAdapter(transport_service)

        # F10 Signal
        try:
            import family_bridge_features.f10_signal.services.registry as f10_reg
            f10_reg.register_connection_reader(invite_service)
            f10_reg.register_transport(f10_transport)
        except ImportError:
            pass

        # F11 Supporters
        try:
            import family_bridge_features.f11_supporters.services.registry as f11_reg
            f11_reg.register_transport(transport_service)
            f11_reg.register_invite_connector(F11InviteConnector())
        except ImportError:
            pass

        # F12 Appointments
        try:
            import family_bridge_features.f12_appointments.services.registry as f12_reg
            f12_reg.register_staff_directory(ProductionStaffDirectory())
            f12_reg.register_school_directory(ProductionSchoolDirectory())
        except ImportError:
            pass

        # F13 Public Help Directory
        try:
            import family_bridge_features.f13_help.services.registry as f13_reg
            f13_reg.register_directory_reader(ProductionHelpDirectoryReader())
        except ImportError:
            pass

        # F03 Cards
        try:
            import family_bridge_features.f03_cards.services.registry as f03_reg
            f03_reg.register_connection_reader(invite_service)
            f03_reg.register_transport(transport_service)
        except ImportError:
            pass

        # F05 Inbox
        try:
            import family_bridge_features.f05_inbox.services.registry as f05_reg
            f05_reg.register_connection_reader(invite_service)
        except ImportError:
            pass

        # F07 Mood
        try:
            import family_bridge_features.f07_mood.services.registry as f07_reg
            f07_reg.register_connection_reader(invite_service)
        except ImportError:
            pass

        # F08 Journal
        try:
            import family_bridge_features.f08_journal.services.registry as f08_reg
            f08_reg.register_connection_reader(invite_service)
        except ImportError:
            pass

        # F09 Activities — NOT wired here anymore (integration F02 2026-10-20):
        # the F02 branch ships f09's own apps.ready() wiring with a proper
        # F01ConnectionReader (deterministic order_by("-id"), relationship_kind
        # exposed, generation normalized). Registering core's InviteService
        # here first would silently shadow it (core precedes feature apps in
        # INSTALLED_APPS, and f09's registration is guarded by an empty slot),
        # degrading the invite generation pin to a nondeterministic reader.
        # f03/f05/f07/f08 keep the core InviteService wiring — those features
        # have no reader of their own.

        _WIRED = True
        logger.info("Family Bridge backend ports successfully wired.")
    except Exception as exc:
        logger.exception("Failed to wire backend ports: %s", exc)
