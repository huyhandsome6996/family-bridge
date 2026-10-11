"""F02 service: voluntary 4-week program with version pinning."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from django.db import transaction

from family_bridge_core.errors import (
    InputInvalid, ModuleUnavailable, NotFound,
)

from ..models import AgreementAcceptance, Enrollment, WeekProgress
from . import registry


def _now():
    import datetime as dt
    from family_bridge_core.timeutils import UTC
    return dt.datetime.now(tz=UTC)


def _safe_program(raw: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, dict) or raw.get("status") != "published":
        return None
    for key in ("program_key", "revision", "title", "weeks", "agreement"):
        if key not in raw:
            return None
    weeks = raw.get("weeks") or []
    if not isinstance(weeks, list) or not (1 <= len(weeks) <= 8):
        return None
    agreement = raw.get("agreement") or {}
    if not isinstance(agreement, dict) or "revision" not in agreement:
        return None
    return {
        "program_key": str(raw["program_key"])[:64],
        "revision": int(raw["revision"]),
        "title": str(raw["title"])[:120],
        "weeks": [dict(w) for w in weeks],
        "agreement": {"revision": int(agreement["revision"]),
                      "title": str(agreement.get("title", ""))[:120],
                      "commitments": [str(c)[:200]
                                      for c in
                                      (agreement.get("commitments")
                                       or [])[:10]]},
    }


class ProgramService:
    def _provider(self):
        provider = registry.get_program_provider()
        if provider is None:
            raise ModuleUnavailable({"reason": "program_content_unwired"})
        return provider

    def catalog(self) -> List[Dict[str, Any]]:
        out = []
        for raw in (self._provider().list_programs() or []):
            program = _safe_program(raw)
            if program is not None:
                out.append(program)
        return out[:10]

    def _published(self, program_key: str,
                   revision: Optional[int] = None) -> Dict[str, Any]:
        for program in self.catalog():
            if (program["program_key"] == str(program_key)
                    and (revision is None
                         or program["revision"] == revision)):
                return program
        raise NotFound({"reason": "program_not_published"})

    # -- enrollment --------------------------------------------------------------
    @transaction.atomic
    def enroll(self, *, participant_id: str, program_key: str,
               program_revision: int) -> Enrollment:
        self._published(program_key, program_revision)
        enrollment, created = Enrollment.objects.get_or_create(
            participant_id=str(participant_id), program_key=str(program_key),
            defaults={"program_revision": int(program_revision),
                      "active": True})
        if not created:
            # EXPLICIT re-enroll: the participant chose a (possibly newer)
            # revision — re-pin deliberately; never a silent migration.
            enrollment.program_revision = int(program_revision)
            enrollment.active = True
            enrollment.updated_at = _now()
            enrollment.save()
        return enrollment

    @transaction.atomic
    def opt_out(self, *, participant_id: str, program_key: str) -> Enrollment:
        enrollment = Enrollment.objects.filter(
            participant_id=str(participant_id),
            program_key=str(program_key)).first()
        if enrollment is None or not enrollment.active:
            raise NotFound({"reason": "enrollment_not_found"})
        enrollment.active = False
        enrollment.updated_at = _now()
        enrollment.save(update_fields=["active", "updated_at"])
        return enrollment

    def my_enrollments(self, *, participant_id: str):
        return list(Enrollment.objects.filter(
            participant_id=str(participant_id)).order_by("-updated_at")[:10])

    # -- weeks (ALL published weeks accessible; suggestion never locks) ----------
    def weeks_for_me(self, *, participant_id: str,
                     program_key: str) -> Dict[str, Any]:
        enrollment = Enrollment.objects.filter(
            participant_id=str(participant_id), program_key=str(program_key),
            active=True).first()
        if enrollment is None:
            raise NotFound({"reason": "enrollment_not_found"})
        program = self._published(program_key,
                                  enrollment.program_revision)
        progress = {row.activity_key: row.status for row in
                    WeekProgress.objects.filter(
                        participant_id=str(participant_id),
                        program_key=str(program_key))}
        weeks = []
        suggested = None
        for week in program["weeks"]:
            activities = []
            week_done = True
            for key in week.get("joint_activity_keys", []):
                status = progress.get(str(key), "none")
                if status not in ("done", "skipped"):
                    week_done = False
                activities.append({"activity_key": str(key),
                                   "status": status})
            weeks.append({
                "week_no": week["week_no"], "title": week["title"],
                "goals": week.get("goals", []),
                "student_guide": week.get("student_guide", ""),
                "caregiver_guide": week.get("caregiver_guide", ""),
                "activities": activities, "locked": False,
                # voluntary: every week viewable regardless of progression
            })
            if suggested is None and not week_done:
                suggested = week["week_no"]
        acceptance = AgreementAcceptance.objects.filter(
            participant_id=str(participant_id), program_key=str(program_key),
            agreement_revision=program["agreement"]["revision"]).first()
        return {
            "program_key": program["program_key"],
            "pinned_revision": program["revision"],
            "agreement": {**program["agreement"],
                          "accepted_by_me": acceptance is not None},
            "suggested_week": suggested,  # suggestion only, never a lock
            "weeks": weeks,
            "note_paper_guide": "Bạn hoàn toàn có thể dùng sổ giấy — "
                                "không bắt đầu buộc ghi trong app.",
        }

    # -- progress ------------------------------------------------------------------
    @transaction.atomic
    def mark_activity(self, *, participant_id: str, program_key: str,
                      week_no: int, activity_key: str,
                      status: str) -> WeekProgress:
        enrollment = Enrollment.objects.filter(
            participant_id=str(participant_id), program_key=str(program_key),
            active=True).first()
        if enrollment is None:
            raise NotFound({"reason": "enrollment_not_found"})
        program = self._published(program_key, enrollment.program_revision)
        week = next((w for w in program["weeks"]
                     if w["week_no"] == int(week_no)), None)
        if week is None or str(activity_key) not in [
                str(k) for k in week.get("joint_activity_keys", [])]:
            raise InputInvalid({"field": "activity_key",
                                "reason": "not_in_pinned_program"})
        if status not in ("done", "skipped", "reset"):
            raise InputInvalid({"field": "status", "reason": "invalid_status"})
        if status == "reset":
            WeekProgress.objects.filter(
                participant_id=str(participant_id),
                program_key=str(program_key),
                activity_key=str(activity_key)).delete()
            row = WeekProgress(participant_id=str(participant_id),
                               program_key=str(program_key),
                               week_no=int(week_no),
                               activity_key=str(activity_key),
                               status="reset", updated_at=_now())
            return row  # not persisted (reset = cleared)
        progress, _ = WeekProgress.objects.update_or_create(
            participant_id=str(participant_id), program_key=str(program_key),
            activity_key=str(activity_key),
            defaults={"week_no": int(week_no), "status": status,
                      "updated_at": _now()})
        return progress

    # -- agreement ------------------------------------------------------------------
    @transaction.atomic
    def accept_agreement(self, *, participant_id: str,
                         program_key: str) -> Dict[str, Any]:
        """The participant accepts the agreement revision of THEIR pinned
        program. Same revision -> idempotent (UNIQUE). A re-published
        template means a NEW acceptance is required — old ones never carry."""
        enrollment = Enrollment.objects.filter(
            participant_id=str(participant_id), program_key=str(program_key),
            active=True).first()
        if enrollment is None:
            raise NotFound({"reason": "enrollment_not_found"})
        program = self._published(program_key, enrollment.program_revision)
        agreement_revision = program["agreement"]["revision"]
        acceptance, created = AgreementAcceptance.objects.get_or_create(
            participant_id=str(participant_id), program_key=str(program_key),
            agreement_revision=agreement_revision,
            defaults={"program_revision": enrollment.program_revision})
        return {"accepted": True, "created": created,
                "agreement_revision": agreement_revision,
                "accepted_at": acceptance.accepted_at.isoformat()}
