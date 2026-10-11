"""F08 models: JournalPage + JournalShare + JournalReply (US-016/US-031).

Invariants:
- Pages are PRIVATE by default: owner-only title/content/search/count —
  no analytics, no body logging, no teacher/admin/System Administrator path.
- Topic prompts come from published content via the prompt provider port;
  the page stores only the topic_code reference (B16 owns prompt content).
- Sharing is PER-PAGE + PER-RECIPIENT + PER-REVISION (same grant shape as
  F07/F15); editing bumps revision and auto-hides the page from recipients
  until re-shared. No history-wide share exists.
- JournalReply (song hành) is the responder's OWN reflection bound to one
  shared page: writing requires a CURRENTLY VALID grant; replies never
  become a path to read a revoked/edited page (fail closed on read).
- Deletion cascades shares and context-bound replies (no orphans); the
  apply_user_deletion hook (F15/WF-21) removes everything for a user.
"""

import datetime as dt
import uuid

from django.conf import settings
from django.db import models

from family_bridge_core.timeutils import UTC

MAX_TITLE_CHARS = 120
MAX_CONTENT_CHARS = 8000
MAX_REPLY_CHARS = 4000


def _utc_now() -> dt.datetime:
    return dt.datetime.now(tz=UTC)


class JournalPage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                              related_name="f08_journal_pages")
    topic_code = models.CharField(max_length=32, blank=True, default="")
    title = models.CharField(max_length=120, blank=True, default="")
    content = models.TextField()
    revision = models.PositiveIntegerField(default=1, editable=False)
    created_at = models.DateTimeField(default=_utc_now, editable=False)
    updated_at = models.DateTimeField(default=_utc_now, editable=False)

    class Meta:
        app_label = "f08_journal"
        indexes = [
            models.Index(fields=["owner", "updated_at", "id"]),
        ]

    def owner_view(self) -> dict:
        return {
            "page_id": str(self.id),
            "topic_code": self.topic_code or None,
            "title": self.title,
            "content": self.content,
            "revision": self.revision,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }

    def shared_view(self) -> dict:
        """Recipient view: same allowlisted fields; served ONLY through a
        valid grant read (service enforces)."""
        return self.owner_view()


class JournalShare(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    page = models.ForeignKey(JournalPage, on_delete=models.CASCADE,
                             related_name="shares")
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                              related_name="f08_journal_shares_given")
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL,
                                  on_delete=models.CASCADE,
                                  related_name="f08_journal_shares_received")
    approved_revision = models.PositiveIntegerField()
    connection_id = models.CharField(max_length=64, blank=True, default="")
    connection_generation = models.PositiveIntegerField(default=1)
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=_utc_now, editable=False)

    class Meta:
        app_label = "f08_journal"
        constraints = [
            models.UniqueConstraint(
                fields=["page", "recipient", "approved_revision"],
                name="uniq_f08_page_recipient_revision"),
        ]
        indexes = [
            models.Index(fields=["recipient", "created_at"]),
            models.Index(fields=["owner", "created_at"]),
        ]

    def grant_view(self) -> dict:
        return {
            "share_id": str(self.id),
            "page_id": str(self.page_id),
            "recipient_id": str(self.recipient_id),
            "owner_id": str(self.owner_id),
            "approved_revision": self.approved_revision,
            "revoked": self.revoked_at is not None,
            "created_at": self.created_at.isoformat(),
        }


class JournalReply(models.Model):
    """Song hành: responder's reflection bound to (page, responder). One
    reply per (page, responder) — editing replaces in place (revision-free:
    replies are the responder's living words, never re-shared by the owner)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    page = models.ForeignKey(JournalPage, on_delete=models.CASCADE,
                             related_name="replies")
    responder = models.ForeignKey(settings.AUTH_USER_MODEL,
                                  on_delete=models.CASCADE,
                                  related_name="f08_journal_replies")
    body = models.TextField()
    created_at = models.DateTimeField(default=_utc_now, editable=False)
    updated_at = models.DateTimeField(default=_utc_now, editable=False)

    class Meta:
        app_label = "f08_journal"
        constraints = [
            models.UniqueConstraint(fields=["page", "responder"],
                                    name="uniq_f08_page_responder_reply"),
        ]
        indexes = [
            models.Index(fields=["page", "created_at"]),
        ]

    def view(self, *, viewer_id: str) -> dict:
        return {
            "reply_id": str(self.id),
            "page_id": str(self.page_id),
            "responder_id": str(self.responder_id),
            "direction": ("given" if str(self.responder_id) == str(viewer_id)
                          else "received"),
            "body": self.body,
            "updated_at": self.updated_at.isoformat(),
        }
