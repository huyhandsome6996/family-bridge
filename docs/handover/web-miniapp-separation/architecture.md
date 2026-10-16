# ADR — Tách Web độc lập khỏi Zalo Mini App (đã triển khai)

Ngày: 2026-10-16. Nhánh: `tinh-nang/web-miniapp-separation` (base main `96deda1`).
Trạng thái: **ĐÃ TRIỂN KHAI** trên nhánh này (commits `da83680` shared → `7fd5135` ci/boundary → `c7a576d`+`2a91047` web) — không còn là draft; bằng chứng trong [verification-report.md](verification-report.md). Tài liệu này thay thế ADR "single codebase" trong render.yaml và các chỉ dẫn "không tạo web riêng" (AGENTS.md, project-scope.md, mirror files) bằng dated supersede note.

## 1. Bối cảnh và mục tiêu

Web Render hiện build từ chính codebase zalo-mini-app (cùng entry `src/main.js`, cùng router, cùng adapter) theo ADR cũ. Nhiệm vụ mới của chủ dự án yêu cầu hai frontend ĐỘC LẬP:

- `web/` — ứng dụng web riêng: entry/router/UI/build riêng, Vite build ra `web/dist`, Render static service `family-bridge-web` đổi build/publish sang `web/dist`.
- `zalo-mini-app/` — giữ nguyên hành vi Mini App Zalo (entry, manifest `app-config.json`, dynamic chunks, verify-build) — KHÔNG hồi quy.
- `packages/family_bridge_shared/` — package headless dùng chung (pure ESM, không DOM, không zmp-sdk, không storage): client HTTP, session in-memory, endpoint factory, hợp đồng adapter, mock/demo, helper thuần.
- Import boundary CÓ CHỨNG MINH transitive: web không import source UI/SDK mini app; mini không import web; shared không phụ thuộc DOM/SDK.
- Không thêm service trả phí, không đổi domain, không dựng database mới, không merge main, không deploy production trong PR này.

## 2. Quyết định kiến trúc

### ADR-1 — Shared package thuần ESM, không build step
`packages/family_bridge_shared/` là file ESM thuần được import trực tiếp bằng relative path (`../../packages/family_bridge_shared/src/...`), KHÔNG npm workspaces, KHÔNG `file:` dep, KHÔNG build riêng. Lý do: build Render `cd web && npm ci && npm run build` chạy tại repo root nên truy cập được package ở root; không build riêng = không sinh artifact phải commit.

Nội dung (di chuyển NGUYÊN VĂN, không sửa logic trừ nơi ghi rõ):
| File shared | Nguồn | Ghi chú |
|---|---|---|
| `src/api/client.mjs` | zalo-mini-app/src/core/api/client.mjs | ApiError (kind/status/code/details) + createApiClient({baseUrl, getToken, timeoutMs=15000}) — bản đã fix PR #25 |
| `src/session.js` | zalo-mini-app/src/core/session.js | in-memory + generation (SEC-10), 100% không storage |
| `src/login-error.js` | zalo-mini-app/src/core/login-error.js | thuần |
| `src/policy.js` | zalo-mini-app/src/core/policy.js | thuần (mock dùng) |
| `src/fixtures/index.js` | zalo-mini-app/src/core/fixtures/ | demo fixtures |
| `src/adapter/mock-adapter.js` | zalo-mini-app/src/core/adapter/mock-adapter.js | di chuyển nguyên văn, sửa import thành relative trong shared |
| `src/adapter/http-endpoints.js` | MỚI — tách từ zalo-adapter.js | factory `createHttpEndpoints({request, authed, requireBaseUrl, staleSessionError, coldStartTimeoutMs})` chứa ~66 method endpoint thuần HTTP (di chuyển nguyên thân method) + `loginWithCredentials` (dùng session shared) |
| `src/adapter/contract.js` | MỚI | export `ADAPTER_METHODS` (69 tên, copy nguyên danh sách) — nguồn duy nhất |
| `src/connection-check.js` | MỚI — tách từ pages/connection-check/index.js | `errorKind`/`failureFor` pure theo kind |
| `src/index.js` | MỚI | barrel re-export |
| `README.md` + `tests/` | MỚI | purity contract + test node --test (stub fetch, 10–15 ca đại diện) |

### ADR-2 — Mini app giữ glue, path cũ sống qua shim
- `zalo-adapter.js` còn lại glue (~240 dòng): factory createZaloAdapter({baseUrl, getSdkAccessToken}), dynamic import zmp-sdk (1 chỗ), assertZaloHost/isZaloHost, loginWithZaloToken, trySilentLogin, logout (phần SDK), merge endpoint từ shared, TIMEOUT_MS=15000.
- `adapter.js` giữ export surface (createAdapter, resolveAdapterMode, ADAPTER_METHODS re-export từ shared contract).
- Shim re-export giữ path cũ để 8 file test KHÔNG đổi import: `src/core/api/client.mjs`, `src/core/session.js`, `src/core/adapter/mock-adapter.js` → `export ... from "../../../packages/family_bridge_shared/src/..."`.
- `pages/connection-check/index.js` đổi import `errorKind`/`failureFor` từ shared (assertion SC không đổi).
- `stitch-upgrade.test.mjs`: CHỈ sửa path đọc source (mock-adapter → shared path), KHÔNG đổi assertion.
- `store.js` (sessionStorage {role}) GIỮ ở mini — qa-secrets-privacy pin "sessionStorage chỉ trong src/app/store.js".

### ADR-3 — Web app độc lập
`web/` — package.json riêng + package-lock.json COMMIT (npm ci bắt buộc), vite.config.mjs (root `.`, base `./`, outDir `dist`, sourcemap OFF — SEC-19), index.html, src/:
- `src/core/config.js` — VITE_API_BASE_URL build-time; thiếu → ApiError kind "configuration" tiếng Việt (không fallback mock, không lộ URL); VITE_TEST_LABEL.
- `src/core/session.js`, adapter — import từ shared; glue web KHÔNG có zmp/SDK/silent-login; login bằng `loginWithCredentials` (shared) theo capabilities (`local_class`), `zalo=false` hiển thị trung thực.
- `src/app/router.js` — bản riêng (hash `#/`, pattern `:param`, requiresAuth trước requiresRole, chrome "app") — GIỮ NGUYÊN 21 hash path hiện có để không phá link đang dùng.
- `src/app/store.js` — in-memory ONLY (role), KHÔNG sessionStorage/localStorage.
- `src/pages/**` — đủ 21 route: web-specific (cards, signal, message, proposal, settings, privacy + credential-form, app-shell) và dùng-chung (home, mailbox, compose, login, connect, consent, help, welcome, role-select, companion, diary, profile, connection-check, how-to-use, not-found) — copy + sửa import về web/shared. Mini-chrome (bottom-nav, top-bar, demo-banner) KHÔNG port.
- `src/styles/**` + `src/assets/**` — copy (tokens/base/components/shell/fonts/index.css + fonts/logo/illustrations). CSS KHÔNG share trong PR này (token drift risk ghi docs, follow-up).
- `tests/**` — node --test: port web-screens (sửa import path), qa-web-invariants bản web (no CDN, no storage write, no zmp-sdk, banned copy, render.yaml path MỚI), qa-demo-isolation (mock từ shared), connection-check-errors (SC semantics qua shared client), router/pages smoke.

### ADR-4 — Render & CI
- render.yaml service `family-bridge-web`: `buildCommand: cd web && npm ci && npm run build`, `staticPublishPath: web/dist`, giữ NODE_VERSION 22.12.0, `VITE_API_BASE_URL sync:false`, headers cache như cũ (hashed assets immutable, index.html no-cache, nosniff), autoDeployTrigger giữ nguyên. Viết lại comment ADR (hai frontend + shared + rollback). Backend service + mini app deploy Zalo KHÔNG đổi.
- `.github/workflows/tests.yml`: THÊM job `web` (node 22: `cd web && npm ci && node --test tests/*.test.mjs`, build, `node scripts/check_import_boundaries.mjs`, node --test shared). KHÔNG đụng backend-foundation.yml/miniapp-foundation.yml (PR #35 đang mở đụng 2 file đó — tránh xung đột).
- `scripts/check_import_boundaries.mjs`: đồ thị import TRANSITIVE từ entry `web/index.html` + `zalo-mini-app/index.html`; theo cả static lẫn dynamic `import()`; re-export barrel được follow; CSS/asset/bare-import là nút lá; STRIP COMMENT trước token-scan; assert: (1) không file web (transitive) thuộc zalo-mini-app/**, (2) không file mini thuộc web/**, (3) shared không chứa zmp-sdk/window/document (trừ comment), (4) web không chứa zmp-sdk/localStorage/sessionStorage write, (5) in biến số node/file vào report; vi phạm → exit 1.

### ADR-5 — Session & auth web
Token Bearer IN-MEMORY (SEC-10), reload = logout; `credentials:"omit"`; CORS giữ exact origin qua env (không sửa backend file); `?demo=1` → mock adapter từ shared, không tạo token/state production; đăng xuất server revoke; sai thông tin đăng nhập trả lỗi generic giống hệt nhau (anti-enumeration).

### ADR-6 — Rollback
Runbook: revert render.yaml về build/publish cũ (`zalo-mini-app/www`) — mini app build vẫn chạy song song nên khả thi ngay; không drop DB, không reset account, không đụng revoke/deletion ledger.

## 3. Chiến lược test
1. Mini app: 266 test phải xanh KHÔNG GIẢM assertion (shims giữ path; duy nhất stitch-upgrade đổi path đọc source, qa-web-invariants đổi assertion render.yaml theo path mới) + `npm run build` verify-build manifest.
2. Shared: node --test riêng (stub fetch) cho client (SC1–SC5b, SC7, SC12–SC18 semantics) + endpoints factory (authed 401 generation, idempotency header, cold-start 60s, timeout 15s mặc định).
3. Web: suite riêng (port + invariants + boundary).
4. E2E hai actor API: provision_classroom → capabilities → login HS/PH → consent → proposal confirm ×2 → cards → inbox mark-read (recipient-only) → negative (401 identical, 429, no-token) → logout revoke; chạy trên Django sqlite local (venv fb-backend-wt/.venv).
5. Ảnh viewport desktop/mobile các route chính (headless browser) đối chiếu Stitch; NOT_RUN trung thực: thiết bị Zalo thật, MySQL/TiDB thật.

## 4. Rủi ro & giảm thiểu
- Hồi quy mini khi re-point: shims + test không đổi + build verify (manifest chunk).
- Drift endpoints: shared là nguồn DUY NHẤT — zalo-adapter KHÔNG giữ bản endpoint riêng.
- Token drift CSS: ghi nhận trong docs, follow-up.
- PR #32/#33 ownership (pages/login, router mini): PR này KHÔNG sửa các file đó ở mini (web dùng bản copy riêng); zalo-adapter/adapter/client/session/mock không thuộc ownership #32/#33 — kiểm tra lại diff trước khi mở PR.
- check_agent_docs: giữ wiring strings + Taste checksum; không nhắc DEC-24; mọi link mới phải resolve.

## 5. Trình tự commit (lead commit, agent không tự commit)
1. `feat(shared): tach headless client/session/endpoints tu zalo-mini-app` (+shims, tests, mini glue rewired — 266 test xanh).
2. `feat(web): ung dung web doc lap entry router build web/dist`.
3. `feat(web): port 21 manh web + tests + invariants`.
4. `ci(web): job web + boundary check + render.yaml publish web/dist`.
5. `docs(web-miniapp-separation): handover 9 file + supersede notes`.
