"""F11 service: invite/consent lifecycle + explicit supporter contact.

Contact = a NEW, user-composed message sent through the MessageTransport
port (kind text). OLD bodies (letters/journals/AI) are NEVER copied — the
DTO carries only what the user just typed. There is no broadcast and no
family-group fan-out. Every contact re-verifies: role ACTIVE + unexpired
+ relationship matches, then the transport re-verifies the connection at
its CURRENT generation. When the first supporter has not answered, the
student explicitly picks ANOTHER active role — nothing auto-forwards."""

from __future__ import annotations

import datetime as dt
from typing import Any, Dict, Optional

from django.db import transaction

from family_bridge_core.errors import (
    InputInvalid, ModuleUnavailable, NotFound,
)
from family_bridge_core.idempotency import send_payload_hash
from family_bridge_core.timeutils import UTC
from family_bridge_core.validation import MAX_TEXT_CHARS

from ..models import (
    RELATIONSHIP_KINDS, ROLE_TTL_DAYS, SUPPORT_SCOPES, STATUS_ACTIVE,
    STATUS_DECLINED, STATUS_EXPIRED, STATUS_PENDING, STATUS_REVOKED,
    SupporterRole,
)
from . import registry


def _now() -> dt.datetime:
    return dt.datetime.now(tz=UTC)


class SupporterService:
    # -- invitation / consent ------------------------------------------------
    @transaction.atomic
    def invite(self, *, student_id: str, supporter_id: str,
               relationship_kind: str) -> SupporterRole:
        if relationship_kind not in RELATIONSHIP_KINDS:
            raise InputInvalid({"field": "relationship_kind",
                                "reason": "invalid_kind",
                                "allowed": list(RELATIONSHIP_KINDS)})
        if str(supporter_id) == str(student_id):
            raise InputInvalid({"field": "supporter_id",
                                "reason": "cannot_invite_self"})
        # Consent flow requires the supporter to be reachable through the
        # F01 connection invitation port when NOT yet connected (B18 wiring);
        # standalone harness runs provide a double.
        connector = registry.get_invite_connector()
        if connector is not None:
            connection = connector.ensure_backup_connection(
                inviter_id=str(student_id), invitee_id=str(supporter_id))
            if connection is None:
                raise ModuleUnavailable(
                    {"reason": "invitation_flow_unavailable"})
        existing = SupporterRole.objects.filter(
            student_id=str(student_id), supporter_id=str(supporter_id),
            status__in=(STATUS_PENDING, STATUS_ACTIVE),
        ).first()
        if existing is not None:
            return existing

        from django.db import IntegrityError
        try:
            with transaction.atomic():
                role = SupporterRole.objects.create(
                    student_id=str(student_id), supporter_id=str(supporter_id),
                    relationship_kind=relationship_kind,
                    support_scope=SUPPORT_SCOPES[0],
                    status=STATUS_PENDING,
                )
                return role
        except IntegrityError:
            role = SupporterRole.objects.filter(
                student_id=str(student_id), supporter_id=str(supporter_id),
                status__in=(STATUS_PENDING, STATUS_ACTIVE),
            ).first()
            if role is not None:
                return role
            raise

    def _require_role(self, *, role_id: str) -> SupporterRole:
        role = SupporterRole.objects.filter(pk=role_id).first()
        if role is None:
            raise NotFound({"reason": "role_not_found"})
        return role

    @transaction.atomic
    def respond(self, *, supporter_id: str, role_id: str,
                decision: str) -> SupporterRole:
        """The SUPPORTER's own accept/decline — consent cannot be granted by
        the student, an admin, or any other actor."""
        role = self._require_role(role_id=role_id)
        if str(role.supporter_id) != str(supporter_id):
            raise NotFound({"reason": "role_not_found"})
        if role.status != STATUS_PENDING:
            return role  # one-way, idempotent
        if decision == "accept":
            role.status = STATUS_ACTIVE
            role.responded_at = _now()
            role.expires_at = _now() + dt.timedelta(days=ROLE_TTL_DAYS)
        elif decision == "decline":
            role.status = STATUS_DECLINED
            role.responded_at = _now()
        else:
            raise InputInvalid({"field": "decision",
                                "reason": "invalid_decision"})
        role.save()
        return role

    @transaction.atomic
    def revoke(self, *, actor_id: str, role_id: str) -> SupporterRole:
        """Either side may end the role (student or supporter)."""
        role = self._require_role(role_id=role_id)
        if str(role.supporter_id) != str(actor_id) and \
                str(role.student_id) != str(actor_id):
            raise NotFound({"reason": "role_not_found"})
        if role.status in (STATUS_PENDING, STATUS_ACTIVE):
            role.status = STATUS_REVOKED
            role.revoked_at = _now()
            role.save(update_fields=["status", "revoked_at"])
        return role

    # -- listings (owner-scoped) ----------------------------------------------
    def list_for_student(self, *, student_id: str):
        return (SupporterRole.objects.filter(student_id=str(student_id))
                .exclude(status__in=(STATUS_REVOKED, STATUS_EXPIRED))
                .order_by("-invited_at"))

    def list_for_supporter(self, *, supporter_id: str):
        return (SupporterRole.objects.filter(supporter_id=str(supporter_id))
                .exclude(status__in=(STATUS_REVOKED, STATUS_EXPIRED))
                .order_by("-invited_at"))

    # -- explicit contact ------------------------------------------------------
    def contact(self, *, student_id: str, role_id: str, body: str,
                idempotency_key: str) -> Dict[str, Any]:
        """Student picks THIS supporter and sends NEW text. Re-verification:
        role active + unexpired here; connection current-generation in the
        transport. Old conversations are never attached."""
        role = self._require_role(role_id=role_id)
        if str(role.student_id) != str(student_id):
            raise NotFound({"reason": "role_not_found"})
        if not role.is_contactable(now=_now()):
            raise InputInvalid({"reason": "supporter_not_available",
                                "status": role.status})
        if not isinstance(body, str) or not body.strip():
            raise InputInvalid({"field": "body", "reason": "empty"})
        if len(body) > MAX_TEXT_CHARS:
            raise InputInvalid({"field": "body", "reason": "too_long",
                                "max": MAX_TEXT_CHARS})
        transport = registry.get_transport()
        if transport is None:
            raise ModuleUnavailable({"reason": "transport_not_wired"})
        payload_hash = send_payload_hash(
            kind="text", recipient_id=str(role.supporter_id), body=body,
            reply_to=None, context_revision=None)
        sent = transport.send(
            sender_id=str(student_id), recipient_id=str(role.supporter_id),
            kind="text", approved_body=body, idempotency_key=idempotency_key,
            payload_hash_hex=payload_hash)
        return {"message_id": sent.message_id, "role_id": str(role.id),
                "state": "sent"}
