"""Explicit feature registry — allowlist, not plugin discovery (B00 contract).

Every deployable module must be registered here with a stable ID. The registry
is data only: no imports of feature code, no eval, no dynamic paths used for
code loading. Features update ONLY their own entry status on their branches.

Fields:
- id: F01..F15 / B16 / B17 (feature ID per master build plan)
- branch: git branch owning the implementation
- us_ids: Trello US covered (mapping, not completion evidence)
- backend: python package under packages/family_bridge_features/, Django app
  label and routes prefix under /api/v1/
- mobile: JS module under packages/family_bridge_mobile/
- docs: docs/features/<dir>/
- depends_on: feature IDs whose ports this module consumes at integration
- content_kinds: published content kinds the module owns
- deletion_hook: dotted path of the deletion hook implementation (registered
  with F15 at integration; "pending" while module not yet implemented)
- status: planned -> in_progress -> implemented (code+tests in the branch)
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

API_PREFIX = "/api/v1"

FEATURES: List[Dict[str, Any]] = [
    {
        "id": "F01", "title": "Zalo login va ket noi nguoi dong hanh",
        "branch": "feat/f01-zalo-connections", "us_ids": ["US-011", "US-013"],
        "backend": {"package": "family_bridge_features.f01_identity",
                    "app_label": "f01_identity", "routes": "connections"},
        "mobile": {"module": "packages/family_bridge_mobile/f01_identity"},
        "docs": "docs/features/f01",
        "depends_on": [],
        "content_kinds": [],
        "deletion_hook": "pending", "status": "planned",
    },
    {
        "id": "F02", "title": "Dong hanh 4 tuan",
        "branch": "feat/f02-four-week-program", "us_ids": ["US-036", "US-044"],
        "backend": {"package": "family_bridge_features.f02_program",
                    "app_label": "f02_program", "routes": "program"},
        "mobile": {"module": "packages/family_bridge_mobile/f02_program"},
        "docs": "docs/features/f02",
        "depends_on": ["F09"],
        "content_kinds": ["week_topic", "activity", "lesson", "paper_guide",
                          "agreement_template", "guidance"],
        "deletion_hook": "pending", "status": "planned",
    },
    {
        "id": "F03", "title": "Bo the cam xuc",
        "branch": "feat/f03-emotion-cards", "us_ids": ["US-027"],
        "backend": {"package": "family_bridge_features.f03_cards",
                    "app_label": "f03_cards", "routes": "cards"},
        "mobile": {"module": "packages/family_bridge_mobile/f03_cards"},
        "docs": "docs/features/f03",
        "depends_on": ["F01", "F05"],
        "content_kinds": ["emotion_card", "card_group"],
        "deletion_hook": "pending", "status": "planned",
    },
    {
        "id": "F04", "title": "AI ho tro dien dat",
        "branch": "feat/f04-ai-expression", "us_ids": ["US-029", "US-033"],
        "backend": {"package": "family_bridge_features.f04_ai",
                    "app_label": "f04_ai", "routes": "ai"},
        "mobile": {"module": "packages/family_bridge_mobile/f04_ai"},
        "docs": "docs/features/f04",
        "depends_on": ["F06"],
        "content_kinds": [],
        "deletion_hook": "pending", "status": "planned",
    },
    {
        "id": "F05", "title": "Hop thu va phan hoi nhanh",
        "branch": "feat/f05-inbox-replies", "us_ids": ["US-021", "US-028"],
        "backend": {"package": "family_bridge_features.f05_inbox",
                    "app_label": "f05_inbox", "routes": "messages"},
        "mobile": {"module": "packages/family_bridge_mobile/f05_inbox"},
        "docs": "docs/features/f05",
        "depends_on": ["F01"],
        "content_kinds": ["quick_reply"],
        "deletion_hook": "pending", "status": "planned",
    },
    {
        "id": "F06", "title": "Nhap va tam dung 5 phut (300 giay server)",
        "branch": "feat/f06-drafts-five-minute-pause", "us_ids": ["US-030", "US-034"],
        "backend": {"package": "family_bridge_features.f06_drafts",
                    "app_label": "f06_drafts", "routes": ""},
        "mobile": {"module": "packages/family_bridge_mobile/f06_drafts"},
        "docs": "docs/features/f06",
        "depends_on": [],
        "content_kinds": [],
        "deletion_hook": "pending", "status": "planned",
    },
    {
        "id": "F07", "title": "Ghi nhan tam trang va chia se tung muc",
        "branch": "feat/f07-mood-history-sharing", "us_ids": ["US-015", "US-026"],
        "backend": {"package": "family_bridge_features.f07_mood",
                    "app_label": "f07_mood", "routes": "mood"},
        "mobile": {"module": "packages/family_bridge_mobile/f07_mood"},
        "docs": "docs/features/f07",
        "depends_on": ["F01", "F15"],
        "content_kinds": [],
        "deletion_hook": "pending", "status": "planned",
    },
    {
        "id": "F08", "title": "Nhat ky rieng va song hanh",
        "branch": "feat/f08-private-shared-journals", "us_ids": ["US-016", "US-031"],
        "backend": {"package": "family_bridge_features.f08_journal",
                    "app_label": "f08_journal", "routes": "journal"},
        "mobile": {"module": "packages/family_bridge_mobile/f08_journal"},
        "docs": "docs/features/f08",
        "depends_on": ["F01", "F15", "F05"],
        "content_kinds": ["journal_topic"],
        "deletion_hook": "pending", "status": "planned",
    },
    {
        "id": "F09", "title": "Hoat dong ket noi va bai hoc ngan",
        "branch": "feat/f09-activities-micro-lessons", "us_ids": ["US-037"],
        "backend": {"package": "family_bridge_features.f09_activities",
                    "app_label": "f09_activities", "routes": "activities"},
        "mobile": {"module": "packages/family_bridge_mobile/f09_activities"},
        "docs": "docs/features/f09",
        "depends_on": ["F01"],
        "content_kinds": ["activity", "lesson"],
        "deletion_hook": "pending", "status": "planned",
    },
    {
        "id": "F10", "title": "Nut 'Con can duoc lang nghe'",
        "branch": "feat/f10-listening-signal", "us_ids": ["US-032"],
        "backend": {"package": "family_bridge_features.f10_signal",
                    "app_label": "f10_signal", "routes": "signal"},
        "mobile": {"module": "packages/family_bridge_mobile/f10_signal"},
        "docs": "docs/features/f10",
        "depends_on": ["F01", "F05"],
        "content_kinds": [],
        "deletion_hook": "pending", "status": "planned",
    },
    {
        "id": "F11", "title": "Diem tua du phong",
        "branch": "feat/f11-backup-supporters", "us_ids": ["US-022", "US-035"],
        "backend": {"package": "family_bridge_features.f11_supporters",
                    "app_label": "f11_supporters", "routes": "supporters"},
        "mobile": {"module": "packages/family_bridge_mobile/f11_supporters"},
        "docs": "docs/features/f11",
        "depends_on": ["F01"],
        "content_kinds": [],
        "deletion_hook": "pending", "status": "planned",
    },
    {
        "id": "F12", "title": "Lien he thay/co va lich hen",
        "branch": "feat/f12-school-support-appointments",
        "us_ids": ["US-038", "US-046"],
        "backend": {"package": "family_bridge_features.f12_appointments",
                    "app_label": "f12_appointments", "routes": "appointments"},
        "mobile": {"module": "packages/family_bridge_mobile/f12_appointments"},
        "docs": "docs/features/f12",
        "depends_on": ["F13"],
        "content_kinds": [],
        "deletion_hook": "pending", "status": "planned",
    },
    {
        "id": "F13", "title": "Trang tim tro giup doc lap",
        "branch": "feat/f13-help-directory", "us_ids": ["US-039"],
        "backend": {"package": "family_bridge_features.f13_help",
                    "app_label": "f13_help", "routes": "help"},
        "mobile": {"module": "packages/family_bridge_mobile/f13_help"},
        "docs": "docs/features/f13",
        "depends_on": [],
        "content_kinds": [],
        "deletion_hook": "pending", "status": "planned",
    },
    {
        "id": "F14", "title": "Khao sat tu nguyen va bao cao nghien cuu",
        "branch": "feat/f14-surveys-safe-research", "us_ids": ["US-040", "US-045"],
        "backend": {"package": "family_bridge_features.f14_surveys",
                    "app_label": "f14_surveys", "routes": "surveys"},
        "mobile": {"module": "packages/family_bridge_mobile/f14_surveys"},
        "docs": "docs/features/f14",
        "depends_on": ["F01"],
        "content_kinds": [],
        "deletion_hook": "pending", "status": "planned",
    },
    {
        "id": "F15", "title": "Quyen rieng tu, thu hoi, huy ket noi va xoa du lieu",
        "branch": "feat/f15-privacy-revocation-deletion",
        "us_ids": ["US-012", "US-017", "US-023"],
        "backend": {"package": "family_bridge_features.f15_privacy",
                    "app_label": "f15_privacy", "routes": "privacy"},
        "mobile": {"module": "packages/family_bridge_mobile/f15_privacy"},
        "docs": "docs/features/f15",
        "depends_on": ["F01"],
        "content_kinds": [],
        "deletion_hook": "family_bridge_features.f15_privacy.services"
                        ".apply_user_deletion",
        "status": "planned",
    },
    {
        "id": "B16", "title": "Quan tri sau ho tro toan bo F01..F15",
        "branch": "feat/admin-deep-management",
        "us_ids": ["US-014", "US-020", "US-024", "US-025", "US-041"],
        "backend": {"package": "family_bridge_features.admin_core",
                    "app_label": "admin_core", "routes": "admin"},
        "mobile": {"module": "packages/family_bridge_mobile/admin_core"},
        "docs": "docs/features/admin",
        "depends_on": ["F01", "F15"],
        "content_kinds": ["week_topic", "activity", "lesson", "paper_guide",
                          "agreement_template", "guidance", "emotion_card",
                          "card_group", "quick_reply", "journal_topic",
                          "about", "faq", "onboarding", "policy", "brand"],
        "deletion_hook": "pending", "status": "planned",
    },
    {
        "id": "B17", "title": "Van hanh, backup, security CI",
        "branch": "chore/operations-backup-hardening", "us_ids": ["US-018"],
        "backend": {"package": "family_bridge_features.ops_core",
                    "app_label": "ops_core", "routes": "ops"},
        "mobile": {"module": "packages/family_bridge_mobile/ops_core"},
        "docs": "docs/features/ops",
        "depends_on": ["F15"],
        "content_kinds": [],
        "deletion_hook": "pending", "status": "planned",
    },
]

INTEGRATION_BRANCH = {
    "id": "B18", "branch": "review/full-product-integration",
    "base": "chore/full-build-contract-baseline",
    "snapshots": {
        "us-003-backend-foundation": {
            "agent": "A",
            "sha_pinned": "32446fe4c9c269282fc61c3e2af8b8812fd884de",
            "pinned_at": "2026-10-11",
        },
        "us-003-miniapp-ui-foundation": {
            "agent": "B",
            "sha_pinned": "779700556211ddf108d2e9cf896d228584cd10e1",
            "pinned_at": "2026-10-11",
        },
    },
    "status": "planned",
}

# Content kinds owned by B16 lifecycle; features must not invent new kinds
# without a registry + coder review (catalog: admin-configuration-catalog.md).
ALL_CONTENT_KINDS = sorted({k for f in FEATURES for k in f["content_kinds"]})

_MESSAGE_KINDS = ("text", "emotion_card", "journal_reply", "mood_reply",
                  "listening_signal", "quick_reply")

_LISTENING_NEEDS = ("conversation", "being_present", "arrange_chat")

_RELATIONSHIP_KINDS = ("primary", "backup")


def validate_registry() -> List[str]:
    """Cheap structural validation used by tests (allowlist hygiene)."""
    problems: List[str] = []
    all_ids = {f["id"] for f in FEATURES}
    seen_ids = set()
    seen_branches = set()
    seen_labels = set()
    for feature in FEATURES:
        fid = feature["id"]
        if fid in seen_ids:
            problems.append(f"duplicate feature id {fid}")
        seen_ids.add(fid)
        branch = feature["branch"]
        if branch in seen_branches:
            problems.append(f"duplicate branch {branch}")
        seen_branches.add(branch)
        label = feature["backend"]["app_label"]
        if label in seen_labels:
            problems.append(f"duplicate app label {label}")
        seen_labels.add(label)
        if feature["status"] not in {"planned", "in_progress", "implemented"}:
            problems.append(f"bad status for {fid}")
        for dep in feature["depends_on"]:
            if dep not in all_ids:
                problems.append(f"{fid} depends on unregistered {dep}")
    return problems


def get_feature(fid: str) -> Optional[Dict[str, Any]]:
    for feature in FEATURES:
        if feature["id"] == fid:
            return feature
    return None


def set_status(fid: str, status: str) -> None:
    """Feature branches update ONLY their own entry via this helper
    (monotonic: planned -> in_progress -> implemented)."""
    if status not in {"planned", "in_progress", "implemented"}:
        raise ValueError(status)
    feature = get_feature(fid)
    if feature is None:
        raise KeyError(fid)
    feature["status"] = status


def feature_ids() -> List[str]:
    return [f["id"] for f in FEATURES]
