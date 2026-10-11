"""Controllable clock for tests (DEC-03: 299/300/301s boundaries)."""

import datetime as dt

from family_bridge_core.timeutils import UTC


class FakeClock:
    def __init__(self, start: dt.datetime | None = None) -> None:
        self._now = start or dt.datetime(2026, 10, 11, 9, 0, 0, tzinfo=UTC)

    def now(self) -> dt.datetime:
        return self._now

    def advance(self, seconds: float = 1.0) -> None:
        self._now = self._now + dt.timedelta(seconds=seconds)

    def set(self, value: dt.datetime) -> None:
        self._now = value
