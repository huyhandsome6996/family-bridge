"""F10 service: the "Con cần được lắng nghe" signal (US-032).

The signal is a NORMAL message (kind="listening_signal") sent through the
MessageTransport port — one send path, idempotent, explicit. Invariants:
- Need allowlist; the composed body is CANONICAL per need (server text) —
  the send DTO carries only (need, recipient): no draft, no pause content,
  no AI original ever rides along (WF-07: never cooldown-gated — the F05
  transport exempts listening_signal by design; F06 is not involved).
- One recipient, explicitly chosen among ACTIVE connections. There is NO
  broadcast endpoint and no family/admin fan-out anywhere.
- Ack = read receipt by the real recipient (transport.mark_read); replies/
  proposed times are normal messages composed by the recipient — choosing
  "hẹn giờ" NEVER creates a school appointment (F12 is a separate flow).
- No response state is truthful and passive: nothing auto-escalates,
  auto-forwards or auto-retries; the client offers the manual paths
  (other supporter / help directory) instead.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from family_bridge_core.errors import (
    InputInvalid, ModuleUnavailable, NotFound,
)
from family_bridge_core.idempotency import send_payload_hash

from . import registry

NEED_TALK = "muon_tro_chuyen"
NEED_COMPANY = "muon_duoc_o_ben"
NEED_TIME = "muon_hen_gio"
NEEDS = (NEED_TALK, NEED_COMPANY, NEED_TIME)

# TEST/provisional copy (DEC-17); production wording needs Thầy duyệt
# (US-005) — served as allowlisted labels, never user input.
NEED_LABELS = {
    NEED_TALK: "Con muốn trò chuyện với bố mẹ",
    NEED_COMPANY: "Con muốn có bố mẹ ở bên",
    NEED_TIME: "Con muốn hẹn thời gian trao đổi",
}

NEED_BODIES = {
    NEED_TALK: "Con cần được lắng nghe — con muốn trò chuyện với bố mẹ.",
    NEED_COMPANY: "Con cần được lắng nghe — con muốn có bố mẹ ở bên.",
    NEED_TIME: "Con cần được lắng nghe — con muốn hẹn thời gian trao đổi.",
}


class SignalService:
    def meta(self) -> Dict[str, Any]:
        return {"needs": [{"need": code, "label": NEED_LABELS[code]}
                          for code in NEEDS]}

    def _require_need(self, need: str) -> str:
        if need not in NEEDS:
            raise InputInvalid({"field": "need_kind",
                                "reason": "invalid_need",
                                "allowed": list(NEEDS)})
        return need

    def _connection_guard(self, *, sender_id: str, recipient_id: str):
        reader = registry.get_connection_reader()
        if reader is None:
            raise ModuleUnavailable(
                {"reason": "connection_reader_not_wired"})
        connection = reader.active_connection_between(
            user_a=str(sender_id), user_b=str(recipient_id))
        if connection is None:
            raise NotFound({"reason": "no_active_connection"})
        return connection

    def preview(self, *, sender_id: str, recipient_id: str,
                need: str) -> Dict[str, Any]:
        need = self._require_need(need)
        self._connection_guard(sender_id=sender_id, recipient_id=recipient_id)
        return {"need": need, "label": NEED_LABELS[need],
                "body": NEED_BODIES[need],
                "recipient_id": str(recipient_id)}

    def send(self, *, sender_id: str, recipient_id: str, need: str,
             idempotency_key: str) -> Dict[str, Any]:
        need = self._require_need(need)
        transport = registry.get_transport()
        if transport is None:
            raise ModuleUnavailable({"reason": "transport_not_wired"})
        body = NEED_BODIES[need]
        payload_hash = send_payload_hash(
            kind="listening_signal", recipient_id=str(recipient_id),
            body=body, reply_to=None, context_revision=None)
        sent = transport.send(
            sender_id=str(sender_id), recipient_id=str(recipient_id),
            kind="listening_signal", approved_body=body,
            idempotency_key=idempotency_key,
            payload_hash_hex=payload_hash)
        return {"message_id": sent.message_id, "need": need,
                "state": "sent"}

    def get_for_viewer(self, *, message_id: str,
                       viewer_id: str) -> Dict[str, Any]:
        transport = registry.get_transport()
        if transport is None:
            raise ModuleUnavailable({"reason": "transport_not_wired"})
        finder = getattr(transport, "find_message_for_viewer", None)
        if finder is None:
            raise ModuleUnavailable(
                {"reason": "transport_lookup_not_supported"})
        found = finder(message_id=str(message_id), viewer_id=str(viewer_id))
        if found is None:
            raise NotFound({"reason": "signal_not_found"})
        message, need = found
        return {"message_id": str(message_id), "need": need,
                "label": NEED_LABELS.get(need, need),
                "body": message.approved_body,
                "sender_id": str(message.sender_id),
                "recipient_id": str(message.recipient_id),
                "read": getattr(message, "read_at", None) is not None,
                "created_at": message.created_at.isoformat(),
                "response": ("none" if getattr(message, "read_at", None)
                             is None else "acknowledged_or_replied_elsewhere")}

    def ack(self, *, message_id: str, actor_id: str) -> Dict[str, Any]:
        transport = registry.get_transport()
        if transport is None:
            raise ModuleUnavailable({"reason": "transport_not_wired"})
        try:
            transport.mark_read(message_id=str(message_id),
                                actor_id=str(actor_id))
        except Exception as exc:
            from family_bridge_core.errors import FamilyBridgeError
            if isinstance(exc, FamilyBridgeError):
                raise
            raise NotFound({"reason": "signal_not_found"}) from exc
        return {"ack": True}
