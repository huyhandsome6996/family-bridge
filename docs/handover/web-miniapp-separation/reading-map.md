# Reading map — web-miniapp-separation

Bản đồ đọc cho agent/người tiếp nhận. Mục tiêu: sau ~30 phút đọc theo thứ tự dưới đây, bạn biết code nằm ở đâu, ranh giới ở đâu và phải giữ gìn gì.

## Bối cảnh đầu vào (giả định đã ghi rõ)

Brief nhiệm vụ của chủ dự án chỉ nhận được các mục §10–14 (deploy, router/cache, mini app/backend, milestone,验收, handover, stop conditions). Các mục §1–9 KHÔNG có trong máy phiên này, nên yêu cầu đã được **tái tạo từ chính repo**: `AGENTS.md`, `docs/project-scope.md`, `docs/product/decision-register.md`, `docs/contracts/api-foundation.md`, `docs/handover/web-render/`, `docs/handover/backend-foundation/`, worklog các đợt trước (US-003 backend/foundation, web Render Task 2, F12, HS/PH classroom). Nếu brief gốc có điều nào mâu thuẫn với những gì đã làm, điều đó được ghi ở [next-agent.md](next-agent.md) mục "Giả định cần chủ dự án xác nhận".

## Thứ tự đọc khuyến nghị

1. **[README.md](README.md)** — trạng thái tổng và quy tắc vàng.
2. **[architecture.md](architecture.md)** — ADR-1..6, lý do từng quyết định (shared ESM không build step, shim path cũ, web độc lập, Render/CI, session, rollback).
3. **`packages/family_bridge_shared/`** — đọc `README.md` trong package, rồi `src/index.js` (barrel). Đây là nguồn duy nhất của:
   - `src/api/client.mjs` — ApiError (kind/status/code/details) + `createApiClient` (bản đã fix PR #25: configuration/timeout/invalid_response).
   - `src/session.js` — phiên in-memory + generation (SEC-10), 100% không storage.
   - `src/adapter/http-endpoints.js` — factory ~66 method endpoint thuần + `loginWithCredentials`.
   - `src/adapter/contract.js` — `ADAPTER_METHODS` (69 tên) nguồn duy nhất.
   - `src/adapter/mock-adapter.js`, `src/policy.js`, `src/fixtures/`, `src/login-error.js`, `src/connection-check.js`.
4. **`zalo-mini-app/`** — KHÔNG đọc theo "đã bị thay": hành vi giữ nguyên. Điểm mới: `src/core/adapter/zalo-adapter.js` còn lại glue (~224 dòng, dynamic import zmp-sdk đúng 1 chỗ); 5 shim re-export giữ path cũ (`src/core/api/client.mjs`, `src/core/session.js`, `src/core/adapter/mock-adapter.js`, `src/core/login-error.js`, `src/core/policy.js`).
5. **`web/`** — entry `index.html` + `src/main.js`; `src/app/router.js` (21 hash path, pattern `:param`, requiresAuth); `src/core/config.js` (VITE_API_BASE_URL build-time, thiếu → ApiError `configuration`, không fallback mock); `src/core/adapter/web-adapter.js` (surface 69 method, không zmp-sdk); `src/app/store.js` (in-memory only); `src/pages/**` (21 route).
6. **`scripts/check_import_boundaries.mjs`** — checker transitive; chạy `node scripts/check_import_boundaries.mjs` (exit 0 = sạch) và `--json` để lấy báo cáo node/file.
7. **[deployment.md](deployment.md)** + `.github/workflows/tests.yml` (job `web`) + `render.yaml` (service `family-bridge-web`).
8. **[verification-report.md](verification-report.md)** — mọi con số "đã chạy" đều nằm ở đây, không nằm rải rác.

## Layout repo sau khi tách

```
web/                          ← ỨNG DỤNG WEB ĐỘC LẬP (mới)
  index.html, package.json + package-lock.json (npm ci bắt buộc)
  vite.config.mjs             ← base ./, outDir dist, sourcemap OFF
  src/{core,app,pages,styles,assets}/
  tests/                      ← 187 tests (node --test)
zalo-mini-app/                ← MINI APP ZALO (hành vi giữ nguyên)
  src/core/adapter/zalo-adapter.js  ← glue ~224 dòng (SDK chỉ ở đây)
  src/core/{api/client.mjs,session.js,...}  ← SHIM re-export từ shared
  vite.config.mjs + verify-build.mjs        ← build www/ + assert manifest
packages/family_bridge_shared/  ← NGUỒN DUY NHẤT headless (mới)
  src/{api,adapter,session.js,policy.js,login-error.js,connection-check.js}
  tests/                      ← 34 tests + purity contract
scripts/check_import_boundaries.mjs  ← checker biên giới transitive (mới)
.github/workflows/tests.yml   ← thêm job `web` (không đụng 2 workflow khác)
render.yaml                   ← service web: buildCommand cd web && npm ci && npm run build; publish web/dist
```

## Những file KHÔNG được sửa bừa (ownership đang mở)

- `zalo-mini-app/src/pages/login/**`, consent — PR #32 (F01) đang mở.
- `zalo-mini-app/src/app/router.js`, `src/pages/privacy/**`, `src/pages/profile/**`, `packages/family_bridge_features/f15_privacy/**` — PR #33 (F15) đang mở.
- `packages/family_bridge_features/f01_identity/**` — PR #34 đang mở (W036 MySQL).
- `.github/workflows/backend-foundation.yml`, `.github/workflows/miniapp-foundation.yml` — PR #35 đang mở.
- Backend nói chung: nhánh này KHÔNG đụng file backend nào (kiểm chứng: diff `origin/main...HEAD` có 0 file `packages/family_bridge_features|core/**` và `backend/**`).

Chi tiết đầy đủ: [next-agent.md](next-agent.md).
