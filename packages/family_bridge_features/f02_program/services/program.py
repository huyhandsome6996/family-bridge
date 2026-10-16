"""F02 service: voluntary 4-week program with version pinning."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from django.db import transaction

from family_bridge_core.errors import (
    InputInvalid, ModuleUnavailable, NotFound,
)

from ..models import (
    AGREEMENT_CONFIRMED, AGREEMENT_LIVE_STATUSES, AGREEMENT_PROPOSED,
    AGREEMENT_TERMINAL_STATUSES, AgreementAcceptance, Enrollment,
    FamilyAgreement, WeekProgress,
)
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
        # R3: a pinned enrollment must stay readable regardless of how many
        # newer releases exist. Providers MAY expose an exact
        # (program_key, revision) getter — one bounded candidate row —
        # which does not depend on the bounded catalog window. Providers
        # without it keep the bounded catalog scan (<=10 entries).
        if revision is not None:
            getter = getattr(self._provider(), "get_program", None)
            if callable(getter):
                program = _safe_program(getter(
                    program_key=str(program_key), revision=int(revision)))
                if (program is not None
                        and program["program_key"] == str(program_key)
                        and program["revision"] == int(revision)):
                    return program
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
        # Progress is pinned to the enrollment revision: a reused
        # activity_key in a NEWER revision must NOT inherit old status.
        progress = {row.activity_key: row.status for row in
                    WeekProgress.objects.filter(
                        participant_id=str(participant_id),
                        program_key=str(program_key),
                        program_revision=enrollment.program_revision)}
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
                program_revision=enrollment.program_revision,
                activity_key=str(activity_key)).delete()
            row = WeekProgress(participant_id=str(participant_id),
                               program_key=str(program_key),
                               program_revision=enrollment.program_revision,
                               week_no=int(week_no),
                               activity_key=str(activity_key),
                               status="reset", updated_at=_now())
            return row  # not persisted (reset = cleared)
        progress, _ = WeekProgress.objects.update_or_create(
            participant_id=str(participant_id), program_key=str(program_key),
            activity_key=str(activity_key),
            program_revision=enrollment.program_revision,
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

    # -- week-4 family agreement instance (pair-bound) -----------------------------
    def _active_connection(self, *, participant_id: str,
                           required: bool = True):
        reader = registry.get_connection_reader()
        if reader is None or not hasattr(reader, "active_connection_for"):
            raise ModuleUnavailable({"reason": "connection_reader_not_wired"})
        connection = reader.active_connection_for(user_id=str(participant_id))
        if connection is None and required:
            raise InputInvalid({"reason": "no_active_connection"})
        return connection

    def _active_enrollment(self, *, participant_id: str,
                           program_key: str) -> Enrollment:
        enrollment = Enrollment.objects.filter(
            participant_id=str(participant_id), program_key=str(program_key),
            active=True).first()
        if enrollment is None:
            raise NotFound({"reason": "enrollment_not_found"})
        return enrollment

    def _pair_ids(self, my_id: str, counterpart_id: str) -> tuple:
        low, high = sorted([str(my_id), str(counterpart_id)])
        return low, high

    @transaction.atomic
    def agreement_overview(self, *, participant_id: str,
                           program_key: str) -> Dict[str, Any]:
        """Agreement instances of MY pair + program for the CURRENT
        connection generation, with the pinned content's template so both
        sides read the same commitments.

        R2: `agreement` is the row the UI should treat as authoritative
        (current CONFIRMED first, else the newest live/proposed one, else
        the newest row of any status). `effective_agreement` and
        `pending_proposal` separate the two so a pending revision can
        never hide the confirmed one still in force."""
        enrollment = self._active_enrollment(
            participant_id=str(participant_id), program_key=str(program_key))
        program = self._published(program_key, enrollment.program_revision)
        connection = self._active_connection(participant_id=participant_id)
        low_id, high_id = self._pair_ids(
            str(participant_id), connection["counterpart_id"])
        pair_filter = {
            "program_key": str(program_key),
            "party_low_id": low_id, "party_high_id": high_id,
            "connection_generation": int(connection["generation"]),
        }
        confirmed = (FamilyAgreement.objects.filter(
            **pair_filter, status=AGREEMENT_CONFIRMED)
            .order_by("-created_at", "-id").first())
        pending = (FamilyAgreement.objects.filter(
            **pair_filter, status=AGREEMENT_PROPOSED)
            .order_by("-created_at", "-id").first())
        if confirmed is not None:
            primary = confirmed
        elif pending is not None:
            primary = pending
        else:
            primary = (FamilyAgreement.objects.filter(**pair_filter)
                       .order_by("-created_at", "-id").first())
        return {
            "program_revision": enrollment.program_revision,
            "agreement_template": program["agreement"],
            "connection_generation": int(connection["generation"]),
            "other_party_id": connection["counterpart_id"],
            "agreement": primary.view(viewer_id=str(participant_id))
            if primary else None,
            "effective_agreement": confirmed.view(viewer_id=str(participant_id))
            if confirmed else None,
            "pending_proposal": pending.view(viewer_id=str(participant_id))
            if pending else None,
        }

    @transaction.atomic
    def propose_family_agreement(self, *, participant_id: str,
                                 program_key: str) -> Dict[str, Any]:
        """Draft -> Proposed (docs four-week-flow): one side proposes the
        agreement of THEIR pinned revision for the CURRENT connection
        generation. Same revision re-propose is idempotent; proposing a
        NEW revision supersedes only the pair's PENDING proposals of older
        revisions. A CONFIRMED agreement stays in force until the new
        revision is confirmed by BOTH sides (supersede happens in
        confirm_family_agreement) or is ended upstream (R2).
        """
        enrollment = self._active_enrollment(
            participant_id=str(participant_id), program_key=str(program_key))
        program = self._published(program_key, enrollment.program_revision)
        agreement = program["agreement"]
        connection = self._active_connection(participant_id=participant_id)
        low_id, high_id = self._pair_ids(
            str(participant_id), connection["counterpart_id"])
        role = self._role_of(participant_id=str(participant_id),
                             other_id=connection["counterpart_id"])
        pair_filter = {
            "program_key": str(program_key),
            "party_low_id": low_id, "party_high_id": high_id,
            "connection_generation": int(connection["generation"]),
        }
        existing = FamilyAgreement.objects.filter(
            agreement_revision=agreement["revision"],
            **pair_filter).first()
        if existing is not None:
            if existing.status in AGREEMENT_LIVE_STATUSES:
                return existing.view(viewer_id=str(participant_id))
            # terminal (withdrawn/superseded/ended) -> re-propose reuses the
            # slot only for the SAME revision AND only while no OTHER live
            # instance of the pair exists (state machine: a superseded row
            # gave way to a newer confirmed revision — reviving it under a
            # live confirmed revision would create two effective agreements).
            other_live = FamilyAgreement.objects.filter(
                **pair_filter,
                status__in=AGREEMENT_LIVE_STATUSES).exclude(
                pk=existing.pk).exists()
            if other_live:
                raise InputInvalid({"reason": "agreement_revision_outdated",
                                    "agreement_revision":
                                        agreement["revision"]})
            existing.status = AGREEMENT_PROPOSED
            existing.proposed_by = str(participant_id)
            existing.proposed_by_role = role
            existing.proposer_confirmed_at = None
            existing.counterpart_confirmed_at = None
            existing.counterpart_role = ""
            existing.updated_at = _now()
            existing.save(update_fields=[
                "status", "proposed_by", "proposed_by_role",
                "proposer_confirmed_at", "counterpart_confirmed_at",
                "counterpart_role", "updated_at"])
            return existing.view(viewer_id=str(participant_id))
        # Re-propose on a NEW revision supersedes the pair's PENDING
        # proposals of older revisions (state machine: Proposed ->
        # Superseded when a replacement proposal is created). CONFIRMED
        # instances stay in force — they are superseded only when the new
        # revision reaches confirmed (R2).
        FamilyAgreement.objects.filter(
            **pair_filter,
            status=AGREEMENT_PROPOSED).exclude(
            agreement_revision=agreement["revision"]).update(
            status="superseded", updated_at=_now())
        instance = FamilyAgreement.objects.create(
            program_key=str(program_key),
            program_revision=enrollment.program_revision,
            agreement_revision=agreement["revision"],
            connection_generation=int(connection["generation"]),
            party_low_id=low_id, party_high_id=high_id,
            proposed_by=str(participant_id), proposed_by_role=role,
            commitments=list(agreement.get("commitments") or []),
            status=AGREEMENT_PROPOSED)
        return instance.view(viewer_id=str(participant_id))

    @transaction.atomic
    def confirm_family_agreement(self, *, participant_id: str,
                                 agreement_id: str) -> Dict[str, Any]:
        """Each side confirms for themselves; confirmed only when the two
        DIFFERENT actors of the pair confirmed the SAME revision row.
        Requires: membership, active connection of the SAME generation,
        active enrollment pinning the same program_revision."""
        instance = (FamilyAgreement.objects.select_for_update()
                    .filter(pk=agreement_id).first())
        if instance is None or not instance.is_member(str(participant_id)):
            raise NotFound({"reason": "agreement_not_found"})
        if instance.status in AGREEMENT_TERMINAL_STATUSES:
            raise InputInvalid({"reason": "agreement_not_confirmable",
                                "status": instance.status})
        if instance.status == AGREEMENT_CONFIRMED:
            raise InputInvalid({"reason": "agreement_not_confirmable",
                                "status": instance.status})
        connection = self._active_connection(participant_id=participant_id)
        if int(connection["generation"]) != instance.connection_generation:
            raise InputInvalid({"reason": "connection_changed"})
        low_id, high_id = self._pair_ids(
            str(participant_id), connection["counterpart_id"])
        if (low_id, high_id) != (instance.party_low_id, instance.party_high_id):
            raise InputInvalid({"reason": "connection_changed"})
        enrollment = self._active_enrollment(
            participant_id=str(participant_id),
            program_key=instance.program_key)
        if enrollment.program_revision != instance.program_revision:
            raise InputInvalid({"reason": "revision_mismatch",
                                "my_revision": enrollment.program_revision,
                                "agreement_revision":
                                    instance.agreement_revision})
        now = _now()
        if str(participant_id) == str(instance.proposed_by):
            if instance.proposer_confirmed_at is not None:
                raise InputInvalid({"reason": "already_confirmed_by_you"})
            instance.proposer_confirmed_at = now
        else:
            if instance.counterpart_confirmed_at is not None:
                raise InputInvalid({"reason": "already_confirmed_by_you"})
            instance.counterpart_confirmed_at = now
            instance.counterpart_role = self._role_of(
                participant_id=str(participant_id),
                other_id=instance.proposed_by)
        if (instance.proposer_confirmed_at is not None
                and instance.counterpart_confirmed_at is not None):
            instance.status = AGREEMENT_CONFIRMED
            # Confirmed -> Superseded: the pair's older live instances give
            # way to the newly confirmed revision.
            FamilyAgreement.objects.filter(
                program_key=instance.program_key,
                party_low_id=instance.party_low_id,
                party_high_id=instance.party_high_id,
                connection_generation=instance.connection_generation,
                status__in=AGREEMENT_LIVE_STATUSES).exclude(
                pk=instance.pk).update(status="superseded", updated_at=now)
        instance.updated_at = now
        instance.save()
        return instance.view(viewer_id=str(participant_id))

    @transaction.atomic
    def withdraw_family_agreement(self, *, participant_id: str,
                                  agreement_id: str) -> Dict[str, Any]:
        """Proposer-only withdraw while still proposed (state machine:
        Proposed -> Withdrawn)."""
        instance = (FamilyAgreement.objects.select_for_update()
                    .filter(pk=agreement_id).first())
        if instance is None or not instance.is_member(str(participant_id)):
            raise NotFound({"reason": "agreement_not_found"})
        if str(participant_id) != str(instance.proposed_by):
            raise InputInvalid({"reason": "only_proposer_can_withdraw"})
        if instance.status != AGREEMENT_PROPOSED:
            raise InputInvalid({"reason": "agreement_not_open",
                                "status": instance.status})
        from ..models import AGREEMENT_WITHDRAWN
        instance.status = AGREEMENT_WITHDRAWN
        instance.updated_at = _now()
        instance.save(update_fields=["status", "updated_at"])
        return instance.view(viewer_id=str(participant_id))

    @staticmethod
    def _role_of(*, participant_id: str, other_id: str) -> str:
        """Role of participant vs the other side of a class pair. The pair is
        one student + one caregiver; resolve via F16 ClassAccount roles
        (lazy import, same ownership idiom as F16 reading F01). If the F16
        app is not installed (partial feature runs), fall back by position
        — roles here are informational (display), never authorization."""
        try:
            from family_bridge_features.f16_classroom.models import ClassAccount
            row = (ClassAccount.objects.filter(user_id=str(participant_id))
                   .values_list("role", flat=True).first())
            if row in ("student", "caregiver"):
                return row
            other = (ClassAccount.objects.filter(user_id=str(other_id))
                     .values_list("role", flat=True).first())
            if other in ("student", "caregiver"):
                return "caregiver" if other == "student" else "student"
        except Exception:  # partial harness runs without F16 installed
            pass
        return "student"
