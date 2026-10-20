"""import_content_bundle — importer NOI DUNG THAT idempotent cho B16.

Nguon: goi ban giao bien soan (content-items.json — 1 f02_program +
16 activity joint + 8 micro_lesson). Command chi tao ContentItem bang
lifecycle that (ContentLifecycleService), khong bao gio ghi Account/
Connection/Enrollment/Progress/Invite/Message/Mood/Journal/Consent.

AN TOAN QUYEN (khong bypass API gate):
- --actor bat buoc: phai la user that trong accounts, co grant
  content.manage (tao draft) va content.publish (khi --publish) con han
  — kiem lai bang AdminCapabilityService trong command (goi service
  truc tiep van phai qua cung mot lop kiem tra; khong co system actor
  gia, khong tu cap cap, khong is_staff shortcut).
- Dry-run la MAC DINH: khong co --apply thi khong co mutation nao.
- Publish theo thu tu phu thuoc: cac item phu (activity + micro_lesson)
  truoc, program cuoi cung; expected_revision va audit cua lifecycle.

IDEMPOTENT (chay lai an toan):
- Doi chieu theo content_key + canonical payload (kind/title/audience/
  body). Moi key co the co nhieu revision trong lich su (clone -> publish
  giu nguyen release cu) nen KHONG bao gio ket luan theo "so dong"; ket
  luan theo payload match co thu tu (revision moi truoc).
- Chay lai cung file: khong tao them row, khong them revision, khong
  them audit event (skip im lang co bao cao).
- Bundle khac payload / key da retired / co draft dang soan cua nguoi
  khac => BAO CONFLICT (exit 3), khong tu ghi de, khong tu tai publish
  retired.
- Race hai importer song song: chan bang unique constraint
  (content_key, revision) (migration 0002) + IntegrityError retry co
  ranh gioi — mot winner, ben thua doc lai va so sanh canonical
  (idempotent). Kiem that tren MySQL (test race); SQLite khong duoc dung
  lam bang chung race.

BAO CAO: catalog_id + sha256 canonical, per-key outcome/content_id/
revision/status, counts, publish/verify outcomes. Khong log token, mat
khau hay PII (actor chi xac nhan qua ket qua kiem tra cap).
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from django.core.management.base import BaseCommand, CommandError
from django.db import IntegrityError, transaction

from django.contrib.auth import get_user_model

from family_bridge_core.errors import FamilyBridgeError

from ...content_validation import (
    ACTIVITY_KIND, LESSON_KIND, PROGRAM_KIND, BundleValidationError,
    canonical_json, load_bundle_file,
)
from ...models import (
    CONTENT_DRAFT, CONTENT_PUBLISHED, CONTENT_RETIRED, ContentItem,
)
from ...services.admin import AdminCapabilityService, ContentLifecycleService

_INTEGRITY_RETRIES = 3


def _key_rows(content_key: str) -> List[ContentItem]:
    """Bounded history for a key, newest revision first."""
    return list(ContentItem.objects.filter(content_key=content_key)
                .order_by("-revision")[:10])


def _payload_matches(item: ContentItem, *, kind: str, title: str,
                     audience: str, body_obj: Dict[str, Any]) -> bool:
    try:
        existing_body = json.loads(item.body or "")
    except (ValueError, TypeError):
        return False
    return (item.kind == kind
            and item.title == title
            and item.audience == audience
            and canonical_json(existing_body) == canonical_json(body_obj))


def _match_row(rows: List[ContentItem], *, kind: str, title: str,
               audience: str, body_obj: Dict[str, Any],
               include_retired: bool = False) -> Optional[ContentItem]:
    """First row (newest revision first) whose payload equals the bundle.
    Retired rows NEVER satisfy a match: a retired release is terminal and
    must surface as conflict_retired, never as an idempotent skip."""
    for row in rows:
        if (not include_retired and row.status == CONTENT_RETIRED):
            continue
        if _payload_matches(row, kind=kind, title=title,
                            audience=audience, body_obj=body_obj):
            return row
    return None


class Command(BaseCommand):
    help = ("Import ban giao noi dung that (program 4 tuan + activities + "
            "micro-lessons) bang lifecycle B16 idempotent. Dry-run mac dinh.")

    def add_arguments(self, parser):
        parser.add_argument("--source", required=True,
                            help="Duong dan content-items.json (bundle)")
        parser.add_argument("--actor", required=True,
                            help="UUID user that co cap content.manage/publish")
        parser.add_argument("--apply", action="store_true",
                            help="Thuc su tao DRAFT (mac dinh chi dry-run)")
        parser.add_argument("--publish", action="store_true",
                            help="Apply + publish cac item phu truoc, program "
                                 "cuoi (can cap content.publish)")
        parser.add_argument("--json", action="store_true",
                            help="Bao cao JSON theo cau truc (stdout)")

    # ------------------------------------------------------------------
    def _cap_ok(self, actor_id: str, capability: str) -> bool:
        return AdminCapabilityService().has_capability(
            actor_id=actor_id, capability=capability)

    # ------------------------------------------------------------------
    def _plan_row(self, item: Dict[str, Any], apply_changes: bool
                  ) -> Dict[str, Any]:
        """Decide the outcome for ONE key without mutating anything.

        Semantics (lifecycle-correct):
        - payload match (any revision, newest first) -> exists_same
          (draft) / already_published (published); importer never touches
          another revision's editorial work.
        - no match + any retired row -> conflict_retired (terminal state;
          a retired release is only ever replaced by a NEW clone/review
          cycle, never by a re-import).
        - no match + any draft row -> conflict_pending_draft (someone is
          editing a new revision — re-import must not interfere).
        - no match + published-only history -> conflict_payload_diff
          (this bundle differs from every release of this key).
        - no rows at all -> create/would_create_draft.
        """
        key = item["content_key"]
        row: Dict[str, Any] = {
            "content_key": key, "kind": item["kind"],
            "title": item["title"], "audience": item["audience"],
        }
        rows = _key_rows(key)
        match = _match_row(rows, kind=item["kind"], title=item["title"],
                           audience=item["audience"], body_obj=item["body"])
        if match is not None:
            row["content_id"] = str(match.id)
            row["revision"] = match.revision
            row["status"] = match.status
            row["outcome"] = ("already_published"
                              if match.status == CONTENT_PUBLISHED
                              else "exists_same")
            return row
        statuses = {r.status for r in rows}
        if CONTENT_RETIRED in statuses:
            row["outcome"] = "conflict_retired"
        elif CONTENT_DRAFT in statuses:
            row["outcome"] = "conflict_pending_draft"
        elif CONTENT_PUBLISHED in statuses:
            row["outcome"] = "conflict_payload_diff"
        else:
            row["outcome"] = ("would_create_draft" if not apply_changes
                              else "create_draft")
        return row

    # ------------------------------------------------------------------
    def handle(self, *args, **options):
        source: str = options["source"]
        actor: str = str(options["actor"]).strip()
        apply_changes: bool = bool(options["apply"])
        publish: bool = bool(options["publish"])
        as_json: bool = bool(options["json"])

        if publish:
            apply_changes = True

        # 1) Bundle load + validate (mutates nothing)
        try:
            catalog_id, catalog_hash, items = load_bundle_file(source)
        except (OSError, ValueError) as exc:
            raise CommandError(f"khong doc duoc bundle: {exc}")
        except BundleValidationError as exc:
            self.stderr.write("VALIDATION_FAILED")
            for problem in exc.problems:
                self.stderr.write(f"  - {problem}")
            raise CommandError(f"bundle khong hop le: {len(exc.problems)} loi")

        # 2) Actor that + cap checks (re-checked HERE even though the
        #    lifecycle service is the same one behind the capability-gated
        #    API — CLI must not become a bypass).
        actor_exists = get_user_model().objects.filter(pk=actor).exists()
        cap_manage = self._cap_ok(actor, "content.manage") if actor_exists else False
        cap_publish = self._cap_ok(actor, "content.publish") if actor_exists else False
        report: Dict[str, Any] = {
            "catalog_id": catalog_id,
            "catalog_sha256": catalog_hash,
            "dry_run": not apply_changes,
            "publish_requested": publish,
            "actor_exists": actor_exists,
            "cap_content_manage": cap_manage,
            "cap_content_publish": cap_publish,
            "items": [],
            "counts": {},
            "publish": [],
            "verify": {},
        }
        if not actor_exists:
            report["counts"]["error"] = "actor_not_found"
            self._emit(report, as_json)
            raise CommandError("actor khong ton tai trong he thong — khong "
                               "duoc dung system actor gia")
        if not cap_manage:
            report["counts"]["error"] = "cap_denied_content_manage"
            self._emit(report, as_json)
            raise CommandError("actor thieu cap content.manage — tu choi import")
        if publish and not cap_publish:
            report["counts"]["error"] = "cap_denied_content_publish"
            self._emit(report, as_json)
            raise CommandError("actor thieu cap content.publish — tu choi --publish")

        # 3) Plan per key (NO mutation)
        plan = [self._plan_row(item, apply_changes) for item in items]
        report["items"] = plan
        conflicts = [r for r in plan if r["outcome"].startswith("conflict")]
        if conflicts:
            report["counts"]["conflicts"] = len(conflicts)
            self._emit(report, as_json)
            raise CommandError(
                f"{len(conflicts)} conflict — khong ghi de tu dong "
                f"(keys: {[r['content_key'] for r in conflicts][:5]})")

        # 4) Apply (drafts) — transactional per item, race-safe retry
        created = skipped = 0
        if apply_changes:
            service = ContentLifecycleService()
            body_json_by_key = {i["content_key"]: canonical_json(i["body"])
                                for i in items}
            for item in items:
                key = item["content_key"]
                outcome = next(r for r in plan if r["content_key"] == key)
                if outcome["outcome"] in ("exists_same", "already_published"):
                    skipped += 1
                    continue
                attempt = 0
                while True:
                    attempt += 1
                    try:
                        with transaction.atomic():
                            # Re-read inside the transaction: the winner of
                            # a race may exist by now. The unique constraint
                            # (content_key, revision) is the real guard —
                            # select_for_update on an empty queryset proves
                            # nothing.
                            rows = _key_rows(key)
                            match = _match_row(
                                rows, kind=item["kind"], title=item["title"],
                                audience=item["audience"],
                                body_obj=item["body"])
                            if match is not None:
                                outcome["outcome"] = ("already_published"
                                                      if match.status ==
                                                      CONTENT_PUBLISHED
                                                      else "exists_same")
                                outcome["content_id"] = str(match.id)
                                outcome["revision"] = match.revision
                                outcome["status"] = match.status
                                skipped += 1
                                break
                            created_item = service.create_draft(
                                actor_id=actor, kind=item["kind"],
                                title=item["title"],
                                body=body_json_by_key[key],
                                audience=item["audience"],
                                content_key=key)
                        outcome["outcome"] = "created_draft"
                        outcome["content_id"] = str(created_item.id)
                        outcome["revision"] = created_item.revision
                        outcome["status"] = created_item.status
                        created += 1
                        break
                    except IntegrityError:
                        if attempt >= _INTEGRITY_RETRIES:
                            raise CommandError(
                                f"race khong giai quyet duoc sau "
                                f"{_INTEGRITY_RETRIES} lan (key={key})")
                        continue
                    except FamilyBridgeError as exc:
                        raise CommandError(
                            f"lifecycle tu choi key={key}: "
                            f"{getattr(exc, 'code', exc)}")
        report["counts"]["created_draft"] = created
        report["counts"]["skipped_same"] = skipped
        report["counts"]["planned_total"] = len(items)

        # 5) Publish — dependents first, program last, expected_revision
        published = 0
        if publish:
            service = ContentLifecycleService()
            publish_order = ([i for i in items if i["kind"] != PROGRAM_KIND]
                             + [i for i in items if i["kind"] == PROGRAM_KIND])
            failures: List[str] = []
            for item in publish_order:
                key = item["content_key"]
                row = {"content_key": key}
                target: Optional[ContentItem] = None
                plan_row = next(r for r in plan if r["content_key"] == key)
                if plan_row.get("content_id"):
                    target = ContentItem.objects.filter(
                        pk=plan_row["content_id"]).first()
                if target is None:
                    rows = _key_rows(key)
                    target = _match_row(
                        rows, kind=item["kind"], title=item["title"],
                        audience=item["audience"], body_obj=item["body"])
                if target is None:
                    row["outcome"] = "error_not_found"
                    failures.append(key)
                    report["publish"].append(row)
                    continue
                row["content_id"] = str(target.id)
                row["revision"] = target.revision
                if target.status == CONTENT_PUBLISHED:
                    row["outcome"] = "already_published"
                    published += 1
                    report["publish"].append(row)
                    continue
                if target.status != CONTENT_DRAFT:
                    row["outcome"] = f"error_status_{target.status}"
                    failures.append(key)
                    report["publish"].append(row)
                    continue
                try:
                    done = service.publish(actor_id=actor,
                                           content_id=str(target.id),
                                           expected_revision=target.revision)
                    row["outcome"] = "published"
                    row["status"] = done.status
                    published += 1
                except FamilyBridgeError as exc:
                    row["outcome"] = f"error_{getattr(exc, 'code', 'lifecycle')}"
                    failures.append(key)
                report["publish"].append(row)
            if failures:
                report["counts"]["error"] = "publish_incomplete"
                self._emit(report, as_json)
                raise CommandError("publish chua hoan tat (phu thuoc phai xong "
                                   f"truoc program): {failures[:5]}")

        # 6) Verify qua DOC GIA SAN XUAT that (cung lop ma API dung) —
        #    khong chi dem row trong DB.
        if publish and published == len(items):
            report["verify"] = self._verify_published(items)

        self._emit(report, as_json)

    # ------------------------------------------------------------------
    def _verify_published(self, items: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Read back through the production readers (the same classes the
        API registries expose): F09 catalog windows + F02 program parse +
        reference resolution. Read-only."""
        result: Dict[str, Any] = {}
        from family_bridge_features.f02_program.wiring import (
            PublishedContentProgramProvider,
        )
        from family_bridge_features.f09_activities.wiring import (
            PublishedContentActivityReader,
        )
        from family_bridge_features.f09_activities.services.activities import (
            ActivityService,
        )

        reader = PublishedContentActivityReader()
        cards = reader.list_published(limit=50)
        by_key = {c["content_key"]: c for c in cards}
        activities = [i for i in items if i["kind"] == ACTIVITY_KIND]
        lessons = [i for i in items if i["kind"] == LESSON_KIND]
        program = next(i for i in items if i["kind"] == PROGRAM_KIND)

        result["f09_catalog_window_size"] = len(cards)
        result["activities_in_catalog"] = sum(
            1 for a in activities if a["content_key"] in by_key)
        result["lessons_in_catalog"] = sum(
            1 for l in lessons if l["content_key"] in by_key)
        result["lesson_minutes_ok"] = all(
            by_key.get(l["content_key"], {}).get("minutes") == 1
            for l in lessons)

        # service-level catalog (kind filter + audience contract)
        service = ActivityService()
        result["svc_activity_catalog"] = len(service.catalog(kind="activity"))
        result["svc_lesson_catalog"] = len(service.catalog(kind="micro_lesson"))

        provider = PublishedContentProgramProvider()
        programs = provider.list_programs()
        parsed = [p for p in programs
                  if p["program_key"] == program["content_key"]]
        result["program_parsed"] = bool(parsed)
        if parsed:
            prog = parsed[0]
            result["program_weeks"] = len(prog["weeks"])
            result["program_week_refs_total"] = sum(
                len(w["joint_activity_keys"]) for w in prog["weeks"])
            result["program_refs_resolvable"] = all(
                w_key in by_key
                for w in prog["weeks"]
                for w_key in w["joint_activity_keys"])
        return result

    # ------------------------------------------------------------------
    def _emit(self, report: Dict[str, Any], as_json: bool) -> None:
        if as_json:
            self.stdout.write(json.dumps(report, ensure_ascii=False,
                                         indent=2))
            return
        counts = report.get("counts", {})
        mode = "DRY-RUN" if report.get("dry_run") else "APPLY"
        self.stdout.write(
            f"[{mode}] {report.get('catalog_id')} "
            f"sha256={str(report.get('catalog_sha256'))[:12]}…")
        for row in report.get("items", []):
            suffix = ""
            if row.get("content_id"):
                suffix = (f" id={row['content_id'][:8]}… "
                          f"rev={row.get('revision')} {row.get('status')}")
            self.stdout.write(f"  {row['content_key']}: {row['outcome']}{suffix}")
        for row in report.get("publish", []):
            self.stdout.write(f"  publish {row['content_key']}: {row['outcome']}")
        if report.get("verify"):
            self.stdout.write(f"  verify: {report['verify']}")
        if counts:
            self.stdout.write(f"  counts: {counts}")
