# Report — F15 Quyền riêng tư / thu hồi / hủy kết nối / xóa dữ liệu (B15, vòng 2)

- Feature ID / nhánh / US: F15 / `feat/f15-privacy-revocation-deletion` / US-012, US-017, US-023
- Baseline / head: main `025359502211ec4b2bd1631f300b33e9e7bce4b0` (nhánh đã
  fast-forward; ancestor đã xác minh bằng `git merge-base --is-ancestor`) /
  xem commit cuối của nhánh.
- PR: Draft PR mới về `main` (PR #7 cũ CLOSED, base B00 — không mở lại; đã tìm
  PR mở hiện hành trước khi tạo).
- API contract đầy đủ: `docs/features/f15/api.md` (MỚI).

## Nhãn kết quả

**“F15 review-ready trong phạm vi đã kiểm tra”** — module + wiring production
+ tests; KHÔNG phải “production hoàn tất”, không phải “đã xóa mọi bản sao”,
không claim thiết bị Zalo thật.

## Đã hoàn thiện ở vòng 2 (wiring production, không còn lab-only)

1. **Session F01 thật** — sửa fallback import sai (`..f01_identity` từ package
   `services` trỏ vào `f15_privacy.f01_identity` → ImportError → mọi request
   auth luôn fail); giờ resolve qua `family_bridge_features.f01_identity
   .services.identity.SessionService` (absolute). Integration test boot app
   thật, tạo Session/User synthetic bằng model F01 trên DB test — không
   register labgrants resolver, không fake provider (K2/K8-1).
2. **Grant adapters production** (F07 MoodShare / F08 JournalShare) đáp ứng
   protocol F15 `list_grants/revoke_grant/can_view` — grants ràng buộc
   `connection_id` + `connection_generation`; reader thiếu → deny (fail-closed);
   list bounded + ổn định; không N+1 (1 truy vấn mỗi provider) (K2/K8-2/3).
3. **can_view_item + assert_can_view** — deny-by-default giữ nguyên; thêm
   `assert_can_view` cho domain dùng (404 không lộ existence). Bool đơn thuần
   không mang scope: adapter kiểm đúng connection ID + generation của grant,
   test chứng minh “same pair, generation mới vẫn deny grant cũ” (K2).
4. **Thu hồi + sổ cái nhất quán** — revoke qua F15 API: mutation + ledger
   trong một transaction; `expected_revision` được xử lý THẬT (so với
   `approved_revision` của grant, lệch → 409; không còn nhận rồi bỏ qua) (K3).
5. **Hủy kết nối** — F01 vẫn là endpoint duy nhất; adapter F15
   `revoke_connection_with_privacy`: lock connection → F01 revoke → thu hồi
   grant hai chiều trong cùng transaction → ledger `connection_revoked` CHO
   TỪNG PHÍA (payload grant refs kèm owner_id). Reconnect (generation mới)
   không hồi sinh; gọi lặp idempotent. Patch tích hợp cho view F01 (1 dòng
   gọi adapter) liệt kê ở patch map — pending F01 owner (K3).
6. **Consent làm thay đổi xử lý thật** (K4) — port production nối F01 store;
   `research` rút ĐỒNG THỜI F01 `ConsentRecord` + F14 `ResearchConsent`
   (một transaction, hai store không mâu thuẫn); test chứng minh
   `has_active_consent` → False và F14 `submit` bị chặn `consent_required`;
   unwired → 503 riêng; test cũ chấp nhận `(200,503)` đã THAY bằng assert
   dứt khoát 200 + store thay đổi. Rút khi chưa có đồng ý → ghi nhận
   `declined` (audit không thể bị hiểu là đã accept). AI/service withdrawal
   không khóa help F13 (DEC-08, có test).
7. **Deletion workflow thật** (K5) — per-user lock chống duplicate đồng thời
   (không chỉ atomic+exists); hai ý định khác nhau trả `scope_categories` +
   cờ `covers_requested_categories:false` (không tự hợp nhất); **cutoff
   snapshot** chốt một lần khi vào processing và lưu vào request — retry/replay
   không mở rộng scope, mục tạo sau cutoff sống sót (test); **3 phase** ngắn
   transaction với checkpoint từng category (hook crash không hỏng batch);
   hooks chuẩn hóa `apply_user_deletion(user_id, requested_at)` + verify
   postcondition; **GET list** phục hồi trạng thái (cursor, owner-only);
   detail trả `revision`; verify/process là endpoint HANDLER qua authorizer
   B16 `privacy.case` — fail-closed 503 khi chưa cấu hình, 404 khi thiếu
   capability; DEC-14/18 OPEN nên production vẫn khóa (không public checkbox
   `verified=true`).
8. **Restore fail-closed** (K6) — replay xử lý grant + connection + consent +
   deletion events; hook/provider thiếu, `ok=false`, lỗi, truncated →
   `incomplete:true` + `failures` (không cộng applied như xong); watermark
   `next_after_seq` + `max_events` có trần; replay không viết event mới;
   test fail-closed + idempotent + hai phía.
9. **Overview cursor** — không còn duyệt tất cả rồi `[:50]`; envelope
   `next_cursor/has_more`, test 7 mục qua trang 3 vẫn đủ 7; connections từ
   reader thật (K2 bảng Overview).
10. **Mini App chính thức** (K7) — route `/privacy` trong router chính thức;
    mục “Quản lý chia sẻ & đồng ý” ở Hồ sơ dẫn tới trang; trang dùng page-core
    (MỘT nguồn logic với package) qua `page.render(ctx)` sync + destroy();
    states loading/ready/error/offline/**no_session** (F01 frontend chưa merge
    → trang nói thật “chưa có phiên đăng nhập”, không fake login, không demo
    âm thầm); double-submit guard; mutation mất response → “Chưa xác định kết
    quả” + đọc lại GET đúng một lần; destroy chặn response cũ; F13 help vẫn
    mở. Session bridge tương thích interface F01 đã đối chiếu (dynamic import
    `@vite-ignore` — build không lỗi trước/sau khi F01 hợp nhất).
11. **Tests** — backend 60 (23 cũ cập nhật + 37 wiring/workflow/replay mới);
    package 13 (page-core logic); miniapp 8 DOM mới (trong 112 toàn app);
    chứng minh các lỗi hiện trạng (K8) đã hết — xem `test.md`.

## Bảng danh mục dữ liệu & tác động (category → hook → policy → status)

| Category | Hook | Phạm vi tác động | Status |
| --- | --- | --- | --- |
| mood | MoodDeletionHook (F15) | MoodEntry của chủ (share cascade) theo cutoff | wired (test DB) |
| journal | JournalDeletionHook (F15) | JournalPage của chủ (share/reply cascade) theo cutoff | wired (test DB) |
| surveys | SurveysDeletionHook (F15) | SurveyResponse + ResearchConsent | wired (test DB) |
| connections | ConnectionsDeletionHook (F15) | Connection 2 chiều, invite, claim attempt, session, provider identity, consent record | wired (test DB) |
| account | — | User row | NOT wired — DEC-12/23 OPEN: không tự bật xóa User |
| messages / ai / drafts / program_progress / appointments | — | domain owner hooks | NOT wired → processing trả `hook_not_registered` → `failed_needs_action` (trung thực) |

DEC-12 còn OPEN: KHÔNG chạy hook lên dữ liệu thật; chỉ test DB cô lập.

## Patch map (shared/domain — owner pending review)

| File | Owner | Thay đổi | Status |
| --- | --- | --- | --- |
| `packages/.../f07_mood/services/mood.py` | F07 branch | share(): không trả row revoked (`reshare_after_revoke_requires_edit`); read/list kiểm connection binding + fail-closed khi thiếu reader; list bounded | patch nhỏ, chờ owner confirm |
| `packages/.../f08_journal/services/journal.py` | F08 branch | như trên cho page/reply context | patch nhỏ, chờ owner confirm |
| `tests/feature-lab/harness/settings.py` | Lead/B00 | mở rộng HARNESS_DEPS cho f15 (f07/f08/f14/f13) | accepted trong PR này (diff + tests) |
| `tests/feature-lab/labgrants/f05_fixtures.py` | Lead/B00 | TestConnectionReader implement `list_active_for_user` (port thiếu) | accepted trong PR này |
| `zalo-mini-app/src/app/router.js` | US-003 Agent B (F01 cũng sửa file này) | +1 route `/privacy` | pending merge-reconcile với F01 |
| `zalo-mini-app/src/pages/profile/index.js` | US-003 Agent B (F01 cũng sửa) | enable nút Quản lý chia sẻ & đồng ý → /privacy | pending merge-reconcile với F01 |
| F01 `api.py` connection revoke view | F01 owner | gọi `revoke_connection_with_privacy` (tích hợp 1 dòng) | PATCH ĐỀ NGHỊ — chưa sửa file F01 |

## Kiểm tra đã chạy + lệnh

```bash
# backend harness (SQLite)
bash tests/feature-lab/scripts/test_feature.sh f15_privacy   # 60/60 PASS
bash tests/feature-lab/scripts/test_feature.sh f07_mood      # 19/19 PASS
bash tests/feature-lab/scripts/test_feature.sh f08_journal   # 17/17 PASS
bash tests/feature-lab/scripts/test_feature.sh f14_surveys   # 17/17 PASS
FB_FEATURES=f01_identity ... manage.py test ...f01_identity  # 46 PASS + 2 SKIP (MySQL-gated)
# drift check (không nuốt lỗi như test_feature.sh)
DJANGO_SETTINGS_MODULE=harness.settings DJANGO_ENV=test FB_FEATURES=f15_privacy \
  python manage.py makemigrations --check --dry-run
# miniapp
cd zalo-mini-app && node --test tests/*.test.mjs   # 112/112 PASS
cd zalo-mini-app && npm run build                  # OK (bundle /privacy xuất hiện)
node --test packages/family_bridge_mobile/f15_privacy/tests/*.test.mjs  # 13/13 PASS
python scripts/check_agent_docs.py && git diff --check
```

## NOT_RUN / chưa kiểm chứng (giới hạn chứng cứ)

- MySQL/TiDB thật (race revoke-vs-read 2 connections, khóa user-row dưới tải):
  NOT_RUN — không có DB trong môi trường; SQLite chỉ chứng minh logic khóa.
  Suite race MySQL-gated sẽ bổ sung khi có môi trường được phép.
- Thiết bị Zalo/Mini App thật, hai tài khoản thật: NOT_RUN — kịch bản hai tài
  khoản tại `docs/features/f15/two-account-script.md` để Antigravity chạy.
- Restore drill thật trên backup: NOT_RUN (B17 runbook + operator; replay đã
  test fail-closed trên DB test).
- Production wiring đầy đủ (F01 view gọi adapter revoke; B16 cấp
  `privacy.case`): pending owner — module-ready, integration pending.
- Auth/privacy/Zalo policy: đối chiếu qua decision register + security rules
  (SEC-03/04/05/08/14/19/21/22, WF-04/17/21/22) ngày 13/10/2026; Zalo
  developer program agreement đã được chat cố vấn đối chiếu 13/10/2026 (không
  mở lại link mới trong đợt này — không claim đọc thêm).

## Còn cần quyết định / thao tác bên ngoài

- DEC-12 (retention từng loại), DEC-13 (thư sau unlink — hiện fail-closed),
  DEC-14/18 (verification/handler), DEC-23 (trẻ vị thành niên) — còn OPEN.
- B16: thêm capability `privacy.case` + assignment scope theo CAP-20.
- F01: hợp nhất router/profile + gọi adapter revoke trong view.
- F05/F04/F06/F12/F02/F09: đăng ký deletion hook của domain khi có policy.
