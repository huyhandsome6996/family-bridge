"""TEST-ONLY doubles for F06: controlled clock + per-kind draft senders.

ControlledClock drives the 299/300/301 second boundary tests. FakeKindSender
mimics the production delegation contract (F05 text / F03 card): checks the
active connection via TestConnectionReader (like the real transport) and
records sends — clearly labelled TEST-ONLY; B18 wires the real senders.
"""

import datetime as dt

from family_bridge_core.errors import NotAuthorized
from family_bridge_core.timeutils import UTC

from labgrants.f05_fixtures import TestConnectionReader


class ControlledClock:
    def __init__(self, start: dt.datetime | None = None) -> None:
        self._now = start or dt.datetime.now(tz=UTC)

    def __call__(self) -> dt.datetime:
        return self._now

    def now(self) -> dt.datetime:
        return self._now

    def advance(self, *, seconds: float) -> None:
        self._now = self._now + dt.timedelta(seconds=seconds)


class FakeKindSender:
    """Records sends; enforces the active-connection guard the way the real
    transport port does; deterministic message ids."""

    def __init__(self, *, fail_reason: str | None = None) -> None:
        self.sent = []
        self.counter = 0
        self.fail_reason = fail_reason

    def __call__(self, *, author_id, draft):
        if self.fail_reason:
            raise NotAuthorized({"reason": self.fail_reason})
        reader = TestConnectionReader()
        connection = reader.active_connection_between(
            user_a=str(author_id), user_b=str(draft.recipient_id))
        if connection is None:
            raise NotAuthorized({"reason": "no_active_connection"})
        self.counter += 1
        message_id = f"fake-msg-{self.counter:04d}-{str(draft.id)[:8]}"
        self.sent.append({"message_id": message_id,
                          "author_id": str(author_id),
                          "draft_id": str(draft.id),
                          "kind": draft.kind,
                          "body": draft.body,
                          "recipient_id": draft.recipient_id,
                          "revision": draft.revision})
        return {"message_id": message_id}
