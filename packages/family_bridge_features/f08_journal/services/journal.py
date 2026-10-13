"""F08 services: private pages, per-page grants, song-hanh replies.

Mirrors the F07 grant machinery (same shape as F15 GrantView so B18 can
register JournalShareService as the journal_page grant provider)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from django.db import transaction
from django.db.models import Q

from family_bridge_core.errors import (
    InputInvalid, ModuleUnavailable, NotFound, RevisionConflict,
)
from family_bridge_core.timeutils import UTC
from family_bridge_core.validation import MAX_PAGE_SIZE

from ..models import (
    MAX_CONTENT_CHARS, MAX_REPLY_CHARS, MAX_TITLE_CHARS,
    JournalPage, JournalReply, JournalShare,
)
from . import registry


def _now():
    from family_bridge_core.timeutils import UTC
    import datetime as dt
    return dt.datetime.now(tz=UTC)


def _require_own_page(*, owner_id: str, page_id: str) -> JournalPage:
    page = JournalPage.objects.filter(pk=page_id).first()
    if page is None or str(page.owner_id) != str(owner_id):
        raise NotFound({"reason": "page_not_found"})
    return page


def _validate_text(value, *, field: str, max_len: int,
                   allow_empty: bool = False) -> str:
    if not isinstance(value, str):
        raise InputInvalid({"field": field, "reason": "must_be_string"})
    if not allow_empty and not value.strip():
        raise InputInvalid({"field": field, "reason": "empty"})
    if len(value) > max_len:
        raise InputInvalid({"field": field, "reason": "too_long",
                            "max": max_len})
    return value


class JournalPageService:
    def prompts(self) -> List[Dict[str, Any]]:
        provider = registry.get_prompt_provider()
        if provider is None:
            return []
        out = []
        for raw in (provider.list_prompts() or [])[:50]:
            if not isinstance(raw, dict):
                continue
            code = str(raw.get("topic_code", ""))[:32]
            text = str(raw.get("prompt_text", ""))
            if not code or not text or len(text) > 1000:
                continue
            if str(raw.get("status", "")) != "published":
                continue
            out.append({"topic_code": code, "prompt_text": text})
        return out

    @transaction.atomic
    def create(self, *, owner_id: str, topic_code: str, title: str,
               content: str) -> JournalPage:
        if topic_code:
            topic_code = _validate_text(topic_code, field="topic_code",
                                        max_len=32)
            if not any(p["topic_code"] == topic_code
                       for p in self.prompts()):
                # unknown/unpublished topic -> reject (published-only)
                raise InputInvalid({"field": "topic_code",
                                    "reason": "topic_not_published"})
        title = _validate_text(title or "", field="title",
                               max_len=MAX_TITLE_CHARS, allow_empty=True)
        content = _validate_text(content, field="content",
                                 max_len=MAX_CONTENT_CHARS)
        return JournalPage.objects.create(owner_id=str(owner_id),
                                          topic_code=topic_code,
                                          title=title, content=content)

    def get_own(self, *, owner_id: str, page_id: str) -> JournalPage:
        return _require_own_page(owner_id=owner_id, page_id=page_id)

    def list_own(self, *, owner_id: str, cursor: Optional[str],
                 page_size: int, search: Optional[str] = None):
        from family_bridge_core.drf import cursor_paginate
        qs = JournalPage.objects.filter(owner_id=str(owner_id))
        if search:
            search = _validate_text(search, field="search", max_len=100)
            # owner-scoped search only (title + content); no cross-owner path
            qs = qs.filter(Q(title__icontains=search)
                           | Q(content__icontains=search))
        return cursor_paginate(qs, cursor=cursor, page_size=page_size,
                               timestamp_field="updated_at")

    @transaction.atomic
    def edit(self, *, owner_id: str, page_id: str, title: Optional[str],
             content: Optional[str], expected_revision: int) -> JournalPage:
        """Offline/reload conflict guard: expected_revision must match the
        stored revision or the edit is rejected 409 (never silent merge)."""
        page = _require_own_page(owner_id=owner_id, page_id=page_id)
        if expected_revision != page.revision:
            raise RevisionConflict({
                "reason": "page_changed_elsewhere",
                "expected": expected_revision,
                "current": page.revision,
            })
        if title is not None:
            page.title = _validate_text(title, field="title",
                                        max_len=MAX_TITLE_CHARS,
                                        allow_empty=True)
        if content is not None:
            page.content = _validate_text(content, field="content",
                                          max_len=MAX_CONTENT_CHARS)
        page.revision += 1  # auto-hides from recipients until re-shared
        page.updated_at = _now()
        page.save()
        return page

    @transaction.atomic
    def discard(self, *, owner_id: str, page_id: str) -> None:
        page = _require_own_page(owner_id=owner_id, page_id=page_id)
        page.delete()  # cascades shares + context-bound replies (no orphans)

    def count_own(self, *, owner_id: str) -> int:
        return JournalPage.objects.filter(owner_id=str(owner_id)).count()


class JournalShareService:
    def share(self, *, owner_id: str, page_id: str,
              recipient_id: str) -> JournalShare:
        page = _require_own_page(owner_id=owner_id, page_id=page_id)
        if str(recipient_id) == str(owner_id):
            raise InputInvalid({"field": "recipient_id",
                                "reason": "cannot_share_to_self"})
        reader = registry.get_connection_reader()
        if reader is None:
            raise ModuleUnavailable(
                {"reason": "connection_reader_not_wired"})
        connection = reader.active_connection_between(
            user_a=str(owner_id), user_b=str(recipient_id))
        if connection is None:
            raise NotFound({"reason": "no_active_connection"})
        share, created = JournalShare.objects.get_or_create(
            page=page, recipient_id=str(recipient_id),
            approved_revision=page.revision,
            defaults={"owner_id": str(owner_id),
                      "connection_id": str(connection.connection_id),
                      "connection_generation": connection.generation})
        if not created and share.revoked_at is not None:
            # A revoked grant is TERMINAL for this (page, recipient, revision)
            # (FL-07): re-sharing the same revision would silently revive it.
            raise InputInvalid({"reason": "reshare_after_revoke_requires_edit"})
        return share

    def revoke(self, *, owner_id: str, share_id: str) -> JournalShare:
        share = JournalShare.objects.filter(pk=share_id).first()
        if share is None or str(share.owner_id) != str(owner_id):
            raise NotFound({"reason": "share_not_found"})
        if share.revoked_at is None:
            share.revoked_at = _now()
            share.save(update_fields=["revoked_at"])
            # R10 fix: EVERY revoke entry point is durable — the domain path
            # appends the same ``grant_revoked`` ledger event as the F15 API
            # so a backup restore replays it. ImportError-guarded: standalone
            # runs without f15_privacy keep working (coupling documented).
            try:
                from family_bridge_features.f15_privacy.models import (
                    DeletionLedgerEvent,
                )

                DeletionLedgerEvent.objects.create(
                    target_user_id=str(owner_id), actor_ref=str(owner_id),
                    event_type=DeletionLedgerEvent.EVENT_GRANT_REVOKED,
                    payload={"item_type": "journal_page",
                             "item_id": str(share.page_id),
                             "recipient_id": str(share.recipient_id),
                             "entry_point": "f08_domain_service"})
            except ImportError:
                pass
        return share

    def list_shared_by_me(self, *, owner_id: str, page_id: str):
        return JournalShare.objects.filter(
            owner_id=str(owner_id), page_id=page_id,
            revoked_at__isnull=True).select_related("page")

    def list_shared_with_me(self, *, recipient_id: str):
        from django.db.models import F, Q

        rows = (JournalShare.objects
                .filter(recipient_id=str(recipient_id),
                        revoked_at__isnull=True,
                        approved_revision=F("page__revision"))
                .select_related("page", "owner")
                .order_by("-created_at", "-id"))
        reader = registry.get_connection_reader()
        if reader is None:
            return []  # fail-closed: cannot verify connection state
        active = {}
        bindings = []
        for connection in reader.list_active_for_user(
                user_id=str(recipient_id)):
            other = connection.party_b if connection.party_a == str(recipient_id) \
                else connection.party_a
            active[str(other)] = connection
            bindings.append(Q(connection_id=str(connection.connection_id),
                              connection_generation=int(connection.generation)))
        # R09 fix: the (connection_id, generation) binding filter runs in SQL
        # BEFORE any bound, so stale rows on old connections can no longer
        # push valid grants past the list bound. The Python re-check below
        # remains the authoritative second line of defense.
        if bindings:
            pair_q = bindings[0]
            for q in bindings[1:]:
                pair_q |= q
            rows = rows.filter(pair_q)
        bounded = list(rows[:_LIST_BINDING_BOUND])
        return [row for row in bounded
                if _binding_current(row, owner_id=str(row.owner_id),
                                    recipient_id=str(recipient_id),
                                    active=active)]

    def _valid_share_for_read(self, *, recipient_id: str,
                              share_id: str) -> JournalShare:
        share = JournalShare.objects.select_related("page").filter(
            pk=share_id).first()
        if (share is None or str(share.recipient_id) != str(recipient_id)
                or share.revoked_at is not None
                or share.approved_revision != share.page.revision):
            raise NotFound({"reason": "share_not_found"})
        reader = registry.get_connection_reader()
        if reader is None:
            raise NotFound({"reason": "share_not_found"})
        connection = reader.active_connection_between(
            user_a=str(share.owner_id), user_b=str(recipient_id))
        if connection is None:
            raise NotFound({"reason": "share_not_found"})
        if (str(getattr(connection, "connection_id", ""))
                != str(share.connection_id)
                or int(getattr(connection, "generation", -1))
                != int(share.connection_generation)):
            raise NotFound({"reason": "share_not_found"})
        return share

    def read_shared(self, *, recipient_id: str, share_id: str) -> Dict[str, Any]:
        share = self._valid_share_for_read(recipient_id=recipient_id,
                                           share_id=share_id)
        return {"share_id": str(share.id),
                "page": share.page.shared_view(),
                "owner_id": str(share.owner_id),
                "shared_at": share.created_at.isoformat()}

    @transaction.atomic
    def write_reply(self, *, responder_id: str, share_id: str,
                    body: str) -> JournalReply:
        """Song hành response: requires the grant to be VALID NOW; the reply
        is bound to the page and NEVER unlocks the page content afterwards
        (reads re-check the grant; revoked page -> reply context denied)."""
        share = self._valid_share_for_read(recipient_id=responder_id,
                                           share_id=share_id)
        body = _validate_text(body, field="body", max_len=MAX_REPLY_CHARS)
        reply, _ = JournalReply.objects.update_or_create(
            page=share.page, responder_id=str(responder_id),
            defaults={"body": body, "updated_at": _now()})
        return reply

    def list_replies_for_owner(self, *, owner_id: str,
                               page_id: str) -> List[JournalReply]:
        """Owner reads reflections received on THEIR page (their context)."""
        page = _require_own_page(owner_id=owner_id, page_id=page_id)
        return list(page.replies.select_related("responder")
                    .order_by("-updated_at"))

    def list_my_replies(self, *, responder_id: str) -> List[JournalReply]:
        return list(JournalReply.objects.filter(
            responder_id=str(responder_id)).order_by("-updated_at"))

    @staticmethod
    def apply_user_deletion(*, user_id: str) -> Dict[str, Any]:
        pages, _ = JournalPage.objects.filter(owner_id=str(user_id)).delete()
        replies, _ = JournalReply.objects.filter(
            responder_id=str(user_id)).delete()
        return {"domain": "f08_journal", "pages_deleted": pages,
                "replies_deleted": replies}


_LIST_BINDING_BOUND = 200  # DSA bound before the binding filter


def _binding_current(share, *, owner_id: str, recipient_id: str,
                     active: dict) -> bool:
    """True when the grant's recorded connection is STILL the active
    connection between the pair at the SAME generation (F15/WF-04)."""
    connection = active.get(str(owner_id))
    if connection is None:
        return False
    return (str(getattr(connection, "connection_id", ""))
            == str(share.connection_id)
            and int(getattr(connection, "generation", -1))
            == int(share.connection_generation))
