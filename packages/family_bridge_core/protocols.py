"""Ports (Protocol interfaces) shared across feature modules.

Dependency rule (B00): feature modules depend on these ports, never on other
features' implementations. Each port has exactly one production owner (see
registry.py) and test implementations live in tests/feature-lab/fixtures.

Implementations must keep the invariants documented on each port:
- deny by default (WF-02, SEC-03/04),
- no client-trusted actor/role/cooldown/owner (WF-01, SEC-01/05),
- network/AI/provider calls NEVER inside DB transactions or locks (WF-11),
- grants are item + recipient + revision + current connection generation
  (WF-04, DEC-04).
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, Mapping, Optional, Protocol, runtime_checkable

UTC = dt.timezone.utc


def utcnow() -> dt.datetime:
    return dt.datetime.now(tz=UTC)


# --- Identity / session -----------------------------------------------------

@dataclass(frozen=True)
class VerifiedIdentity:
    """Server-verified Zalo identity (never client-claimed)."""
    provider: str                 # always "zalo" for this project
    app_id: str                   # parent Zalo App ID the token belongs to
    provider_subject: str         # Zalo user id, kept as STRING (no Number)


@dataclass(frozen=True)
class SessionView:
    user_id: str
    token_ref: str
    expires_at: dt.datetime
    revoked: bool = False


@runtime_checkable
class IdentityVerifier(Protocol):
    """Verifies a provider credential server-side (SEC-01)."""

    def verify(self, *, access_token: str) -> VerifiedIdentity:
        """Raise errors.FamilyBridgeError subclasses on invalid/expired/
        wrong-app credentials. Never trust client-declared zalo ids."""
        ...


@runtime_checkable
class SessionIssuer(Protocol):
    """Issues/revokes application sessions (SEC-02)."""

    def issue(self, *, user_id: str) -> SessionView: ...
    def resolve(self, *, token: str) -> Optional[SessionView]: ...
    def revoke(self, *, token_ref: str) -> bool: ...
    def revoke_all_for_user(self, *, user_id: str) -> int: ...


# --- Connections ------------------------------------------------------------

@dataclass(frozen=True)
class ConnectionView:
    connection_id: str
    party_a: str                  # canonical low UUID
    party_b: str                  # canonical high UUID
    relationship_kind: str        # primary | backup
    status: str                   # active | revoked | ...
    generation: int               # current generation (increments on reconnect)
    revision: int


@runtime_checkable
class ConnectionReader(Protocol):
    """Owner: F01. Read-only current-state queries for other modules."""

    def active_connection_between(self, *, user_a: str, user_b: str) -> Optional[ConnectionView]:
        """Only status=active connections count; deny by default."""
        ...

    def get_connection(self, *, connection_id: str) -> Optional[ConnectionView]: ...

    def list_active_for_user(self, *, user_id: str) -> Iterable[ConnectionView]: ...


# --- Access policy / grants -------------------------------------------------

@dataclass(frozen=True)
class GrantView:
    grant_id: str
    item_type: str                # mood_entry | journal_page
    item_id: str
    recipient_id: str
    approved_revision: int
    connection_id: str
    connection_generation: int
    revoked_at: Optional[dt.datetime] = None


@runtime_checkable
class AccessPolicy(Protocol):
    """Owner: F15. Deny-by-default object/item authorization (SEC-03/08)."""

    def can_view_item(self, *, owner_id: str, item_type: str, item_id: str,
                      recipient_id: str, revision: int) -> bool:
        """True only when an unrevoked grant covers exactly
        (item, recipient, approved_revision) AND the owning connection is
        active at its current generation. Edits invalidate grants."""
        ...

    def active_grants_for_recipient(self, *, owner_id: str, item_type: str,
                                    recipient_id: str) -> Iterable[GrantView]: ...

    def assert_can_view(self, *, owner_id: str, item_type: str, item_id: str,
                        recipient_id: str, revision: int) -> None:
        """Raise NotAuthorized/NotFound; must not leak existence beyond policy."""
        ...


# --- Messaging transport ----------------------------------------------------

@dataclass(frozen=True)
class SentMessage:
    message_id: str
    sender_id: str
    recipient_id: str
    kind: str                     # text | emotion_card | journal_reply |
                                  # mood_reply | listening_signal | quick_reply
    approved_body: str
    idempotency_key: str
    payload_hash_hex: str
    connection_id: str
    connection_generation: int
    created_at: dt.datetime
    reply_to: Optional[str] = None


@runtime_checkable
class MessageTransport(Protocol):
    """Owner: F05. The ONE send path for messages (F03/F04/F10 must reuse it;
    no second message table/endpoint anywhere)."""

    def send(self, *, sender_id: str, recipient_id: str, kind: str,
             approved_body: str, idempotency_key: str,
             payload_hash_hex: str, reply_to: Optional[str] = None,
             context: Optional[Mapping[str, Any]] = None) -> SentMessage:
        """Guards enforced here: active connection/current generation,
        cooldown check for pause-bound drafts (listening_signal exempt),
        idempotency replay/mismatch, allowlisted kinds. Explicit send only."""
        ...

    def mark_read(self, *, message_id: str, actor_id: str,
                  at: Optional[dt.datetime] = None) -> bool:
        """Only the real recipient may set read_at; idempotent; earliest kept."""
        ...

    def lookup_by_idempotency_key(self, *, sender_id: str,
                                  idempotency_key: str) -> Optional[SentMessage]:
        """Operation-status lookup for unknown outcomes (same key only)."""
        ...


# --- Published content ------------------------------------------------------

@dataclass(frozen=True)
class PublishedContent:
    content_id: str
    content_key: str
    kind: str                     # content kind registry (cards, prompts, ...)
    revision: int
    title: str
    body: str
    audience: str                 # student | caregiver | joint | neutral
    published_at: dt.datetime
    extra: Dict[str, Any] = field(default_factory=dict)


@runtime_checkable
class PublishedContentReader(Protocol):
    """Owner: B16 content lifecycle (F02/F03/F08/F09 consume via this port).

    Only status=published, immutable revisions are returned; drafts never
    reach end users. Envelope fields are allowlisted per kind.
    """

    def get_published(self, *, content_key: str,
                      revision: Optional[int] = None) -> Optional[PublishedContent]: ...

    def list_published(self, *, kind: str, audience: Optional[str] = None,
                       limit: int = 50) -> Iterable[PublishedContent]: ...


# --- Directory / help -------------------------------------------------------

@dataclass(frozen=True)
class PublicContact:
    contact_id: str
    public_name: str
    phone: str
    operating_hours: str
    service_timezone: str
    contact_type: str             # school | help
    accepting_appointments: bool


@runtime_checkable
class DirectoryReader(Protocol):
    """Owner: B12/B13 content. Public verified contacts only (SEC-24)."""

    def list_public_contacts(self, *, contact_type: Optional[str] = None,
                             only_accepting_appointments: bool = False,
                             now: Optional[dt.datetime] = None) -> Iterable[PublicContact]: ...


# --- Research policy --------------------------------------------------------

@dataclass(frozen=True)
class ReportPolicy:
    policy_version: int
    minimum_group_size: Optional[int]   # None -> reports disabled (DEC-15)
    allowed_dimensions: tuple
    complementary_suppression: bool


@runtime_checkable
class ResearchPolicyReader(Protocol):
    """Owner: B14. Unset/unapproved policy => fail closed (no reports)."""

    def current_policy(self, *, cohort_id: str) -> Optional[ReportPolicy]: ...


# --- Admin capabilities -----------------------------------------------------

@runtime_checkable
class AdminCapabilityChecker(Protocol):
    """Owner: B16. Named capabilities + scope + TTL (WF-14, SEC-04).
    is_staff/superuser/user role strings NEVER satisfy this interface."""

    def has_capability(self, *, actor_id: str, capability: str,
                       scope_type: str, scope_ref: Optional[str] = None,
                       at: Optional[dt.datetime] = None) -> bool: ...


# --- Clock ------------------------------------------------------------------

@runtime_checkable
class Clock(Protocol):
    """Server clock (cooldown 300s must use server time, DEC-03)."""

    def now(self) -> dt.datetime: ...


class SystemClock:
    def now(self) -> dt.datetime:
        return utcnow()


# --- Audit ------------------------------------------------------------------

@runtime_checkable
class AuditWriter(Protocol):
    """Owner: B16/B17. Minimal redacted events (SEC-22); never body/token."""

    def record(self, *, actor_id: str, action: str, target_ref: str,
               outcome: str, reason: Optional[str] = None,
               metadata: Optional[Mapping[str, Any]] = None) -> str: ...


# --- Deletion hooks ---------------------------------------------------------

@runtime_checkable
class DeletionHook(Protocol):
    """Owner: F15 coordinates; every domain registers one hook (WF-21)."""

    def apply_user_deletion(self, *, user_id: str,
                            requested_at: dt.datetime) -> Dict[str, Any]:
        """Return truthful outcome dict; partial failures must be reported,
        never silently swallowed or reported as completed."""
        ...
