"""Idempotency helpers (SEC-07, contract docs/contracts/api-foundation.md).

Send-class mutations carry idempotency_key + payload hash:
- same key + same payload hash  -> return existing receipt (after recheck of
  current permission; never return a revoked body),
- same key + different payload  -> duplicate_key_payload_mismatch (409),
- unknown network outcome       -> client looks up operation status with the
  SAME key; never retries with a new key.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Mapping


def canonical_bytes(payload: Mapping[str, Any]) -> bytes:
    """Stable canonical JSON bytes: sorted keys, compact separators, UTF-8."""
    return json.dumps(
        payload, sort_keys=True, separators=(",", ":"),
        ensure_ascii=False, default=str,
    ).encode("utf-8")


def payload_hash(payload: Mapping[str, Any]) -> str:
    """SHA-256 hex of canonical payload. Stable across runs for same content."""
    return hashlib.sha256(canonical_bytes(payload)).hexdigest()


def send_payload_hash(*, kind: str, recipient_id: str, body: str,
                      reply_to: str | None = None,
                      context_revision: int | None = None) -> str:
    """Canonical hash for send-class mutations (message/cards/signals/replies).

    Body content, kind, recipient and reply context all participate so that
    any change invalidates the previous preview binding.
    """
    return payload_hash({
        "kind": kind,
        "recipient_id": str(recipient_id),
        "body": body,
        "reply_to": str(reply_to) if reply_to else None,
        "context_revision": context_revision,
    })
