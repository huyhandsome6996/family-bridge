"""Import tai khoan lop HS/PH + cap de xuat ket noi tu CSV (pure service).

Nguyen tac:
- VALIDATION TRUOC, GHI SAU: bat ky loi hang nao trong CSV tai khoan →
  tra errors, KHONG ghi gi het (all-or-nothing cho phan import tai khoan).
- Fail-closed: apply mode BAT BUOC initial_password khong rong va >= 8 ky
  tu — thieu/sai → khong ghi gi (khong tao user khong mat khau).
- Idempotent theo external_ref: chay lai file giong het → khong tao moi,
  khong doi password/first_name cua user san co; lech login_code/role/
  class_ref → dong "account_drift" (skip, khong sua nguoc).
- Race: tung dong chay trong savepoint rieng; IntegrityError (thua cuoc
  create) → doc lai nguoi thang trong atomic moi va xu ly nhu "existing".
- Cap de xuat: ton tai CompanionProposal BAT KY trang thai cho cap → skip
  (khong bao gio hoi sinh proposal da declined/canceled).
"""

from __future__ import annotations

import csv
import re

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction

from ..models import ClassAccount, CompanionProposal

HEADER_ACCOUNTS = ["external_ref", "login_code", "role", "class_ref",
                   "display_name"]
HEADER_PROPOSALS = ["student_login_code", "caregiver_login_code"]

LOGIN_CODE_RE = re.compile(r"^[A-Z0-9]{3,16}$")
EXTERNAL_REF_RE = re.compile(r"^.{1,128}$", re.DOTALL)
HS_INDEX_RE = re.compile(r"^HS(\d+)$")
PH_INDEX_RE = re.compile(r"^PH(\d+)$")

MIN_INITIAL_PASSWORD_LENGTH = 8


def _normalize_code(raw) -> str | None:
    if not isinstance(raw, str):
        return None
    normalized = raw.strip().upper()
    return normalized if LOGIN_CODE_RE.fullmatch(normalized) else None


def _username_for(external_ref: str) -> str:
    sanitized = re.sub(r"[^\w.@+-]", "_", external_ref)
    return f"cls_{sanitized}"[:150]


def _read_rows(path, header, errors, *, label):
    """Doc CSV; mapping theo TEN COT (khong theo vi tri).

    Brief 18/10/2026: file mau co the co header PH dung truoc HS
    (`caregiver_login_code,student_login_code`) — vai vai KHONG BAO GIO
    suy tu vi tri cot. Header phai chua DUNG bo cot yeu cau (du toan bo),
    thu tu bat ky; thua cot khac → loi.
    """
    try:
        with open(path, "r", encoding="utf-8-sig", newline="") as handle:
            rows = list(csv.reader(handle))
    except OSError:
        errors.append({"reason": f"{label}_file_unreadable"})
        return None
    if not rows:
        errors.append({"reason": f"{label}_file_empty"})
        return None
    file_header = [cell.strip() for cell in rows[0]]
    if sorted(file_header) != sorted(header):
        errors.append({"reason": f"{label}_header_invalid",
                       "expected": ",".join(header)})
        return None
    data = []
    for number, fields in enumerate(rows[1:], start=2):
        if not fields or all(not cell.strip() for cell in fields):
            continue  # blank line: skip silently
        if len(fields) != len(file_header):
            errors.append({"row": number,
                           "reason": f"{label}_column_count_invalid"})
            continue
        data.append((number, dict(zip(file_header, fields))))
    return data


def _validate_accounts(path, errors) -> list:
    data = _read_rows(path, HEADER_ACCOUNTS, errors, label="accounts")
    if data is None:
        return []
    seen_external: dict = {}
    seen_code: dict = {}
    validated = []
    for number, row in data:
        external_ref = (row["external_ref"] or "").strip()
        code = _normalize_code(row["login_code"])
        role = (row["role"] or "").strip().lower()
        class_ref = (row["class_ref"] or "").strip()
        display_name = " ".join((row["display_name"] or "").split())
        problems = []
        if not EXTERNAL_REF_RE.match(external_ref):
            problems.append("external_ref_invalid")
        if code is None:
            problems.append("login_code_invalid")
        if role not in ("student", "caregiver"):
            problems.append("role_invalid")
        if not class_ref or len(class_ref) > 64:
            problems.append("class_ref_invalid")
        if not 1 <= len(display_name) <= 80:
            problems.append("display_name_invalid")
        if problems:
            errors.append({"row": number, "external_ref": external_ref or None,
                           "reason": ";".join(problems)})
            continue
        if external_ref in seen_external:
            errors.append({"row": number, "external_ref": external_ref,
                           "reason": "duplicate_external_ref_in_file",
                           "first_row": seen_external[external_ref]})
            continue
        if code in seen_code:
            errors.append({"row": number, "external_ref": external_ref,
                           "reason": "duplicate_login_code_in_file",
                           "first_row": seen_code[code]})
            continue
        seen_external[external_ref] = number
        seen_code[code] = number
        validated.append({"row": number, "external_ref": external_ref,
                          "login_code": code, "role": role,
                          "class_ref": class_ref, "display_name": display_name})
    return validated


def _resolve_pairs(validated, proposals_csv_path, auto_pair_by_index, errors):
    """Danh sach (student_code, caregiver_code, row_label) can de xuat."""
    pairs = []
    if proposals_csv_path:
        data = _read_rows(proposals_csv_path, HEADER_PROPOSALS, errors,
                          label="proposals")
        if data is not None:
            for number, row in data:
                student = _normalize_code(row["student_login_code"])
                caregiver = _normalize_code(row["caregiver_login_code"])
                if student is None or caregiver is None:
                    errors.append({"row": number,
                                   "reason": "proposals_code_invalid"})
                    continue
                pairs.append((student, caregiver, number))
    elif auto_pair_by_index:
        students: dict = {}
        caregivers: dict = {}
        for item in validated:
            match_hs = HS_INDEX_RE.fullmatch(item["login_code"])
            match_ph = PH_INDEX_RE.fullmatch(item["login_code"])
            if item["role"] == "student" and match_hs:
                students.setdefault(int(match_hs.group(1)), item["login_code"])
            elif item["role"] == "caregiver" and match_ph:
                caregivers.setdefault(int(match_ph.group(1)), item["login_code"])
        for index in sorted(set(students) | set(caregivers)):
            if index in students and index in caregivers:
                pairs.append((students[index], caregivers[index],
                              f"auto:{index}"))
            else:
                errors.append({"row": f"auto:{index}",
                               "reason": "auto_pair_unmatched_index"})
    return pairs


def _apply_accounts(validated, *, dry_run: bool, initial_password, summary) -> bool:
    """Ghi tai khoan. Tra ve False khi fail-closed (password env sai)."""
    if not dry_run:
        if not isinstance(initial_password, str) or not initial_password.strip():
            summary["errors"].append({"reason": "initial_password_required"})
            summary["ok"] = False
            return False
        if len(initial_password) < MIN_INITIAL_PASSWORD_LENGTH:
            summary["errors"].append({"reason": "initial_password_too_short"})
            summary["ok"] = False
            return False
    User = get_user_model()
    for item in validated:
        existing = (ClassAccount.objects.select_related("user")
                    .filter(external_ref=item["external_ref"]).first())
        if existing is not None:
            _check_drift(existing, item, summary)
            continue
        if dry_run:
            summary["accounts_to_create"] += 1
            continue
        try:
            with transaction.atomic():
                user = User.objects.create_user(
                    username=_username_for(item["external_ref"]),
                    first_name=item["display_name"],
                    password=initial_password,
                )
                ClassAccount.objects.create(
                    user=user, login_code=item["login_code"],
                    role=item["role"], class_ref=item["class_ref"],
                    external_ref=item["external_ref"])
                summary["accounts_created"] += 1
        except IntegrityError:
            # Thua cuoc race: nguoi thang da ghi — doc lai trong atomic moi.
            with transaction.atomic():
                winner = (ClassAccount.objects.select_related("user")
                          .filter(external_ref=item["external_ref"]).first())
            if winner is None:
                summary["errors"].append({
                    "row": item["row"], "external_ref": item["external_ref"],
                    "reason": "account_conflict"})
                summary["ok"] = False
            else:
                _check_drift(winner, item, summary)
    return True


def _check_drift(existing: ClassAccount, item, summary) -> None:
    drifted = [field for field, want in (
        ("login_code", item["login_code"]), ("role", item["role"]),
        ("class_ref", item["class_ref"]))
        if getattr(existing, field) != want]
    if drifted:
        summary["errors"].append({
            "row": item["row"], "external_ref": item["external_ref"],
            "reason": "account_drift", "fields": drifted})
        summary["accounts_drifted"] += 1
        summary["ok"] = False
    else:
        summary["accounts_existing"] += 1


def _resolve_pair_side(code: str, role: str, code_index, dry_run: bool):
    """Tim tai khoan cho 1 phia cua cap: DB truoc, roi dong trong file
    (dry-run — tai khoan se duoc tao khi apply). Tra ve:
    ("db", account) | ("file", row) | None. Sai role → None o ca hai
    nguon (bao loi pair_unknown_code/pair_role_mismatch o caller)."""
    found = ClassAccount.objects.filter(login_code=code, role=role).first()
    if found is not None:
        return ("db", found)
    if dry_run:
        row = code_index.get(code)
        if row is not None and row["role"] == role:
            return ("file", row)
    return None


def _apply_proposals(pairs, *, dry_run: bool, code_index, summary) -> None:
    for student_code, caregiver_code, label in pairs:
        student = _resolve_pair_side(student_code, "student", code_index,
                                     dry_run)
        caregiver = _resolve_pair_side(caregiver_code, "caregiver",
                                       code_index, dry_run)
        if student is None or caregiver is None:
            summary["errors"].append({
                "row": label, "reason": "pair_unknown_code",
                "student_login_code": student_code,
                "caregiver_login_code": caregiver_code})
            summary["ok"] = False
            continue
        # Trung tai khoan: cung pk (DB) hoac cung external_ref (file).
        student_key = student[1].pk if student[0] == "db" \
            else f"file:{student[1]['external_ref']}"
        caregiver_key = caregiver[1].pk if caregiver[0] == "db" \
            else f"file:{caregiver[1]['external_ref']}"
        if student_key == caregiver_key:
            summary["errors"].append({"row": label,
                                      "reason": "pair_same_account"})
            summary["ok"] = False
            continue
        if student[0] == "db" and caregiver[0] == "db":
            if CompanionProposal.objects.filter(
                    student_account=student[1],
                    caregiver_account=caregiver[1]).exists():
                summary["proposals_skipped_existing"] += 1
                continue
        elif not dry_run:  # khong xay ra: apply-mode chi nhan "db"
            summary["errors"].append({"row": label,
                                      "reason": "pair_unknown_code"})
            summary["ok"] = False
            continue
        if dry_run:
            summary["proposals_to_create"] += 1
            continue
        try:
            # Savepoint tung cap: thua cuoc race (ban chay song song da tao
            # proposal cung cap truoc) → khong lam chet ca lenh; doc lai nhu
            # "skip existing" (unique cap mo dam bao chi mot ben thang).
            with transaction.atomic():
                CompanionProposal.objects.create(
                    student_account=student[1], caregiver_account=caregiver[1])
        except IntegrityError:
            summary["proposals_skipped_existing"] += 1
            continue
        summary["proposals_created"] += 1


def run_import(*, csv_path, proposals_csv_path=None, auto_pair_by_index: bool,
               dry_run: bool, initial_password: str | None) -> dict:
    """Doc CSV → validate → (dry_run?) ghi tai khoan + cap de xuat.

    Tra ve summary dict: counts, danh sach errors. KHONG bao gio dua mat
    khau vao summary (SEC-22: secret khong vao log/output).
    """
    summary = {
        "ok": True,
        "dry_run": bool(dry_run),
        "accounts_rows": 0,
        "accounts_created": 0,
        "accounts_existing": 0,
        "accounts_drifted": 0,
        "accounts_to_create": 0,
        "proposals_rows": 0,
        "proposals_created": 0,
        "proposals_skipped_existing": 0,
        "proposals_to_create": 0,
        "errors": [],
    }
    validated = _validate_accounts(csv_path, summary["errors"])
    if summary["errors"]:
        summary["ok"] = False
        return summary
    if not validated:
        summary["errors"].append({"reason": "accounts_no_rows"})
        summary["ok"] = False
        return summary
    if proposals_csv_path and auto_pair_by_index:
        summary["errors"].append({"reason": "pairing_source_conflict"})
        summary["ok"] = False
        return summary

    summary["accounts_rows"] = len(validated)
    pairs = _resolve_pairs(validated, proposals_csv_path, auto_pair_by_index,
                           summary["errors"])
    if summary["errors"]:
        summary["ok"] = False
        return summary
    summary["proposals_rows"] = len(pairs)

    if not _apply_accounts(validated, dry_run=dry_run,
                           initial_password=initial_password, summary=summary):
        return summary  # fail closed: khong ghi gi, khong tiep phan de xuat
    code_index = {item["login_code"]: item for item in validated}
    _apply_proposals(pairs, dry_run=dry_run, code_index=code_index,
                     summary=summary)
    if summary["errors"]:
        summary["ok"] = False
    return summary
