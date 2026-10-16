# VERIFICATION-LOG — W3-a (checkout sạch + E2E hai actor)

Người chạy: AGENT W3-A (kiểm chứng độc lập, Task 20-a). Ngày: 2026-10-17.
Repo gốc: `/home/z/my-project/fb-websep-wt` (branch `tinh-nang/web-miniapp-separation`).
Bản sao sạch: `/home/z/my-project/tmp-clean-fbwebsep` (xóa sau khi chạy xong).
Mọi mật khẩu/mã khởi tạo sinh NGẪU NGHIÊN qua biến môi trường, KHÔNG BAO GIỜ in trong log này (ghi `<redacted>`).

## Phần 1 — Checkout sạch (tái lập build từ lockfile)

| # | Lệnh | Exit code | Kết quả chính |
|---|------|-----------|----------------|
| 1.1 | `git clone /home/z/my-project/fb-websep-wt /home/z/my-project/tmp-clean-fbwebsep` | 0 | clone local, không network; branch `tinh-nang/web-miniapp-separation`; HEAD `2a91047` ("feat(web): port 8 trang phuc tap …"); `git status --porcelain` = 0 dòng (sạch) |
| 1.2 | `cd web && npm ci` | 0 | node `v24.21.0`, npm `11.19.0`; cài từ package-lock.json, không lỗi |
| 1.3 | `cd web && npm run build` (vite build) | 0 | `dist/index.html` TỒN TẠI; `dist/assets/` = **44 file**; built OK |
| 1.4 | `cd zalo-mini-app && npm ci` | 0 | không lỗi |
| 1.5 | `cd zalo-mini-app && npm test` (node --test) | 0 | **279 tests: 279 pass / 0 fail / 0 skipped / 0 todo** (49 suites, ~86s) |
| 1.6 | `cd zalo-mini-app && npm run build` (vite build + verify-build.mjs) | 0 | build vào `www/` (~1.9M); verify-build in: `Verified Zalo app-config and all referenced assets` |
| 1.7 | `node --test packages/family_bridge_shared/tests/*.test.mjs` (từ root clean) | 0 | **34 tests: 34 pass / 0 fail / 0 skipped** (8 suites) — gồm purity contract (shared không DOM/SDK/storage) |
| 1.8 | `node scripts/check_import_boundaries.mjs --json …/import-boundaries.json` | 0 | **5/5 assert PASS**: (a) web closure không chứa zalo-mini-app/** — web closure 63 nodes; (b) mini closure không chứa web/** — 69 nodes; (c) shared thuần — quét 10 file src; (d) web không zmp-sdk/localStorage./sessionStorage.; (e) web closure không bare import zmp-sdk. Kết luận: SẠCH, 0 unresolved import |

Ghi chú trung thực:
- Build web chạy 2 lần trong phiên này: lần 1 trong bản clone sạch (bảng trên, không biến VITE_API_BASE_URL), lần 2 trong worktree thật với `VITE_API_BASE_URL=http://127.0.0.1:8001` phục vụ Part 3 (dist đã gitignore).
- Log chi tiết từng lệnh: `web-npm-ci.log`, `web-build.log`, `mini-npm-ci.log`, `mini-test.log`, `mini-build.log`, `shared-tests.log`, `import-boundaries.log` (+ `.json`) cùng thư mục này.

## Phần 2 — E2E hai actor (API thật, Django + sqlite, CORS preflight)

Script: `/home/z/my-project/scripts/websep_e2e_two_actors.mjs` (node ESM thuần, fetch có sẵn, node v24.21.0).
Hạ tầng do script tự quản lý: migrate → provision (dry-run rồi apply) → `runserver 127.0.0.1:8001 --noreload` trong worktree thật `/home/z/my-project/fb-websep-wt/backend` bằng venv `/home/z/my-project/fb-backend-wt/.venv/bin/python` (Python 3.12.15, Django theo requirements.txt) → chờ `/api/v1/ready/` 200 (timeout 60s) → chạy S1–S16 → SIGTERM + đợi exit.

Env server (tất cả sinh/lấy từ env của script): `DJANGO_SECRET_KEY`=<random 50+>, `DB_ENGINE=sqlite`, `DJANGO_ENV=development`, `FB_ZALO_LOGIN_ENABLED=false`, `CORS_ALLOWED_ORIGINS=http://127.0.0.1:8080,http://localhost:8080`, `FB_CLASS_INITIAL_PASSWORD`=<random, chỉ in `<redacted>`).

CSV (synthetic, đặt tại thư mục này):
- `accounts.csv`: header `external_ref,login_code,role,class_ref,display_name`; 4 dòng HS001/HS002 (role student) + PH001/PH002 (role caregiver), class_ref `6A`.
- `pairs.csv`: header `student_login_code,caregiver_login_code`; HS001–PH001, HS002–PH002.

### Provision

| Lệnh | Exit code | Kết quả |
|------|-----------|---------|
| `manage.py migrate` (env như trên, db.sqlite3 mới hoàn toàn) | 0 | schema sqlite tạo tại `backend/db.sqlite3` (gitignore `*.sqlite3`) |
| `manage.py provision_classroom --csv accounts.csv --proposals-csv pairs.csv --initial-password-env FB_CLASS_INITIAL_PASSWORD --json --dry-run` | 0 | dự kiến tạo 4 tài khoản + 2 proposal, 0 lỗi |
| như trên, KHÔNG `--dry-run` (apply) | 0 | tạo 4 tài khoản + 2 proposal, 0 lỗi (JSON summary trong `provision-apply.log`) |
| `runserver 127.0.0.1:8001 --noreload` + chờ `/api/v1/ready/` | 0 | ready 200; dừng bằng SIGTERM → exit sạch |

### Kết quả S1–S16 (chạy thật trên API, ngày 2026-10-17)

| Bước | Kết quả | Bằng chứng chính (status thật + mã lỗi thật) |
|------|---------|-----------------------------------------------|
| S1 capabilities (no auth) | PASS | 200 `{"login_methods":{"local_class":true,"zalo":false},…}` |
| S2 POST /auth/session (Zalo demo) | PASS | 503 `module_unavailable` / reason `zalo_login_disabled` |
| S3 login HS001 + PH001 | PASS | 200 ×2, `token_type=Bearer`, role `student`/`caregiver`, 2 token độc lập; `consents_required=["service","ai_processing","research"]` |
| S4 anti-enumeration | PASS | sai mật khẩu và mã không tồn tại ĐỀU 401 `not_authenticated`/`invalid_credentials`, body GIỐNG HỆT byte-wise |
| S5 không token | PASS | 401 `not_authenticated` |
| S6 POST /consents service | PASS | 201 (Created) cho cả HS + PH — **API thiết kế trả 201, không phải 200** |
| S7 proposal 2 chiều | PASS | HS confirm (expected_revision=1) → 200 `awaiting_confirmation`/`my_confirmed:true`; PH confirm → 200 `connected` + `connection_id`, `relationship_kind=primary`, `generation=1` |
| S8 confirm xung đột | PASS | confirm với expected_revision CŨ → **409 `revision_conflict`**; confirm lần nữa khi đã connected → **400** envelope `input_invalid` + details.reason `proposal_not_confirmable` |
| S9 cards preview → send | **FAIL** | catalog 200 nhưng 0 card; preview → 404 `not_found`/`card_not_available`; send → 503 `module_unavailable`/`transport_not_wired`. Chẩn đoán: cổng CardProvider + MessageTransport CHỈ được đăng ký trong feature-lab harness, KHÔNG có code production nào gọi `register_card_provider`/`register_transport` trên backend thật → fail-closed đúng thiết kế, nhưng luồng gửi thẻ 201 KHÔNG chạy được trên build này |
| S10 hộp thư | NOT_RUN (có lý do) | GET /messages 200 cho cả HS/PH nhưng 0 message (không tạo được message nào do S9); read id lạ → 404 `not_found`. Luồng recipient-only chưa kiểm chứng được qua API |
| S11 F06 nháp + pause | PASS | tạo nháp 201; pause → 200, `deadline − server_time = 299.999s` (nằm trong 290–310); pause lần 2 → deadline KHÔNG đổi (server-decided) |
| S12 F04 AI | NOT_RUN (có lý do) | GET /ai/status 200 `{"ai_enabled":false}`; POST /ai/refine + X-Idempotency-Key → 503 `module_unavailable`/`ai_unavailable_or_off` — provider chưa cấu hình; kiểm chứng idempotent-replay NOT_RUN có lý do |
| S13 F15 xóa dữ liệu | PASS | POST deletion-requests → 201 `requested`; GET detail → 200 `requested`; cancel → 200 `cancelled`; GET /privacy/overview → 200 |
| S14 logout | PASS | logout 200; GET /auth/me bằng token cũ → **401 code `authentication_failed`** (không phải `not_authenticated` như khi KHÔNG gửi token — khác biệt envelope, xem "bất thường") |
| S15 rate limit | PASS | burst 12 login sai HS002: `401×8 rồi 429×4`, mã `rate_limited` (DB guard 10 fail/15ph) |
| S16 CORS preflight | PASS | OPTIONS Origin http://127.0.0.1:8080 → 200, `Access-Control-Allow-Origin=http://127.0.0.1:8080` (đúng origin, KHÔNG wildcard) |

Tổng: **16 PASS / 1 FAIL (S9) / 2 NOT_RUN (S10, S12 — có lý do)**. File bằng chứng: `e2e-results.json`, `e2e-run.log`, `server.log` (đã redact — không chứa mật khẩu/token), `migrate.log`, `provision-dryrun.log`, `provision-apply.log`.

## Phần 3 — Ảnh viewport (tóm tắt; chi tiết ở websep-screens/compare-notes.md)

- Build web trong worktree thật: `cd web && VITE_API_BASE_URL=http://127.0.0.1:8001 npm run build` — exit 0.
- Serve `web/dist` tại `http://127.0.0.1:8080` (python3 http.server, nền, đã tắt sau khi chụp).
- Đăng nhập THẬT qua form (HS001 rồi PH001) trên backend 8001; chụp PNG 1440x900 + 390x844.
