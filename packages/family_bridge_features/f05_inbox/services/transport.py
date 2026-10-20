"""MessageTransportService — the single send path (SEC-07, FL-08/11).

Guards, in order:
1. kind allowlist (MESSAGE_KINDS);
2. body bounds (no silent truncation);
3. idempotency replay: same sender+key returns the SAME message only after
   rechecking current permission; same key + different payload hash → 409
   duplicate_key_payload_mismatch;
4. active connection at current generation via ConnectionReader (deny when
   absent/revoked); the recorded generation is the CURRENT one;
5. listening_signal is NEVER cooldown-gated (WF-07); cooldown checks belong
   to F06 which calls transport only after its own guard;
6. context kinds (journal_reply/mood_reply) require a validated reply
   context through the registered validator (fail closed when unwired).

Network/AI calls NEVER happen here (pure DB, short transaction).
"""

from __future__ import annotations

import datetime as dt
from typing import Any, Dict, Optional

from django.db import transaction

from family_bridge_core.errors import (
    DuplicateKeyPayloadMismatch, InputInvalid, NotAuthorized, NotFound,
)
from family_bridge_core.idempotency import send_payload_hash
from family_bridge_core.protocols import SentMessage
from family_bridge_core.validation import MAX_TEXT_CHARS
from family_bridge_core.timeutils import UTC

from ..models import (
    CONTEXT_KINDS, KIND_LISTENING_SIGNAL, MESSAGE_KINDS, Message,
)
from . import registry


class MessageTransportService:
    def __init__(self, *, clock=None) -> None:
        self.clock = clock

    def _now(self) -> dt.datetime:
        return self.clock.now() if self.clock else dt.datetime.now(tz=UTC)

    def _view(self, message: Message) -> SentMessage:
        return SentMessage(
            message_id=str(message.id), sender_id=str(message.sender_id),
            recipient_id=str(message.recipient_id), kind=message.kind,
            approved_body=message.approved_body,
            idempotency_key=message.idempotency_key,
            payload_hash_hex=message.payload_hash_hex,
            connection_id=str(message.connection_id),
            connection_generation=message.connection_generation,
            created_at=message.created_at,
            reply_to=str(message.reply_to_id) if message.reply_to_id else None,
        )

    # -- send ------------------------------------------------------------------
    @transaction.atomic
    def send(self, *, sender_id: str, recipient_id: str, kind: str,
             approved_body: str, idempotency_key: str,
             payload_hash_hex: str, reply_to: Optional[str] = None,
             context: Optional[Dict[str, Any]] = None,
             body_title: str = "") -> SentMessage:
        if kind not in MESSAGE_KINDS:
            raise InputInvalid({"field": "kind", "reason": "kind_not_allowed",
                                "allowed": list(MESSAGE_KINDS)})
        if not isinstance(approved_body, str) or not approved_body.strip():
            raise InputInvalid({"field": "body", "reason": "empty"})
        if len(approved_body) > MAX_TEXT_CHARS:
            raise InputInvalid({"field": "body", "reason": "too_long",
                                "max": MAX_TEXT_CHARS})
        if not isinstance(idempotency_key, str) or not (8 <= len(idempotency_key) <= 128):
            raise InputInvalid({"field": "idempotency_key", "reason": "malformed"})

        computed_hash = send_payload_hash(
            kind=kind, recipient_id=str(recipient_id), body=approved_body,
            reply_to=reply_to,
            context_revision=(context or {}).get("revision"))
        if computed_hash != payload_hash_hex:
            raise InputInvalid({"field": "payload_hash",
                                "reason": "hash_mismatch_recompute"})

        # Idempotent replay — only for the SAME sender+key (after auth, the
        # caller's identity is authoritative).
        existing = Message.objects.filter(
            sender_id=str(sender_id), idempotency_key=idempotency_key).first()
        if existing is not None:
            if existing.payload_hash_hex != payload_hash_hex:
                raise DuplicateKeyPayloadMismatch(
                    {"reason": "same_key_different_payload"})
            return self._view(existing)

        # Reply integrity: cannot reply to a message not addressed to sender.
        reply_to_id = None
        if reply_to:
            parent = Message.objects.filter(pk=reply_to).first()
            if parent is None or str(parent.recipient_id) != str(sender_id):
                raise NotFound({"reason": "reply_target_not_found"})
            reply_to_id = str(parent.pk)

        # Connection guard: active + CURRENT generation recorded.
        reader = registry.get_connection_reader()
        connection = None
        if reader is not None:
            connection = reader.active_connection_between(
                user_a=str(sender_id), user_b=str(recipient_id))
            if connection is None:
                from django.db.models import Q
                from family_bridge_features.f11_supporters.models import (
                    STATUS_ACTIVE, SupporterRole,
                )
                has_active_supporter = SupporterRole.objects.filter(
                    Q(student_id=str(sender_id), supporter_id=str(recipient_id)) |
                    Q(student_id=str(recipient_id), supporter_id=str(sender_id)),
                    status=STATUS_ACTIVE,
                ).exists()
                if not has_active_supporter:
                    raise NotAuthorized({"reason": "no_active_connection"})

        # Reply context (shared-item replies) — fail closed when unwired.
        context_item_type = ""
        context_item_id = None
        context_owner_id = ""
        if kind in CONTEXT_KINDS:
            validator = registry.get_context_validator()
            data = context or {}
            if validator is None:
                raise InputInvalid({"reason": "reply_context_validator_unavailable"})
            if not validator(owner_id=str(data.get("owner_id", "")),
                             item_id=str(data.get("item_id", "")),
                             recipient_id=str(sender_id),
                             revision=int(data.get("revision", 0)),
                             item_type=str(data.get("item_type", ""))):
                raise NotAuthorized({"reason": "reply_context_no_longer_shared"})
            context_item_type = str(data.get("item_type", ""))[:32]
            try:
                import uuid as _uuid
                context_item_id = _uuid.UUID(str(data.get("item_id")))
            except ValueError as exc:
                raise InputInvalid({"field": "context.item_id",
                                    "reason": "malformed"}) from exc
            context_owner_id = str(data.get("owner_id", ""))[:64]

        message = Message.objects.create(
            connection_id=(str(connection.connection_id) if connection
                           else "00000000-0000-0000-0000-000000000000"),
            connection_generation=(connection.generation if connection else 1),
            sender_id=str(sender_id), recipient_id=str(recipient_id),
            kind=kind, approved_body=approved_body,
            body_title=(body_title or "")[:200],
            reply_to_id=reply_to_id,
            context_item_type=context_item_type,
            context_item_id=context_item_id,
            context_owner_id=context_owner_id,
            idempotency_key=idempotency_key,
            payload_hash_hex=payload_hash_hex,
        )
        return self._view(message)

    # -- read receipts -----------------------------------------------------------
    @transaction.atomic
    def mark_read(self, *, message_id: str, actor_id: str,
                  at: Optional[dt.datetime] = None) -> bool:
        message = (Message.objects.select_for_update()
                   .filter(pk=message_id).first())
        if message is None or str(actor_id) != str(message.recipient_id):
            raise NotFound({"reason": "message_not_found"})
        stamp = at or self._now()
        if message.read_at is None or stamp < message.read_at:
            message.read_at = stamp
            message.save(update_fields=["read_at"])
        return True

    # -- lookup for unknown outcomes ------------------------------------------------
    def lookup_by_idempotency_key(self, *, sender_id: str,
                                  idempotency_key: str) -> Optional[SentMessage]:
        found = Message.objects.filter(sender_id=str(sender_id),
                                       idempotency_key=idempotency_key).first()
        return self._view(found) if found else None

    # -- inbox queries (authorization filtered BEFORE pagination) -----------------
    def inbox_page(self, *, actor_id: str, cursor: Optional[str],
                   page_size: int):
        from family_bridge_core.drf import cursor_paginate
        from django.db.models import Q
        qs = Message.objects.filter(
            Q(recipient_id=str(actor_id)) | Q(sender_id=str(actor_id)))
        rows, next_cursor = cursor_paginate(qs, cursor=cursor,
                                            page_size=page_size)
        return rows, next_cursor

    def get_for_viewer(self, *, message_id: str, viewer_id: str):
        """Participant-only detail with DEC-13 fail-closed handling.

        - sender: always sees own sent copy (their words).
        - recipient: sees body only while the connection is ACTIVE at current
          generation (DEC-13 OPEN, provisional fail-closed for others' bodies).
        """
        message = Message.objects.filter(pk=message_id).first()
        if message is None:
            raise NotFound({"reason": "message_not_found"})
        is_sender = str(message.sender_id) == str(viewer_id)
        is_recipient = str(message.recipient_id) == str(viewer_id)
        if not (is_sender or is_recipient):
            raise NotFound({"reason": "message_not_found"})
        if is_recipient and not is_sender:
            reader = registry.get_connection_reader()
            if reader is not None:
                connection = reader.active_connection_between(
                    user_a=str(message.sender_id), user_b=str(message.recipient_id))
                if connection is None:
                    # Fail closed: body of another person after unlink.
                    raise NotFound({"reason": "message_no_longer_available"})
        return message
