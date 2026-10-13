"""Published consent policy versions — the SINGLE server-side source (A05).

Contract: the Mini App mirrors these versions in
``zalo-mini-app/src/core/policy.js``. A consent decision is only meaningful
for the version published here; a client sending any other version string
(including an unpublished or already-retired one) gets a 400 instead of a
silent ledger entry that later looks like consent.

Scope guard (A05/F01): this registry only covers the three F01 consent
purposes. It does NOT approve legal text, does not constitute policy
review, and AI/research stay OPTIONAL — only ``service`` gates
connection-forming actions (create/claim/confirm). Any display of policy
content must render the real published text, not just the version label.
"""

from __future__ import annotations

CURRENT_POLICY_VERSIONS = {
    "service": "service-v1",
    "ai_processing": "ai-v1",
    "research": "research-v1",
}

# Purpose that gates F01 connection-forming actions (create/claim/confirm).
SERVICE_CONSENT_PURPOSE = "service"


def is_current_version(purpose: str, policy_version) -> bool:
    """True when `policy_version` is the published current version."""
    if not isinstance(policy_version, str):
        return False
    return CURRENT_POLICY_VERSIONS.get(purpose) == policy_version


__all__ = [
    "CURRENT_POLICY_VERSIONS",
    "SERVICE_CONSENT_PURPOSE",
    "is_current_version",
]
