"""F14 service: consent, typed responses, k-suppressed aggregate reports."""

from __future__ import annotations

import statistics
from typing import Any, Dict, List, Optional

from django.db import transaction

from family_bridge_core.errors import (
    ConsentRequired, InputInvalid, NotFound, ReportPolicyUnset,
)
from family_bridge_core.timeutils import UTC

from ..models import (
    CONSENT_GRANTED, PHASES, QUESTION_KINDS, PURPOSES, ResearchConsent,
    SurveyResponse,
)
from . import registry


def _now():
    import datetime as dt
    return dt.datetime.now(tz=UTC)


def _safe_form(raw: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, dict) or raw.get("status") != "published":
        return None
    for key in ("form_key", "revision", "title", "audience", "phase",
                "questions"):
        if key not in raw:
            return None
    if raw.get("phase") not in ("pre", "post", "pre_post"):
        return None
    questions = []
    for q in (raw.get("questions") or [])[:20]:
        if not isinstance(q, dict):
            continue
        if q.get("kind") not in QUESTION_KINDS:
            # NO free-text kinds, ever, until a protocol approves: a form
            # containing one is rejected ENTIRELY (fail closed).
            return None
        questions.append({
            "q_key": str(q["q_key"])[:32],
            "kind": str(q["kind"])[:16],
            "required": bool(q.get("required", False)),
            "choices": [str(c)[:40]
                        for c in (q.get("choices") or [])[:8]],
        })
    return {
        "form_key": str(raw["form_key"])[:64],
        "revision": int(raw["revision"]),
        "title": str(raw["title"])[:120],
        "audience": str(raw["audience"])[:16],
        "cohort": str(raw.get("cohort", "default"))[:32],
        "phase": str(raw["phase"])[:8],
        "questions": questions,
    }


class SurveyService:
    # -- forms -------------------------------------------------------------------
    def forms(self) -> List[Dict[str, Any]]:
        provider = registry.get_form_provider()
        if provider is None:
            return []
        out = []
        for raw in (provider.list_forms() or [])[:10]:
            form = _safe_form(raw)
            if form is not None:
                out.append(form)
        return out

    def _published_form(self, form_key: str, revision: int) -> Dict[str, Any]:
        for form in self.forms():
            if (form["form_key"] == str(form_key)
                    and form["revision"] == int(revision)):
                return form
        raise NotFound({"reason": "form_not_published"})

    # -- consent -----------------------------------------------------------------
    def consent_status(self, *, participant_id: str) -> Dict[str, Any]:
        rows = ResearchConsent.objects.filter(
            participant_id=str(participant_id), purpose__in=PURPOSES)
        return {"consents": [row.view() for row in rows],
                "note": "Từ chối/rút đồng ý không ảnh hưởng tính năng khác."}

    @transaction.atomic
    def set_consent(self, *, participant_id: str, purpose: str,
                    decision: str) -> ResearchConsent:
        if purpose not in PURPOSES:
            raise InputInvalid({"field": "purpose",
                                "reason": "purpose_not_allowed"})
        if decision not in ("grant", "withdraw"):
            raise InputInvalid({"field": "decision",
                                "reason": "invalid_decision"})
        consent, _ = ResearchConsent.objects.get_or_create(
            participant_id=str(participant_id), purpose=purpose,
            defaults={"status": "withdrawn"})
        now = _now()
        if decision == "grant":
            consent.status = CONSENT_GRANTED
            consent.granted_at = now
            consent.withdrawn_at = None
            consent.consent_version += 1 if consent.granted_at else 0
        else:
            consent.status = "withdrawn"
            consent.withdrawn_at = now
        consent.updated_at = now
        consent.save()
        return consent

    def _has_active_consent(self, participant_id: str) -> bool:
        return ResearchConsent.objects.filter(
            participant_id=str(participant_id),
            purpose=PURPOSES[0], status=CONSENT_GRANTED).exists()

    # -- responses -----------------------------------------------------------------
    @transaction.atomic
    def submit(self, *, participant_id: str, form_key: str, form_revision: int,
               phase: str, answers: Dict[str, Any]) -> SurveyResponse:
        if not self._has_active_consent(str(participant_id)):
            raise ConsentRequired({"reason": "research_consent_required"})
        form = self._published_form(form_key, form_revision)
        if phase not in PHASES:
            raise InputInvalid({"field": "phase", "reason": "invalid_phase"})
        if form["phase"] != "pre_post" and form["phase"] != phase:
            raise InputInvalid({"field": "phase",
                                "reason": "phase_not_allowed_for_form"})
        validated: Dict[str, Any] = {}
        spec = {q["q_key"]: q for q in form["questions"]}
        if set(answers or {}) - set(spec):
            raise InputInvalid({"reason": "unknown_question"})
        for q_key, question in spec.items():
            value = (answers or {}).get(q_key)
            if value is None:
                if question["required"]:
                    raise InputInvalid({"field": q_key, "reason": "required"})
                continue
            if question["kind"] == "scale_1_5":
                if isinstance(value, bool) or not isinstance(value, int) \
                        or not 1 <= value <= 5:
                    raise InputInvalid({"field": q_key,
                                        "reason": "must_be_int_1_5"})
                validated[q_key] = value
            elif question["kind"] == "choice":
                if value not in question["choices"]:
                    raise InputInvalid({"field": q_key,
                                        "reason": "invalid_choice"})
                validated[q_key] = value
            elif question["kind"] == "number":
                if isinstance(value, bool) or not isinstance(value, (int, float)) \
                        or not 0 <= float(value) <= 100000:
                    raise InputInvalid({"field": q_key,
                                        "reason": "must_be_bounded_number"})
                validated[q_key] = value
        if SurveyResponse.objects.filter(
                participant_id=str(participant_id), form_key=str(form_key),
                phase=phase).exists():
            raise InputInvalid({"reason": "already_submitted"})
        return SurveyResponse.objects.create(
            participant_id=str(participant_id), form_key=str(form_key),
            form_revision=int(form_revision), phase=phase,
            answers=validated)

    # -- aggregate report (DEC-15 gated, k-suppressed, no raw) -------------------
    def report(self, *, form_key: str, form_revision: int,
               phase: Optional[str]) -> Dict[str, Any]:
        form = self._published_form(form_key, form_revision)
        policy_reader = registry.get_policy_reader()
        if policy_reader is None:
            raise ReportPolicyUnset({"reason": "report_policy_unset"})
        policy = policy_reader.current_policy(cohort_id=form["cohort"])
        if policy is None or policy.minimum_group_size is None:
            raise ReportPolicyUnset({"reason": "report_policy_unset"})

        # consent-active participants ONLY (withdrawal effective immediately)
        active_ids = set(ResearchConsent.objects.filter(
            status=CONSENT_GRANTED, purpose=PURPOSES[0])
            .values_list("participant_id", flat=True))
        responses = list(SurveyResponse.objects.filter(
            form_key=str(form_key), form_revision=int(form_revision)))
        responses = [r for r in responses if r.participant_id in active_ids]
        if phase:
            responses = [r for r in responses if r.phase == phase]

        k = policy.minimum_group_size
        groups: Dict[str, List[SurveyResponse]] = {}
        for row in responses:
            groups.setdefault(row.phase, []).append(row)
        # complementary suppression: if ANY group is below k, suppress ALL
        # groups of this dimension (a surviving group would be exact)
        any_small = any(len(rows) < k for rows in groups.values()) \
            if groups else True
        by_phase = {}
        for phase_name, rows in sorted(groups.items()):
            if any_small or len(rows) < k:
                by_phase[phase_name] = {"suppressed": True}
                continue
            by_phase[phase_name] = {
                "suppressed": False,
                "count": len(rows),
                "questions": self._question_stats(form, rows),
            }
        return {"form_key": form["form_key"],
                "form_revision": form["revision"],
                "policy_version": policy.policy_version,
                "minimum_group_size": k,
                "by_phase": by_phase,
                "note": "Chỉ số tổng hợp đã ẩn nhóm nhỏ; không có dữ liệu "
                        "thô hay định danh."}

    def _question_stats(self, form: Dict[str, Any],
                        rows: List[SurveyResponse]) -> List[Dict[str, Any]]:
        stats = []
        for question in form["questions"]:
            values = []
            for row in rows:
                value = (row.answers or {}).get(question["q_key"])
                if isinstance(value, (int, float)) and not isinstance(
                        value, bool):
                    values.append(float(value))
            entry: Dict[str, Any] = {"q_key": question["q_key"],
                                     "kind": question["kind"]}
            if question["kind"] == "choice":
                distribution: Dict[str, int] = {}
                for row in rows:
                    value = (row.answers or {}).get(question["q_key"])
                    if value is not None:
                        distribution[str(value)] = distribution.get(
                            str(value), 0) + 1
                entry["distribution"] = distribution
            elif values:
                entry["mean"] = round(statistics.fmean(values), 2)
            stats.append(entry)
        return stats

    # -- deletion hook (F15/WF-21) ------------------------------------------------
    @staticmethod
    def apply_user_deletion(*, user_id: str) -> Dict[str, Any]:
        responses, _ = SurveyResponse.objects.filter(
            participant_id=str(user_id)).delete()
        consents, _ = ResearchConsent.objects.filter(
            participant_id=str(user_id)).delete()
        return {"domain": "f14_surveys", "responses_deleted": responses,
                "consents_deleted": consents}
