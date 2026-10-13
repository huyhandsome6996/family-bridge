"""Production consent writer for F15 over the F01 consent store (+ F14
research mapping).

Semantics (K4 / WF-17):
- ``service`` / ``ai_processing`` -> F01 ``ConsentRecord`` (latest active row
  is withdrawn; a withdrawal is recorded even when no row exists by writing a
  ``declined`` record, so the audit trail never implies acceptance).
- ``research`` -> withdraw BOTH the F01 research consent record AND the F14
  ``ResearchConsent`` (purpose ``pre_post_study``). Source of truth:
  F01 stores the general research consent for login-layer purposes; F14
  stores the survey-store consent that gates submission/report inclusion.
  Withdrawing research changes BOTH stores in one transaction so they can
  never contradict each other.

Downstream effects proven by tests: ``f01_identity.has_active_consent``
becomes False; F14 ``SurveyService.submit`` raises ``consent_required``.
Withdrawing research or AI consent NEVER locks basic service tools or help
(F13 stays public; DEC-08).
"""

from __future__ import annotations

import datetime as dt
from typing import Any, Dict

from django.db import transaction

from family_bridge_core.timeutils import UTC


def _now() -> dt.datetime:
    return dt.datetime.now(tz=UTC)


class ProductionConsentWriter:
    """Implements the F15 consent port: ``withdraw(*, user_id, purpose)``."""

    def withdraw(self, *, user_id: str, purpose: str) -> bool:
        if purpose == "research":
            return self._withdraw_research(user_id=str(user_id))
        return self._withdraw_f01(user_id=str(user_id), purpose=purpose)

    # -- helpers ------------------------------------------------------------------
    @staticmethod
    def _load_user(user_id: str):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        return User.objects.get(pk=str(user_id))

    @transaction.atomic
    def _withdraw_f01(self, *, user_id: str, purpose: str) -> bool:
        from family_bridge_features.f01_identity.models import ConsentRecord
        from family_bridge_features.f01_identity.services.identity import record_consent

        latest = ConsentRecord.latest_active(user_id, purpose)
        changed = False
        if latest is not None:
            changed = latest.withdraw()
        else:
            # No active consent to withdraw: still record the explicit
            # decision (declined) so the ledger never implies acceptance.
            record_consent(user=self._load_user(user_id), purpose=purpose,
                           policy_version="withdraw-no-version",
                           decision="declined", now=_now())
        return changed

    @transaction.atomic
    def _withdraw_research(self, *, user_id: str) -> bool:
        from family_bridge_features.f01_identity.models import ConsentRecord
        from family_bridge_features.f01_identity.services.identity import record_consent
        from family_bridge_features.f14_surveys.models import (
            CONSENT_WITHDRAWN, PURPOSE_PRE_POST, ResearchConsent,
        )

        changed = False
        latest = ConsentRecord.latest_active(user_id, "research")
        if latest is not None:
            changed = latest.withdraw() or changed
        else:
            record_consent(user=self._load_user(user_id), purpose="research",
                           policy_version="withdraw-no-version",
                           decision="declined", now=_now())

        consent, created = (ResearchConsent.objects
                            .get_or_create(participant_id=str(user_id),
                                           purpose=PURPOSE_PRE_POST,
                                           defaults={"status": CONSENT_WITHDRAWN}))
        if created:
            # No prior F14 consent row: the withdrawal state is recorded; the
            # F01 change above still decides "changed".
            pass
        elif consent.status != CONSENT_WITHDRAWN:
            consent.status = CONSENT_WITHDRAWN
            consent.withdrawn_at = _now()
            consent.updated_at = _now()
            consent.save(update_fields=["status", "withdrawn_at", "updated_at"])
            changed = True
        return changed


def consent_state_snapshot(*, user_id: str, purpose: str) -> Dict[str, Any]:
    """Read-only view used by tests/UI: latest active consent + withdrawn flag."""
    from family_bridge_features.f01_identity.models import ConsentRecord

    latest_active = ConsentRecord.latest_active(user_id, purpose)
    return {
        "purpose": purpose,
        "has_active_consent": latest_active is not None
        and latest_active.decision == "accepted",
    }
