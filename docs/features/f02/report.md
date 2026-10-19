# Report — F02 Chương trình đồng hành 4 tuần (B02)

- Feature ID / nhánh / US: F02 / feat/f02-four-week-program / US-036, US-044
- Baseline SHA (B00) / head: `cc6ade2f2c1d1760172046f045b3cf8c2d9894d7` / xem commit cuối
- PR: target `chore/full-build-contract-baseline` (URL trong PR list)

## Đã có

- **Tự nguyện + version pin**: enroll pin revision; re-publish tạo
  revision MỚI trong khi các revision đã publish vẫn tra cứu được
  (fixture trung thực với contract immutability) — enrollment KHÔNG bị
  migrate thầm; re-enroll là hành động tường minh (test pin giữ nguyên +
  catalog ra revision mới + re-pin sau khi chọn).
- **Cả 4 tuần đều xem được** (US-036 mục 1): weeks trả locked=false cho
  mọi tuần; suggested_week chỉ mang tính thông tin (first incomplete);
  opt-out → 404 trung thực (không có enrollment), rejoin tự nguyện.
- **Progress riêng tư** (WeekProgress UNIQUE participant+activity):
  done/skipped/reset (reset xóa sạch); activity phải thuộc chương trình
  đã pin (400 nếu ngoài); stranger không xem được gì (404).
- **Thỏa ước bất biến theo revision** (US-036 mục 8): AgreementAcceptance
  UNIQUE (participant, program, agreement_revision) — idempotent; MỖI
  người tự accept (không có endpoint ký hộ — gửi participant_id → 400
  unknown field); template sửa → agreement revision mới → phải accept
  lại (test old-binding + fresh-required); hai acceptance cùng revision
  là hai row độc lập của hai người.
- **Sổ giấy**: guide text tùy chọn ghi nhận, không bắt upload (test
  wording + không có upload endpoint).
- **Không nhân bản F09**: joint_activity_keys tham chiếu qua key; invite
  2 chiều dùng F09 (wiring B18 ghi trong report); WeekProgress chỉ ghi
  nhận cá nhân.
- Mobile program.js: enroll/opt-out/agreement/weeks với wording tự nguyện
  rõ ràng; textContent; registry F02 routes ""; harness carry-forward +
  content double giữ lịch sử revision.

## Lệnh kiểm tra

```bash
bash tests/feature-lab/scripts/test_feature.sh f02_program
node --test packages/family_bridge_mobile/f02_program/tests/f02.test.mjs
# Suite rộng:
cd tests/feature-lab && DJANGO_SETTINGS_MODULE=harness.settings \
  DJANGO_ENV=test FB_FEATURES=f02_program python manage.py test harness labgrants family_bridge_features.f02_program
```

Kết quả: f02 12/12 backend PASS; suite rộng 34/34 PASS (SQLite); mobile
node 3/3 PASS.

## DSA

- UNIQUE(participant, program) enrollment; UNIQUE(participant, program,
  activity) progress; UNIQUE(participant, program, agreement_revision)
  acceptance — mọi lookup O(log N); weeks view gom 1 query progress +
  provider catalog (bounded).

## Security/privacy

- SEC-03: published-only; revision pin trung thực (không silent migrate).
- SEC-04: progress/agreement per-participant; không có family-wide reads
  (stranger 404); không ai ký hộ (structure test).
- Tự nguyện: opt-out không phạt; không streak/ranking; gợi ý không khóa.
- Nội dung 4 tuần là TEST-ONLY synthetic — production cần Thầy duyệt
  (US-009) qua B16 lifecycle.

## Kết quả

- PASS: 12 backend f02 + 34/34 harness suite + 3 mobile (SQLite local).
- NOT_RUN: none đáng kể.
- BLOCKED: none trong phạm vi module; program content thật (US-009) +
  F09 invites wiring ở B18.

## Còn lại / Input cần

- B18: wire program provider thật (B16 lifecycle); nối joint activities
  qua F09 invites; nối program page vào navigation; agreement template
  chính thức chờ Thầy duyệt.

---

## Cập nhật 2026-10-16 (Phần B — nhánh `tinh-nang/f02-dong-hanh-bon-tuan-us036-us044`, base main `72930ae`)

Superseed phần "Còn lại / Input cần" ở trên cho các mục đã làm xong trong
commit `ae837b3` (nội dung cũ giữ nguyên để đối chiếu lịch sử):

- **Provider production đã wire** (bổn cũ: "B18 wire provider"): 
  `f02_program/apps.py` ready() đăng ký `PublishedContentProgramProvider`
  đọc B16 ContentItem `kind=f02_program` status=published (fail-closed:
  draft/malformed không lộ; đúng 4 tuần 1..4; bounded 20) +
  `F01ConnectionReader` (canonical pair/generation). f09_activities cũng
  wire content reader + connection reader cùng cơ chế. Harness tests vẫn
  dùng test double (reset_registries + register đè sau ready()).
- **Thỏa ước gia đình tuần 4 (instance của đúng cặp)**: model
  `FamilyAgreement` (pair_low/high, connection_generation,
  agreement_revision, program_revision; UNIQUE per pair+revision+generation)
  + API GET `/program/agreement`, POST `propose|{id}/confirm|{id}/withdraw`.
  State machine theo `docs/product/four-week-flow.md` (draft → proposed →
  confirmed khi HAI actor khác nhau của cùng cặp tự xác nhận CÙNG revision;
  superseded/withdrawn/ended). Confirm yêu cầu: member của cặp + active
  connection cùng generation + enrollment cùng program_revision. Lưu ý:
  `AgreementAcceptance` cá nhân (template) giữ nguyên để tương thích
  consumer cũ.
- **Progress revision pin**: `WeekProgress.program_revision` (migration
  `0002_familyagreement_and_more`, prod có 0 row tại thời điểm thêm) —
  activity_key tái dụng ở revision mới không kế thừa status cũ.
- **Nội dung 4 chủ đề DRAFT**: `seed_f02_draft_program` tạo 4 tuần đúng 4
  chủ đề Huy nêu + 4 hoạt động chung F09 ở trạng thái DRAFT trong B16.
  KHÔNG tự publish — chờ người có `content.publish` duyệt (WF-15). Trước
  khi publish, API trả trung thực "chưa có nội dung phát hành".
- **UI Mini App thật**: `/companion` đọc programMy/programCatalog/weeks/
  progress/agreement qua shared adapter (additive 69→81 method); không còn
  WEEKS hardcode/"Sắp có" theo tiến độ; tham gia/opt-out tường minh; tiến độ
  riêng; thỏa ước 2 bên; lời mời F09 hai chiều; sổ giấy không ép.

### Bằng chứng kiểm tra (2026-10-16)

| Bộ | Kết quả |
| --- | --- |
| Backend feature-lab (đúng lệnh CI) | 482 tests OK (skip 9 như baseline) — gồm 7 case mới wiring/agreement/revision |
| Mobile module tests (đúng lệnh CI mobile job) | PASS toàn bộ (F02 4/4) |
| Mini App suite | 305/305 (gồm 8 case mới companion-program + pin test cập nhật) |
| Shared package tests | 34/34 (ADAPTER_METHODS 81) |
| E2E backend thật local (sqlite, wiring production) | 44/44 — connect F16 → catalog → enroll 2 người → 4 tuần mở → tiến độ 2 người độc lập (done/skipped, rev1) → F09 invite 2 chiều → thỏa ước confirmed (2 timestamp) → withdraw proposer-only → opt-out 404 trung thực |
| Web regression (không sửa web) | 187/187 + build OK |
| Import boundary | CLEAN |
| Mini App build + verify Zalo manifest | OK |

MySQL thật: migration 0002 là DDL chuẩn Django (add column nullable + đổi
unique constraint) — đã chạy test DB sqlite; MySQL/TiDB thật là NOT_RUN
(chạy khi có môi trường; runbook trong handover). Zalo device test: NOT_RUN
(bàn giao Antigravity deploy Testing + Huy test).

### Blocker phát hành nội dung (trung thực)

- Nội dung 4 chủ đề hiện là **draft** trong thư viện B16 (nếu đã chạy seed).
  Cần người có capability `content.publish` (thầy/người phụ trách) review +
  publish từng item; việc này thuộc phê duyệt CHUYÊN MÔN, không phải kỹ thuật.
  Draft source: `packages/family_bridge_features/f02_program/management/
  commands/seed_f02_draft_program.py` (WEEKS_BODY) — sửa nội dung tại đây
  hoặc qua admin B16 trước khi publish.

## Vòng 2 (2026-10-16): sửa 4 lỗi audit R1–R4 sau kiểm thử độc lập

Audit kiểm thử lại main A + F02 B tại head `b482c5c` tìm thấy 4 lỗi (báo cáo
`KET-QUA-KIEM-THU-MAIN-VA-F02-2026-10-16.md`). Đã sửa ĐÚNG nguyên nhân trên
nhánh F02, mỗi lỗi kèm regression tests dùng data shape thật:

- **R1 (contract backend/UI lời mời)**: response weeks vốn trả
  `activities:[{activity_key,status}]` nhưng UI đọc field ma
  `joint_activity_keys` (tests cũ tự thêm field này vào fixture nên che mất).
  Sửa: UI dựng lời mời + tiến độ từ `week.activities`; revision/tiêu đề/thời
  lượng lấy từ `GET /api/v1/activities/catalog` (F09, nguồn thật); bỏ
  hardcode `contentRevision: 1`; hoạt động ngoài catalog → nút khóa kèm lý
  do. Backend giữ nguyên contract (không thêm field ma).
- **R2 (thỏa ước confirmed bị supersede sớm)**: `propose_family_agreement`
  cũ supersede cả `confirmed` ngay khi propose revision mới. Sửa theo
  `docs/product/four-week-flow.md`: propose mới chỉ supersede PENDING cũ;
  bản confirmed giữ hiệu lực đến khi revision mới đủ HAI xác nhận
  (supersede tại `confirm_family_agreement` như cũ); re-propose revision đã
  superseded dưới một bản confirmed còn hiệu lực bị từ chối
  (`agreement_revision_outdated`). Overview trả thêm `effective_agreement` +
  `pending_proposal`; UI hiện CẢ HAI (bản hiệu lực + bản đang chờ).
- **R3 (pin rev cũ tràn cửa sổ catalog)**: `_published` quét catalog 10 /
  provider 20 nên pin cũ rơi khỏi cửa sổ → `program_not_published` dù vẫn
  published. Sửa: thêm `PublishedContentProgramProvider.get_program` — exact
  lookup `(content_key, revision)` bounded (≤1 row), service ưu tiên exact
  lookup, catalog list giữ nguyên bounds 20/10 (không quét lịch sử).
- **R4 (nuốt lỗi mutation tiến độ)**: `onProgress` và các mutation
  enroll/invite/respond/withdraw/opt-out/propose trước đây `.catch(()=>{})`.
  Sửa: helper `runMutation` — hiện lỗi thật theo `ApiError.kind`/`reason`,
  chặn bấm lặp khi đang gửi, KHÔNG tự retry (nút bật lại cho thử lại chủ
  động), guard phiên: phản hồi của phiên cũ (logout/đổi actor) không cập
  nhật UI/private state của phiên mới; cleanup dialog khi rời trang.

Bằng chứng trước → sau: 3 probe backend (trước: 2 fail R2/R3) và 2 probe DOM
(trước: 2 fail R1/R4) của audit chạy lại trên head mới ĐỀU PASS. Suite sau
sửa: backend full (CI parity) 494 OK skip 9 (SQLite); F02 31/31 (gồm 10 case
mới); Mini App 313/313 (gồm 8 case mới); shared 34/34; mobile F02 4/4; web
regression 187/187 (không sửa `web/**`); build + verify manifest Zalo OK;
import boundary CLEAN; `makemigrations f02_program --check` sạch;
`check_agent_docs.py` OK. NOT_RUN giữ nguyên: MySQL/TiDB thật (migration/
concurrency), Zalo Android/iOS device, backend B qua HTTPS trên điện thoại.
