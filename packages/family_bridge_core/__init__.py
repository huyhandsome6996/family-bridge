"""Family Bridge core package — shared contracts for all feature modules.

Scope (B00 baseline):
- Stable error codes and typed errors (docs/contracts/api-foundation.md).
- DTO/dataclasses and Protocol interfaces (ports) for cross-module dependency
  injection without importing other features' implementations.
- Explicit feature registry (allowlist) — no plugin upload/eval.
- Validation helpers with fixed bounds (DSA-01; DEC-17 proposals, synthetic dev).
- Idempotency payload hash helpers (SEC-07).
- Minimal audit event builder with redaction guard (SEC-22).

Rules:
- No Django model or User duplication. Production User is referenced via
  settings.AUTH_USER_MODEL only (test harness provides a test-only user).
- No production login bypass. No allow-all policy. Default deny everywhere.
- This package must stay importable without Django for unit tests of pure
  helpers; Django/DRF-dependent helpers live in family_bridge_core.drf.
"""

__all__ = ["errors", "dto", "protocols", "registry", "validation",
           "idempotency", "audit", "drf", "timeutils"]
