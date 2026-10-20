"""Bundle validation for content import — mirrors the REAL repo contracts.

The importer validates every item against the same bounds the readers and
services enforce at runtime, BEFORE any write:

- admin_core.ContentLifecycleService.create_draft: title<=120, body<=8000
  (the service truncates silently — we reject instead), key<=64.
- f02_program wiring (_parse_weeks/_parse_agreement): kind="f02_program"
  needs body {"weeks": exactly 4 (week_no 1..4 unique, title 1..120,
  goals <=6 x 200 chars, guides <=4000, joint_activity_keys <=6 x 64),
  "agreement": {revision int>=1, title<=120, commitments <=10 x 200}}.
- f09 wiring/service (_safe_body/_safe_minutes): kind in
  {"activity","micro_lesson"} needs body {goal<=300, steps <=10 x 500,
  share<=300, minutes int 1..1440} (micro_lesson minutes = 1 per bundle
  contract; any positive int is valid at the repo level).
- Cross-item: every joint_activity_keys entry must reference an activity
  present in the SAME bundle (16 refs, 4 per week); program audience
  neutral, activities joint, micro_lesson student|caregiver.

Validation is the importer's OWN gate; it never relies on silent server
truncation ("KHONG dua viec cat im lang"), and it never mutates data.
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional, Tuple

MAX_TITLE = 120
MAX_KEY = 64
MAX_BODY_JSON = 8000        # create_draft hard bound (silent truncate above)
TARGET_BODY_JSON = 4000     # bundle contract: stay well under the bound
MAX_GOAL = 300
MAX_STEPS = 10
MAX_STEP = 500
MAX_SHARE = 300
MAX_MINUTES = 1440

PROGRAM_KIND = "f02_program"
ACTIVITY_KIND = "activity"
LESSON_KIND = "micro_lesson"
KNOWN_KINDS = (PROGRAM_KIND, ACTIVITY_KIND, LESSON_KIND)
KNOWN_AUDIENCES = {"neutral", "joint", "student", "caregiver"}

_KEY_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")

REQUIRED_ITEM_FIELDS = ("content_key", "kind", "title", "audience", "body")
# Bundle contract (docs/05): payload only ever carries these five fields —
# no status/owner/participant fields may sneak into an import payload.
ALLOWED_ITEM_FIELDS = frozenset(REQUIRED_ITEM_FIELDS)


class BundleValidationError(Exception):
    """Raised with a list of human-readable problem strings."""

    def __init__(self, problems: List[str]) -> None:
        self.problems = list(problems)
        super().__init__("; ".join(self.problems[:5]))


def canonical_json(value: Any) -> str:
    """Canonical serialization for checksums and payload comparison."""
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"))


def _check(condition: bool, problems: List[str], message: str) -> None:
    if not condition:
        problems.append(message)


def _validate_program_body(key: str, body: Dict[str, Any],
                           problems: List[str]) -> None:
    weeks = body.get("weeks")
    _check(isinstance(weeks, list) and len(weeks) == 4, problems,
           f"{key}: weeks phai la list dung 4 tuan (F02 contract)")
    if not isinstance(weeks, list):
        return
    seen_weeks = set()
    ref_keys: List[str] = []
    for week in weeks:
        if not isinstance(week, dict):
            problems.append(f"{key}: week phai la object")
            return
        no = week.get("week_no")
        _check(not isinstance(no, bool) and isinstance(no, int)
               and 1 <= no <= 8 and no not in seen_weeks, problems,
               f"{key}: week_no khong hop le hoac trung ({no!r})")
        seen_weeks.add(no if isinstance(no, int) else -1)
        title = week.get("title")
        _check(isinstance(title, str) and 1 <= len(title) <= 120, problems,
               f"{key}: week title 1..120 ky tu")
        goals = week.get("goals") or []
        _check(isinstance(goals, list) and len(goals) <= 6
               and all(isinstance(g, str) and 0 < len(g) <= 200
                       for g in goals), problems,
               f"{key}: goals <=6 muc, moi muc <=200 ky tu")
        for guide in ("student_guide", "caregiver_guide"):
            value = week.get(guide, "")
            _check(isinstance(value, str) and len(value) <= 4000, problems,
                   f"{key}: {guide} <=4000 ky tu")
        joint = week.get("joint_activity_keys") or []
        _check(isinstance(joint, list) and len(joint) <= 6
               and all(isinstance(k, str) and 1 <= len(k) <= 64
                       for k in joint), problems,
               f"{key}: joint_activity_keys <=6 key moi tuan (1..64 ky tu)")
        if isinstance(joint, list):
            ref_keys.extend(k for k in joint if isinstance(k, str))
    _check(seen_weeks == {1, 2, 3, 4}, problems,
           f"{key}: week_no phai la dung {sorted({1, 2, 3, 4})}")
    agreement = body.get("agreement")
    _check(isinstance(agreement, dict), problems,
           f"{key}: agreement phai la object")
    if isinstance(agreement, dict):
        rev = agreement.get("revision")
        _check(not isinstance(rev, bool) and isinstance(rev, int)
               and rev >= 1, problems,
               f"{key}: agreement.revision int >=1")
        title = agreement.get("title", "")
        _check(isinstance(title, str) and len(title) <= 120, problems,
               f"{key}: agreement.title <=120 ky tu")
        commitments = agreement.get("commitments") or []
        _check(isinstance(commitments, list) and len(commitments) <= 10
               and all(isinstance(c, str) and 0 < len(c) <= 200
                       for c in commitments), problems,
               f"{key}: commitments <=10 muc, moi muc <=200 ky tu")
    body["_bundle_refs"] = ref_keys  # internal marker, stripped after


def _validate_activity_body(key: str, kind: str, body: Dict[str, Any],
                            problems: List[str]) -> None:
    goal = body.get("goal", "")
    _check(isinstance(goal, str) and len(goal) <= MAX_GOAL, problems,
           f"{key}: goal <= {MAX_GOAL} ky tu")
    steps = body.get("steps") or []
    _check(isinstance(steps, list) and len(steps) <= MAX_STEPS
           and all(isinstance(s, str) and 0 < len(s) <= MAX_STEP
                   for s in steps), problems,
           f"{key}: steps <= {MAX_STEPS} buoc, moi buoc <= {MAX_STEP} ky tu")
    share = body.get("share", "")
    _check(isinstance(share, str) and len(share) <= MAX_SHARE, problems,
           f"{key}: share <= {MAX_SHARE} ky tu")
    minutes = body.get("minutes")
    _check(not isinstance(minutes, bool) and isinstance(minutes, int)
           and 1 <= minutes <= MAX_MINUTES, problems,
           f"{key}: minutes phai la int 1..{MAX_MINUTES} (co nguon that)")
    if kind == LESSON_KIND:
        _check(minutes == 1, problems,
               f"{key}: micro_lesson theo ban giao co minutes=1 (thay: {minutes!r})")


def validate_bundle(raw_items: Any) -> List[Dict[str, Any]]:
    """Validate the full bundle; returns normalized items (with a
    deterministic order: activities+lessons first, program last). Raises
    BundleValidationError with ALL problems (not just the first)."""
    problems: List[str] = []
    if not isinstance(raw_items, list):
        raise BundleValidationError(["bundle phai la list item"])
    _check(1 <= len(raw_items) <= 200, problems,
           "bundle phai co 1..200 item")
    if problems:
        raise BundleValidationError(problems)

    seen_keys: Dict[str, int] = {}
    normalized: List[Dict[str, Any]] = []
    for index, item in enumerate(raw_items):
        if not isinstance(item, dict):
            problems.append(f"item#{index}: phai la object")
            continue
        extra = set(item.keys()) - ALLOWED_ITEM_FIELDS
        _check(not extra, problems,
               f"item#{index}: field khong duoc phep trong payload: "
               f"{sorted(extra)} (chi 5 field content)")
        key = item.get("content_key")
        kind = item.get("kind")
        title = item.get("title")
        audience = item.get("audience")
        body = item.get("body")
        label = str(key) if key else f"item#{index}"
        _check(isinstance(key, str) and bool(_KEY_RE.match(key)), problems,
               f"{label}: content_key sai dinh dang (a-z0-9 va dau '-'), "
               f"toi da 64 ky tu")
        if isinstance(key, str):
            seen_keys[key] = seen_keys.get(key, 0) + 1
        _check(kind in KNOWN_KINDS, problems,
               f"{label}: kind phai la mot trong {KNOWN_KINDS}")
        _check(isinstance(title, str) and 1 <= len(title) <= MAX_TITLE,
               problems, f"{label}: title 1..{MAX_TITLE} ky tu")
        _check(audience in KNOWN_AUDIENCES, problems,
               f"{label}: audience phai la {sorted(KNOWN_AUDIENCES)}")
        _check(isinstance(body, dict), problems,
               f"{label}: body phai la object (bundle nguon)")
        if isinstance(body, dict):
            body_json = canonical_json(body)
            _check(len(body_json.encode("utf-8")) <= MAX_BODY_JSON, problems,
                   f"{label}: body vuot {MAX_BODY_JSON} byte sau serialize")
            _check(len(body_json.encode("utf-8")) <= TARGET_BODY_JSON,
                   problems,
                   f"{label}: body vuot muc muc tieu {TARGET_BODY_JSON} byte "
                   f"cua bundle ({len(body_json.encode('utf-8'))} byte)")
            if kind == PROGRAM_KIND:
                _validate_program_body(label, body, problems)
            elif kind in (ACTIVITY_KIND, LESSON_KIND):
                _validate_activity_body(label, kind, body, problems)
            if kind == PROGRAM_KIND and audience != "neutral":
                problems.append(f"{label}: program phai audience=neutral")
            if kind == ACTIVITY_KIND and audience != "joint":
                problems.append(f"{label}: activity phai audience=joint")
            if kind == LESSON_KIND and audience not in ("student",
                                                        "caregiver"):
                problems.append(
                    f"{label}: micro_lesson phai audience=student|caregiver")
        normalized.append({
            "content_key": key,
            "kind": kind,
            "title": title,
            "audience": audience,
            "body": body,
        })

    for dup_key, count in seen_keys.items():
        if count > 1:
            problems.append(f"{dup_key}: xuat hien {count} lan trong bundle")
    # count expectations: exactly one program, at least one activity/lesson
    program_count = sum(1 for i in normalized if i.get("kind") == PROGRAM_KIND)
    activity_count = sum(1 for i in normalized if i.get("kind") == ACTIVITY_KIND)
    lesson_count = sum(1 for i in normalized if i.get("kind") == LESSON_KIND)
    _check(program_count == 1, problems,
           f"bundle phai co dung 1 f02_program (thay {program_count})")
    _check(activity_count >= 1 and lesson_count >= 1, problems,
           "bundle phai co it nhat 1 activity va 1 micro_lesson")

    if problems:
        raise BundleValidationError(problems)

    # Cross-item reference check (program -> activities in SAME bundle)
    ref_targets = {i["content_key"] for i in normalized
                   if i["kind"] == ACTIVITY_KIND}
    program = next(i for i in normalized if i["kind"] == PROGRAM_KIND)
    refs = program["body"].pop("_bundle_refs", [])
    missing = sorted(set(refs) - ref_targets)
    _check(not missing, problems,
           f"program tham chieu key khong co trong bundle: {missing}")
    _check(len(refs) == len(set(refs)), problems,
           "program co joint_activity_keys trung lap")
    ordered = ([i for i in normalized if i["kind"] != PROGRAM_KIND]
               + [program])
    return ordered


def load_bundle_file(path: str) -> Tuple[str, str, List[Dict[str, Any]]]:
    """Load content-items.json ({"schema_version", "catalog_id",
    "purpose", "items"}). Returns (catalog_id, canonical_hash, items)."""
    import hashlib

    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise BundleValidationError(["file bundle phai la object"])
    catalog_id = str(data.get("catalog_id") or "")
    items = data.get("items")
    canonical = canonical_json(items)
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    validated = validate_bundle(items)
    return catalog_id, digest, validated
