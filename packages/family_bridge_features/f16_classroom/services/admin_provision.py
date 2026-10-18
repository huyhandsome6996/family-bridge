"""Cap phat/nap cap HS-PH do ADMIN thuc hien → Connection ACTIVE ngay
(bo sung 18/10/2026 — "admin-provisioned pairs", quyet dinh moi cua Huy,
supersede menh de "hai ben tu xac nhan" CHO DUNG che do cap phat lop hoc).

Nguyen tac bat dien:
- Admin TAO ket noi ho danh hoc sinh — KHONG gia hanh dong xac nhan cua
  nguoi dung: khong ghi consent, khong gia confirmed_at, khong tao grant.
  Connection tuong ung gan source="admin_provisioned" + source_admin +
  source_batch (provenance doc duoc — xem f01 Connection).
- Uy quyen: CHI admin co grant "classroom.provision" con hieu luc. Grant
  "global" mo rong moi lop; grant "school" chi dung cho dung class_ref
  (loc THAT trong AdminCapabilityService.has_capability — khong tin
  is_staff/superuser/client flag — SEC-04/WF-14).
- Idempotency: batch_ref (UUID do client tao) — submit lai cung batch_ref
  tra ve ket qua da luu, khong xu ly lai; re-apply khac batch_ref tren cung
  bo hang → "pair_already_active", khong bao gio nhan doi connection
  (uniq_active_pair + generation moi khi reconnect co chu y).
- KHONG hoi sinh: cap da revoke/unlink KHONG tu active lai khi nap lai
  roster; reconnect chi xay ra khi row co allow_reconnect=true (hanh vi
  admin co y thuc, tao generation moi, grant cu van revoked — FL-20).
- VALIDATE TRUOC, GHI SAU (provision path): bat ky row nao loi nghiem
  trang → khong ghi gi; tung row ghi trong savepoint rieng (loi 1 row
  khong lam chet batch).
- Han che: toi da MAX_ROWS_PER_APPLY row/lan; mat khau khoi tao >= 8 ky
  tu, chi dung cho tai khoan TAO MOI, khong bao gio tra ve trong response
  hay summary (SEC-19/22); tai khoan da co giu nguyen mat khau/ma/ten.
- Khong goi mang khi giu lock DB; khong UPDATE(status='active') toan bo
  bang — moi cap xu ly rieng theo bang chung ro rang.
"""

from __future__ import annotations

import datetime as dt
import re

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction

from family_bridge_core.errors import (
    InputInvalid, NotAuthorized, NotFound,
)
from family_bridge_core.timeutils import UTC

from ..models import (
    BATCH_MODE_BACKFILL, BATCH_MODE_PROVISION,
    PROPOSAL_OPEN_STATUSES, ClassAccount, CompanionProposal, PairProvisionBatch,
)
from .provisioning import LOGIN_CODE_RE, _username_for, MIN_INITIAL_PASSWORD_LENGTH

CAP_CLASSROOM_PROVISION = "classroom.provision"  # khop admin_core.CAP_CLASSROOM_PROVISION (CAP-23)

MAX_ROWS_PER_APPLY = 50  # MVP bound — ghi ro trong docs/features/f16 + admin UI
MAX_NAME_LENGTH = 80
MAX_EXTERNAL_REF_LENGTH = 128

ROW_WILL_CONNECT = "will_connect"
ROW_WILL_CREATE = "will_create_accounts_and_connect"
ROW_ALREADY_ACTIVE = "pair_already_active"
ROW_PENDING_TO_CLOSE = "pending_proposal_will_close_and_connect"
ROW_REVOKED = "pair_revoked"
ROW_REVOKED_RECONNECTABLE = "pair_revoked_reconnectable"

STATUS_CONNECTED = "connected"          # apply: tao moi thanh cong
STATUS_ALREADY = "already_active"       # apply: da active truoc do, giu nguyen
STATUS_RECONNECTED = "reconnected"      # apply: allow_reconnect=true, generation moi
STATUS_ERROR = "error"

_LOGIN_CODE_ERROR = "login_code_invalid"


def _now() -> dt.datetime:
    return dt.datetime.now(tz=UTC)


def _normalize_code(raw) -> str | None:
    if not isinstance(raw, str):
        return None
    normalized = raw.strip().upper()
    return normalized if LOGIN_CODE_RE.fullmatch(normalized) else None


def _clean_name(raw) -> str:
    if not isinstance(raw, str):
        return ""
    return " ".join(raw.split())


# ---------------------------------------------------------------------------
# Uy quyen + scope
# ---------------------------------------------------------------------------

def _admin_grants(admin_id: str):
    """Grant con hieu luc cua admin cho capability classroom.provision."""
    from family_bridge_features.admin_core.models import AdminCapabilityGrant
    return list(AdminCapabilityGrant.objects.filter(
        user_id=str(admin_id), capability=CAP_CLASSROOM_PROVISION,
        revoked_at__isnull=True))


def admin_scope(admin_id) -> tuple[bool, set[str]]:
    """Tra (is_global, allowed_class_refs). Grant school → scope_ref."""
    is_global = False
    refs: set[str] = set()
    now = _now()
    for grant in _admin_grants(admin_id):
        if not grant.is_active(now=now):
            continue
        if grant.scope_type == "global":
            is_global = True
        elif grant.scope_type == "school" and grant.scope_ref:
            refs.add(grant.scope_ref)
    return is_global, refs


def require_class_scope(admin_user, *, class_ref: str) -> None:
    """404 khi khong co grant nao (khong biet le nhu admin_core), 403 khi
    co grant nhung ngoai pham vi lop yeu cau."""
    if not _admin_grants(admin_user.pk):
        raise NotFound({"reason": "not_found"})
    is_global, refs = admin_scope(admin_user.pk)
    if not is_global and class_ref not in refs:
        raise NotAuthorized({"reason": "class_out_of_scope"})


def list_classes(admin_user) -> list[dict]:
    """Danh sach lop trong pham vi cua admin (bounded, khong N+1)."""
    is_global, refs = admin_scope(admin_user.pk)
    if not is_global and not refs:
        return []
    qs = ClassAccount.objects.all()
    if not is_global:
        qs = qs.filter(class_ref__in=refs)
    classes: dict[str, dict] = {}
    for row in qs.values("class_ref", "role").order_by("class_ref"):
        bucket = classes.setdefault(row["class_ref"], {
            "class_ref": row["class_ref"], "students": 0, "caregivers": 0})
        if row["role"] == "student":
            bucket["students"] += 1
        else:
            bucket["caregivers"] += 1
    results = sorted(classes.values(), key=lambda item: item["class_ref"])
    for bucket in results:
        _augment_counts(bucket)
    return results


def _augment_counts(bucket: dict) -> None:
    """Dem pending proposals + active pairs theo lop (2 query/lop, bounded
    boi so lop trong pham vi admin)."""
    bucket["pending_proposals"] = CompanionProposal.objects.filter(
        student_account__class_ref=bucket["class_ref"],
        status__in=PROPOSAL_OPEN_STATUSES).count()


# ---------------------------------------------------------------------------
# Doc tai khoan theo ma
# ---------------------------------------------------------------------------

def _resolve_account(code: str, role: str) -> ClassAccount | None:
    return (ClassAccount.objects.select_related("user")
            .filter(login_code=code, role=role).first())


def _code_role_owner(code: str) -> ClassAccount | None:
    """Tai khoan dang so huu ma (bat ke role) — de bao loi dung nghia."""
    return (ClassAccount.objects.select_related("user")
            .filter(login_code=code).first())


def _pair_state(student: ClassAccount, caregiver: ClassAccount) -> dict:
    """Trang thai hien tai cua cap: active/revoke/pending proposal."""
    from family_bridge_features.f01_identity.models import (
        CONNECTION_ACTIVE, CONNECTION_REVOKED, Connection,
    )
    low_id, high_id = sorted([str(student.user_id), str(caregiver.user_id)])
    latest = (Connection.objects.filter(party_low_id=low_id, party_high_id=high_id)
              .order_by("-generation").first())
    active = bool(latest and latest.status == CONNECTION_ACTIVE)
    revoked = bool(latest and latest.status == CONNECTION_REVOKED)
    proposal = (CompanionProposal.objects
                .filter(student_account=student, caregiver_account=caregiver,
                        status__in=PROPOSAL_OPEN_STATUSES)
                .order_by("-updated_at").first())
    return {"latest": latest, "active": active, "revoked": revoked,
            "proposal": proposal}


# ---------------------------------------------------------------------------
# Row parsing + validation (dung chung preview/apply)
# ---------------------------------------------------------------------------

def _parse_rows(raw_rows) -> list[dict]:
    if not isinstance(raw_rows, list) or not raw_rows:
        raise InputInvalid({"field": "rows", "reason": "must_be_non_empty_list"})
    if len(raw_rows) > MAX_ROWS_PER_APPLY:
        raise InputInvalid({
            "field": "rows", "reason": "too_many_rows",
            "max": MAX_ROWS_PER_APPLY})
    parsed = []
    for index, raw in enumerate(raw_rows):
        if not isinstance(raw, dict):
            raise InputInvalid({"field": f"rows[{index}]",
                                "reason": "must_be_object"})
        parsed.append({
            "index": index,
            "caregiver_code": _normalize_code(raw.get("caregiver_code")),
            "student_code": _normalize_code(raw.get("student_code")),
            "caregiver_name": _clean_name(raw.get("caregiver_name")),
            "student_name": _clean_name(raw.get("student_name")),
            "caregiver_external_ref": str(raw.get("caregiver_external_ref") or "").strip()[:MAX_EXTERNAL_REF_LENGTH],
            "student_external_ref": str(raw.get("student_external_ref") or "").strip()[:MAX_EXTERNAL_REF_LENGTH],
            "allow_reconnect": raw.get("allow_reconnect") is True,
        })
    return parsed


def _classify_row(row: dict, *, class_ref: str, is_global_scope: bool,
                  creating: set[str]) -> dict:
    """Tra {status, caregiver?: ClassAccount, student?: ClassAccount,
    problems: [str], to_create: [role...]} — doc-only."""
    problems: list[str] = []
    if row["caregiver_code"] is None:
        problems.append("caregiver_" + _LOGIN_CODE_ERROR)
    if row["student_code"] is None:
        problems.append("student_" + _LOGIN_CODE_ERROR)
    if problems:
        return {"status": STATUS_ERROR, "problems": problems,
                "to_create": []}

    if row["caregiver_code"] == row["student_code"]:
        return {"status": STATUS_ERROR, "problems": ["same_account"],
                "to_create": []}

    resolved: dict[str, ClassAccount | None] = {}
    to_create: list[str] = []
    for role_key, role in (("caregiver", "caregiver"), ("student", "student")):
        code = row[f"{role_key}_code"]
        account = _resolve_account(code, role)
        if account is None:
            owner = _code_role_owner(code)
            if owner is not None:
                problems.append(f"{role_key}_code_role_mismatch")
                continue
            if code in creating:
                problems.append(f"{role_key}_duplicate_in_batch")
                continue
            name = row[f"{role_key}_name"]
            if not name or len(name) > MAX_NAME_LENGTH:
                problems.append(f"{role_key}_name_required_for_new_account")
            to_create.append(role_key)
            resolved[role_key] = None
            continue
        resolved[role_key] = account
        if not is_global_scope and account.class_ref != class_ref:
            problems.append(f"{role_key}_account_out_of_scope")
        if not account.user.is_active:
            problems.append(f"{role_key}_account_inactive")

    # Moi problem nghiem trang → error (bao gom role mismatch/inactive/
    # ngoai pham vi/thieu ten khi tao moi) — KHONG bao gio coi la "sach".
    if problems:
        return {"status": STATUS_ERROR, "problems": problems,
                "to_create": to_create,
                "student": resolved.get("student"),
                "caregiver": resolved.get("caregiver")}

    student = resolved.get("student")
    caregiver = resolved.get("caregiver")
    if student is None or caregiver is None:
        # Tai khoan se duoc tao o apply; preview bao truoc.
        return {"status": ROW_WILL_CREATE, "problems": problems,
                "to_create": to_create,
                "student": student, "caregiver": caregiver}

    state = _pair_state(student, caregiver)
    if state["active"]:
        return {"status": ROW_ALREADY_ACTIVE, "problems": [],
                "to_create": [], "student": student, "caregiver": caregiver,
                "generation": state["latest"].generation}
    if state["revoked"]:
        if row["allow_reconnect"]:
            return {"status": ROW_REVOKED_RECONNECTABLE, "problems": [],
                    "to_create": [], "student": student,
                    "caregiver": caregiver,
                    "generation": state["latest"].generation}
        return {"status": ROW_REVOKED,
                "problems": ["pair_revoked_reconnect_requires_allow_reconnect"],
                "to_create": [], "student": student, "caregiver": caregiver}
    if state["proposal"] is not None:
        return {"status": ROW_PENDING_TO_CLOSE, "problems": problems,
                "to_create": [], "student": student, "caregiver": caregiver,
                "proposal_id": str(state["proposal"].id)}
    return {"status": ROW_WILL_CONNECT, "problems": problems,
            "to_create": [], "student": student, "caregiver": caregiver}


# ---------------------------------------------------------------------------
# Connection creation (domain core dung chung provision + backfill)
# ---------------------------------------------------------------------------

def _next_generation(low_id: str, high_id: str) -> int:
    from family_bridge_features.f01_identity.models import Connection
    last = (Connection.objects.filter(party_low_id=low_id, party_high_id=high_id)
            .order_by("-generation").first())
    return (last.generation + 1) if last else 1


def _create_admin_connection(*, student_user, caregiver_user, admin, batch_ref):
    """Tao Connection ACTIVE canonical (party_low/high, generation theo cuoc
    doi cap). Va cham uniq_active_pair → tra (None, existing)."""
    from family_bridge_features.f01_identity.models import (
        CONNECTION_ACTIVE, CONNECTION_SOURCE_ADMIN, Connection,
    )
    User = get_user_model()
    low_id, high_id = sorted([str(student_user.pk), str(caregiver_user.pk)])
    try:
        with transaction.atomic():
            connection = Connection.objects.create(
                party_low=User.objects.get(pk=low_id),
                party_high=User.objects.get(pk=high_id),
                invite=None,
                relationship_kind="primary",
                status=CONNECTION_ACTIVE,
                generation=_next_generation(low_id, high_id),
                source=CONNECTION_SOURCE_ADMIN,
                source_admin=str(admin.pk),
                source_batch=str(batch_ref)[:64],
            )
        return connection, None
    except IntegrityError:
        existing = (Connection.objects
                    .filter(party_low_id=low_id, party_high_id=high_id,
                            status=CONNECTION_ACTIVE)
                    .order_by("-generation").first())
        if existing is not None:
            return None, existing
        raise


def _close_proposal_connected(proposal) -> None:
    """Dong proposal mo thanh 'connected' VOI provenance that (khong gia
    first_confirmed_*; outcome_reason='admin_provisioned')."""
    proposal.status = CompanionProposal.STATUS_CONNECTED
    proposal.outcome_role = None
    proposal.outcome_reason = "admin_provisioned"
    proposal.revision = proposal.revision + 1
    proposal.save(update_fields=["status", "outcome_role", "outcome_reason",
                                 "revision", "updated_at"])


def _create_accounts_if_needed(row: dict, *, to_create: list[str],
                               class_ref: str,
                               initial_password: str | None) -> dict:
    """Tao tai khoan thieu; tra {role_key: ClassAccount} + errors."""
    created: dict[str, ClassAccount] = {}
    errors: list[str] = []
    User = get_user_model()
    for role_key, role in (("caregiver", "caregiver"), ("student", "student")):
        if role_key not in to_create:
            continue
        code = row[f"{role_key}_code"]
        display_name = row[f"{role_key}_name"]
        external_ref = row[f"{role_key}_external_ref"] or code
        if not isinstance(initial_password, str) \
                or len(initial_password) < MIN_INITIAL_PASSWORD_LENGTH:
            errors.append(f"{role_key}_initial_password_required")
            continue
        try:
            with transaction.atomic():
                user = User.objects.create_user(
                    username=_username_for(external_ref),
                    first_name=display_name,
                    password=initial_password)
                created[role_key] = ClassAccount.objects.create(
                    user=user, login_code=code, role=role,
                    class_ref=class_ref[:64], external_ref=external_ref[:128])
        except IntegrityError:
            winner = _resolve_account(code, role)
            if winner is not None:
                created[role_key] = winner  # thua cuoc race — dung nguoi thang
            else:
                errors.append(f"{role_key}_account_conflict")
    return {"created": created, "errors": errors}


def _audit_batch(*, admin, batch_ref: str, mode: str, summary: dict) -> None:
    from family_bridge_features.admin_core.services.admin import audit
    audit(actor_id=str(admin.pk), action="classroom.provision",
          target_ref=f"batch:{batch_ref}"[:128], outcome="ok",
          reason=(f"mode={mode}; rows={summary.get('rows', 0)}; "
                  f"connected={summary.get('connected', 0)}; "
                  f"already={summary.get('already_active', 0)}; "
                  f"reconnected={summary.get('reconnected', 0)}; "
                  f"errors={summary.get('errors', 0)}")[:200])


# ---------------------------------------------------------------------------
# Preview / Apply (cap phat moi bang bang 2 cot)
# ---------------------------------------------------------------------------

def _summary_base(rows: int) -> dict:
    return {"rows": rows, "will_connect": 0, "will_create_accounts_and_connect": 0,
            "pair_already_active": 0, "pending_proposal_will_close_and_connect": 0,
            "pair_revoked": 0, "pair_revoked_reconnectable": 0, "error": 0,
            "accounts_to_create": 0, "connected": 0, "already_active": 0,
            "reconnected": 0, "errors": 0}


def preview_pairs(admin_user, *, class_ref: str, rows: list[dict],
                  initial_password: str | None = None) -> dict:
    """Doc-only: phan loai tung row + tong hop. KHONG ghi DB."""
    require_class_scope(admin_user, class_ref=class_ref)
    parsed = _parse_rows(rows)
    is_global, _refs = admin_scope(admin_user.pk)
    duplicates = _duplicate_codes(parsed)
    summary = _summary_base(len(parsed))
    results = []
    for row in parsed:
        info = _classify_row(row, class_ref=class_ref,
                             is_global_scope=is_global, creating=duplicates)
        summary[info["status"]] = summary.get(info["status"], 0) + 1
        if info.get("to_create"):
            summary["accounts_to_create"] += len(info["to_create"])
            if not isinstance(initial_password, str) \
                    or len(initial_password) < MIN_INITIAL_PASSWORD_LENGTH:
                info.setdefault("problems", []).append(
                    "initial_password_required_for_new_accounts")
        if info["status"] == STATUS_ERROR or info.get("problems"):
            summary["errors"] += 1
        results.append(_row_view(row, info))
    return {"ok": summary["errors"] == 0, "dry_run": True,
            "class_ref": class_ref, "summary": summary, "rows": results}


def _duplicate_codes(parsed: list[dict]) -> set[str]:
    """Ma xuat hien > 1 lan TRONG batch (chong tao trung trong mot dot)."""
    counts: dict[str, int] = {}
    for row in parsed:
        for key in ("caregiver_code", "student_code"):
            code = row[key]
            if code is not None:
                counts[code] = counts.get(code, 0) + 1
    return {code for code, count in counts.items() if count > 1}


def _row_view(row: dict, info: dict) -> dict:
    view = {
        "row": row["index"],
        "caregiver_code": row["caregiver_code"],
        "student_code": row["student_code"],
        "status": info["status"],
        "problems": list(info.get("problems", [])),
    }
    for role_key in ("caregiver", "student"):
        account = info.get(role_key)
        if account is not None:
            view[f"{role_key}_display_name"] = (
                " ".join(filter(None, [account.user.first_name])).strip()
                or account.login_code)
            view[f"{role_key}_class_ref"] = account.class_ref
        else:
            view[f"{role_key}_display_name"] = row.get(f"{role_key}_name") or None
    if info.get("generation") is not None:
        view["current_generation"] = info["generation"]
    if info.get("proposal_id"):
        view["proposal_id"] = info["proposal_id"]
    return view


@transaction.atomic
def apply_pairs(admin_user, *, class_ref: str, rows: list[dict],
                batch_ref: str, initial_password: str | None = None) -> dict:
    """Apply idempotent theo batch_ref; validate-toan-bo truoc khi ghi."""
    require_class_scope(admin_user, class_ref=class_ref)
    if not isinstance(batch_ref, str) or not batch_ref.strip() \
            or len(batch_ref) > 64:
        raise InputInvalid({"field": "batch_ref", "reason": "invalid_batch_ref"})
    batch_ref = batch_ref.strip()

    existing = PairProvisionBatch.objects.filter(
        batch_ref=batch_ref, mode=BATCH_MODE_PROVISION).first()
    if existing is not None:
        # Idempotent replay: tra ket qua DA LUO, khong xu ly lai.
        stored = dict(existing.summary or {})
        stored["replayed"] = True
        stored["batch_id"] = str(existing.id)
        return stored

    parsed = _parse_rows(rows)
    is_global, _refs = admin_scope(admin_user.pk)
    duplicates = _duplicate_codes(parsed)

    # PHA 1 — VALIDATE TOAN BO: row loi nghiem trang → khong ghi gi.
    infos = []
    validation_failed = False
    for row in parsed:
        info = _classify_row(row, class_ref=class_ref,
                             is_global_scope=is_global, creating=duplicates)
        if info.get("to_create"):
            if not isinstance(initial_password, str) \
                    or len(initial_password) < MIN_INITIAL_PASSWORD_LENGTH:
                info.setdefault("problems", []).append(
                    "initial_password_required_for_new_accounts")
        if info["status"] == STATUS_ERROR or info.get("problems"):
            validation_failed = True
        infos.append((row, info))
    if validation_failed:
        summary = _summary_base(len(parsed))
        results = []
        for row, info in infos:
            summary[info["status"]] = summary.get(info["status"], 0) + 1
            if info["status"] == STATUS_ERROR or info.get("problems"):
                summary["errors"] += 1
            results.append(_row_view(row, info))
        return {"ok": False, "wrote": False, "dry_run": False,
                "class_ref": class_ref, "summary": summary,
                "rows": results,
                "note": "Co row loi — KHONG ghi gi (validate truoc, ghi sau)."}

    # PHA 2 — GHI tung row trong savepoint rieng.
    summary = _summary_base(len(parsed))
    summary.pop("will_connect", None)
    summary.pop("will_create_accounts_and_connect", None)
    summary.pop("pending_proposal_will_close_and_connect", None)
    summary.pop("pair_revoked", None)
    summary.pop("pair_revoked_reconnectable", None)
    summary.pop("accounts_to_create", None)
    results = []
    for row, info in infos:
        outcome = _apply_one_row(row, info, admin_user=admin_user,
                                 class_ref=class_ref, batch_ref=batch_ref,
                                 initial_password=initial_password)
        if outcome["status"] == STATUS_CONNECTED:
            summary["connected"] += 1
        elif outcome["status"] == STATUS_ALREADY:
            summary["already_active"] += 1
        elif outcome["status"] == STATUS_RECONNECTED:
            summary["reconnected"] += 1
        else:
            summary["errors"] += 1
        results.append(outcome)

    summary["ok"] = summary["errors"] == 0
    summary["wrote"] = True
    summary["dry_run"] = False
    summary["class_ref"] = class_ref
    _audit_batch(admin=admin_user, batch_ref=batch_ref,
                 mode=BATCH_MODE_PROVISION, summary=summary)
    batch = PairProvisionBatch.objects.create(
        batch_ref=batch_ref, admin_id=str(admin_user.pk),
        class_ref=class_ref[:64], mode=BATCH_MODE_PROVISION,
        summary=summary)
    summary["batch_id"] = str(batch.id)
    summary["rows"] = results
    return summary


def _apply_one_row(row: dict, info: dict, *, admin_user, class_ref: str,
                   batch_ref: str, initial_password: str | None) -> dict:
    base = {"row": row["index"], "caregiver_code": row["caregiver_code"],
            "student_code": row["student_code"]}
    try:
        with transaction.atomic():
            need_create = info.get("to_create") or []
            if need_create:
                outcome_accounts = _create_accounts_if_needed(
                    row, to_create=need_create, class_ref=class_ref,
                    initial_password=initial_password)
                if outcome_accounts["errors"]:
                    return {**base, "status": STATUS_ERROR,
                            "problems": outcome_accounts["errors"]}
                info = {**info,
                        "student": outcome_accounts["created"].get("student")
                        or info.get("student"),
                        "caregiver": outcome_accounts["created"].get("caregiver")
                        or info.get("caregiver")}
            student = info.get("student")
            caregiver = info.get("caregiver")
            if student is None or caregiver is None:
                return {**base, "status": STATUS_ERROR,
                        "problems": ["account_unresolved"]}
            reconnect = info["status"] == ROW_REVOKED_RECONNECTABLE
            connection, existing = _create_admin_connection(
                student_user=student.user, caregiver_user=caregiver.user,
                admin=admin_user, batch_ref=batch_ref)
            if connection is None:
                _close_pending_if_any(student, caregiver)
                return {**base, "status": STATUS_ALREADY,
                        "connection_id": str(existing.id),
                        "generation": existing.generation,
                        "source": existing.source}
            _close_pending_if_any(student, caregiver)
            return {**base,
                    "status": STATUS_RECONNECTED if reconnect else STATUS_CONNECTED,
                    "connection_id": str(connection.id),
                    "generation": connection.generation,
                    "source": connection.source}
    except Exception as exc:  # noqa: BLE001 — savepoint isolate, bao loi row
        return {**base, "status": STATUS_ERROR,
                "problems": [f"row_failed: {type(exc).__name__}"]}


def _close_pending_if_any(student: ClassAccount, caregiver: ClassAccount) -> None:
    proposal = (CompanionProposal.objects
                .filter(student_account=student, caregiver_account=caregiver,
                        status__in=PROPOSAL_OPEN_STATUSES)
                .order_by("-updated_at").first())
    if proposal is not None:
        _close_proposal_connected(proposal)


# ---------------------------------------------------------------------------
# Backfill: chuyen doi cac cap DANG CHO (proposal open) sang active
# ---------------------------------------------------------------------------

def backfill_inventory(admin_user, *, class_ref: str | None = None) -> dict:
    is_global, refs = admin_scope(admin_user.pk)
    if not is_global and not refs:
        raise NotFound({"reason": "not_found"})
    if class_ref:
        require_class_scope(admin_user, class_ref=class_ref)
    proposal_qs = CompanionProposal.objects.select_related(
        "student_account__user", "caregiver_account__user")
    if class_ref:
        proposal_qs = proposal_qs.filter(student_account__class_ref=class_ref)
    elif not is_global:
        proposal_qs = proposal_qs.filter(student_account__class_ref__in=refs)

    from django.contrib.auth import get_user_model
    User = get_user_model()
    eligible, blocked, already_active, closed = [], [], 0, 0
    account_codes = {"students": 0, "caregivers": 0}
    account_qs = ClassAccount.objects.all()
    if class_ref:
        account_qs = account_qs.filter(class_ref=class_ref)
    elif not is_global:
        account_qs = account_qs.filter(class_ref__in=refs)
    for row in account_qs.values("role").order_by():
        if row["role"] == "student":
            account_codes["students"] += 1
        else:
            account_codes["caregivers"] += 1

    for proposal in proposal_qs.order_by("created_at"):
        entry = {
            "proposal_id": str(proposal.id),
            "student_code": proposal.student_account.login_code,
            "caregiver_code": proposal.caregiver_account.login_code,
            "student_name": proposal.student_account.user.first_name,
            "caregiver_name": proposal.caregiver_account.user.first_name,
            "status": proposal.status,
        }
        both_active = (User.objects.filter(
            pk=proposal.student_account.user_id, is_active=True).exists()
            and User.objects.filter(
                pk=proposal.caregiver_account.user_id, is_active=True).exists())
        if not both_active:
            entry["reason"] = "account_inactive"
            blocked.append(entry)
            continue
        state = _pair_state(proposal.student_account, proposal.caregiver_account)
        if state["active"]:
            already_active += 1
            continue
        if state["revoked"]:
            entry["reason"] = "pair_revoked_no_auto_revive"
            blocked.append(entry)
            continue
        eligible.append(entry)
    return {
        "scope": {"class_ref": class_ref,
                  "classes": sorted(refs) if not is_global else None,
                  "is_global": is_global},
        "accounts": {**account_codes, "total": sum(account_codes.values())},
        "proposals": {"eligible_pending": len(eligible),
                      "blocked": len(blocked)},
        "already_active_pairs": already_active,
        "eligible_pairs": eligible,
        "blocked_pairs": blocked,
    }


@transaction.atomic
def backfill_apply(admin_user, *, batch_ref: str,
                   class_ref: str | None = None) -> dict:
    """Chuyen doi TAT CA cap du dieu kien trong pham vi (proposal open,
    ca hai tai khoan active) thanh Connection ACTIVE bang cung domain service.
    Idempotent theo batch_ref; re-run sau do → cac cap da active → count."""
    inventory = backfill_inventory(admin_user, class_ref=class_ref)

    existing = PairProvisionBatch.objects.filter(
        batch_ref=batch_ref, mode=BATCH_MODE_BACKFILL).first()
    if existing is not None:
        stored = dict(existing.summary or {})
        stored["replayed"] = True
        stored["batch_id"] = str(existing.id)
        return stored

    summary = {"eligible": inventory["proposals"]["eligible_pending"],
               "activated": 0, "already_active": 0, "blocked": len(inventory["blocked_pairs"]),
               "errors": 0, "ok": True, "wrote": True,
               "class_ref": class_ref}
    rows = []
    for entry in inventory["eligible_pairs"]:
        proposal = CompanionProposal.objects.select_related(
            "student_account__user", "caregiver_account__user").filter(
            pk=entry["proposal_id"]).first()
        if proposal is None:
            summary["errors"] += 1
            rows.append({**entry, "status": STATUS_ERROR,
                         "problems": ["proposal_gone"]})
            continue
        try:
            with transaction.atomic():
                connection, existing_conn = _create_admin_connection(
                    student_user=proposal.student_account.user,
                    caregiver_user=proposal.caregiver_account.user,
                    admin=admin_user, batch_ref=batch_ref)
                if connection is None:
                    _close_proposal_connected(proposal)
                    summary["already_active"] += 1
                    rows.append({**entry, "status": STATUS_ALREADY,
                                 "connection_id": str(existing_conn.id),
                                 "generation": existing_conn.generation})
                else:
                    _close_proposal_connected(proposal)
                    summary["activated"] += 1
                    rows.append({**entry, "status": STATUS_CONNECTED,
                                 "connection_id": str(connection.id),
                                 "generation": connection.generation,
                                 "source": connection.source})
        except Exception as exc:  # noqa: BLE001
            summary["errors"] += 1
            summary["ok"] = False
            rows.append({**entry, "status": STATUS_ERROR,
                         "problems": [f"row_failed: {type(exc).__name__}"]})
    if summary["errors"]:
        summary["ok"] = False
    _audit_batch(admin=admin_user, batch_ref=batch_ref,
                 mode=BATCH_MODE_BACKFILL, summary=summary)
    batch = PairProvisionBatch.objects.create(
        batch_ref=batch_ref, admin_id=str(admin_user.pk),
        class_ref=(class_ref or "")[:64], mode=BATCH_MODE_BACKFILL,
        summary={k: v for k, v in summary.items() if k != "rows"})
    summary["batch_id"] = str(batch.id)
    summary["rows"] = rows
    return summary
