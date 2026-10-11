"""TEST-ONLY doubles for F05: connection reader, reply-context validator,
quick reply templates."""

from labgrants.models import GrantRow, TestConnection


class TestConnectionReader:
    def active_connection_between(self, *, user_a: str, user_b: str):
        low, high = sorted([str(user_a), str(user_b)])
        row = TestConnection.objects.filter(
            party_low_id=low, party_high_id=high, status="active").first()
        if row is None:
            return None

        class View:
            pass

        view = View()
        view.connection_id = str(row.id)
        view.party_a = row.party_low_id
        view.party_b = row.party_high_id
        view.relationship_kind = row.relationship_kind
        view.status = row.status
        view.generation = row.generation
        view.revision = 1
        return view

    def get_connection(self, *, connection_id: str):
        return None

    def list_active_for_user(self, *, user_id: str):
        return []


def _uid(value) -> str:
    return str(getattr(value, "pk", value))


def make_test_connection(user_a, user_b, relationship_kind="primary",
                         generation=1):
    low, high = sorted([_uid(user_a), _uid(user_b)])
    return TestConnection.objects.create(
        party_low_id=low, party_high_id=high,
        relationship_kind=relationship_kind, generation=generation)


def validate_reply_context(*, owner_id: str, item_id: str, recipient_id: str,
                           revision: int, item_type: str) -> bool:
    return GrantRow.objects.filter(
        owner_id=_uid(owner_id), item_id=item_id,
        recipient_id=_uid(recipient_id),
        approved_revision=int(revision), item_type=item_type,
        revoked_at__isnull=True).exists()


class TestQuickReplyProvider:
    TEMPLATES = [
        {"code": "qr_read", "text": "Bố mẹ đã đọc rồi, cảm ơn con đã nói.",
         "audience": "caregiver"},
        {"code": "qr_want_to_listen", "text": "Bố mẹ muốn nghe con nói thêm.",
         "audience": "caregiver"},
        {"code": "qr_time", "text": "Mình nói chuyện lúc 8 giờ tối nhé?",
         "audience": "neutral"},
        {"code": "qr_thanks", "text": "Cảm ơn con đã chia sẻ với bố mẹ.",
         "audience": "caregiver"},
        {"code": "qr_child_share", "text": "Con muốn kể thêm chút nhé.",
         "audience": "student"},
    ]

    def list_templates(self, *, audience: str | None = None):
        if not audience:
            return self.TEMPLATES
        return [t for t in self.TEMPLATES
                if t["audience"] in (audience, "neutral")]
