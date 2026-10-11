"""TEST-ONLY grant model app (harness). Demonstrates the F15 grant provider
contract with a mood-share-like table. Not production: real grant tables are
owned by F07 (MoodShare) / F08 (JournalShare) at integration."""

import datetime as dt
import hashlib
import uuid

from django.conf import settings
from django.db import models

from family_bridge_core.timeutils import UTC


def _utc_now() -> dt.datetime:
    return dt.datetime.now(tz=UTC)


class GrantRow(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    item_type = models.CharField(max_length=32)   # mood_entry | journal_page
    item_id = models.UUIDField()
    owner_id = models.CharField(max_length=64)
    recipient_id = models.CharField(max_length=64)
    approved_revision = models.PositiveIntegerField()
    connection_generation = models.PositiveIntegerField(default=1)
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=_utc_now)

    class Meta:
        app_label = "labgrants"
        constraints = [
            models.UniqueConstraint(fields=["item_type", "item_id", "recipient_id"],
                                    name="uniq_grant_item_recipient"),
        ]
        indexes = [models.Index(fields=["owner_id", "item_type"])]

    @property
    def active(self) -> bool:
        return self.revoked_at is None


class TestSession(models.Model):
    """TEST-ONLY standalone session store for feature branches without F01."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    token_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = "labgrants"


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
