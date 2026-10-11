"""TEST-ONLY grant provider + deletion hooks implementing F15 contracts."""

from labgrants.models import GrantRow


class GrantProvider:
    """Implements list_grants / revoke_grant / can_view for one item_type."""

    def __init__(self, item_type: str) -> None:
        self.item_type = item_type

    def list_grants(self, *, owner_id: str):
        return [{
            "item_id": str(row.item_id),
            "recipient_id": row.recipient_id,
            "approved_revision": row.approved_revision,
            "revoked": not row.active,
        } for row in GrantRow.objects.filter(owner_id=str(owner_id),
                                             item_type=self.item_type)
            .order_by("created_at")[:50]]

    def revoke_grant(self, *, owner_id: str, item_id: str,
                     recipient_id: str | None):
        import datetime as _dt
        from family_bridge_core.timeutils import UTC
        rows = GrantRow.objects.filter(owner_id=str(owner_id),
                                       item_type=self.item_type,
                                       item_id=item_id)
        if recipient_id:
            rows = rows.filter(recipient_id=recipient_id)
        found = rows.exists()
        rows.filter(revoked_at__isnull=True).update(
            revoked_at=_dt.datetime.now(tz=UTC))
        return {"found": bool(found), "revoked": bool(found)}

    def can_view(self, *, owner_id: str, item_id: str, recipient_id: str,
                 revision: int) -> bool:
        return GrantRow.objects.filter(
            owner_id=str(owner_id), item_type=self.item_type,
            item_id=item_id, recipient_id=str(recipient_id),
            approved_revision=int(revision), revoked_at__isnull=True).exists()


mood_entry_provider = GrantProvider("mood_entry")
journal_page_provider = GrantProvider("journal_page")


class MoodDeletionHook:
    def apply_user_deletion(self, *, user_id: str, requested_at):
        from labgrants.models import GrantRow
        count, _ = GrantRow.objects.filter(owner_id=str(user_id),
                                           item_type="mood_entry").delete()
        return {"ok": True, "detail": f"removed {count} mood grants (test hook)"}


class JournalDeletionHook:
    def apply_user_deletion(self, *, user_id: str, requested_at):
        from labgrants.models import GrantRow
        count, _ = GrantRow.objects.filter(owner_id=str(user_id),
                                           item_type="journal_page").delete()
        return {"ok": True, "detail": f"removed {count} journal grants (test hook)"}


class FailingHook:
    def apply_user_deletion(self, *, user_id: str, requested_at):
        return {"ok": False, "detail": "simulated provider failure"}
