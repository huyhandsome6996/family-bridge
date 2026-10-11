# Báo cáo sửa lỗi phân loại lỗi connection-check (US-003) — Task 13-c

Ngày: 11/10/2026 · Nhánh: `fix/us-003-connection-check-errors` · Fix commit: `79f7331` · Baseline main: `84d648ba4ac5077dbaa4caf933bd4aed3503f17a`

**Nhãn kết quả: "Đã sửa lỗi trạng thái kết nối nền tảng US-003, chờ review".**
KHÔNG tuyên bố "US-003 Done", KHÔNG tuyên bố "Zalo hoàn thành" — việc kiểm tra trên webview Zalo Android/iOS thật vẫn thuộc Antigravity (checklist riêng).

## 1. Root cause

Bug nằm ở hai chỗ trong baseline `84d648b`:

1. **`zalo-mini-app/src/pages/connection-check/index.js:26-31`** — hàm `isTimeoutError(error)` phân loại lỗi theo suy loại:
   `error.status === 0 || error.message.includes("quá thời gian")`.
   Vì ApiError dùng `status = 0` cho MỌI lỗi không có HTTP status (cấu hình, mạng, timeout), nên **thiếu `VITE_API_BASE_URL` và lỗi mạng đều bị hiển thị sai thành "Kết nối quá thời gian chờ"**.
2. **`zalo-mini-app/src/core/api/client.mjs` (baseline :14-39)** — ApiError không mang thông tin phân loại; nơi ném chỉ có `message` + `status`, buộc UI phải dò message/status (cách dò giòn, sai như mục 1).

Điểm ném liên quan ở baseline: `client.mjs:14/17/20` (cấu hình, status 0), `:33` (HTTP lỗi), `:35` (JSON hỏng), `:38` (AbortError → timeout), `:39` (lỗi mạng); `zalo-adapter.js:15-21` `requireBaseUrl()` (cấu hình, status 0 — nguồn chính của bug hiển thị sai); `mock-adapter.js:30` (demo timeout, status 0).

## 2. Cách sửa (commit `79f7331` của agent B)

- **`ApiError` có thuộc tính `kind` cố định gắn tại nơi ném**, 5 giá trị:
  `"configuration"` (thiếu/sai địa chỉ backend) · `"network"` (fetch ném lỗi mạng) · `"timeout"` (AbortError từ timer client) · `"http"` (server trả mã lỗi HTTP, `status` = mã thật) · `"invalid_response"` (JSON không parse được).
  `status === 0` chỉ còn nghĩa "không có HTTP status" — **cấm suy loại lỗi từ status/message**.
- **Màn connection-check phân nhánh theo `errorKind(error)`** (index.js:35-39 + `failureFor` :49-82):
  configuration → "Chưa cấu hình địa chỉ máy chủ" (+ hướng dẫn `VITE_API_BASE_URL` — màn kiểm tra kỹ thuật được phép nêu tên biến); network → "Chưa kết nối được máy chủ" + Thử lại; timeout → "Kết nối quá thời gian chờ" (giữ nguyên); invalid_response → "Không kiểm tra được kết nối".
- **Fallback an toàn**: lỗi không có `kind` (ApiError cũ, Error thường) → `"unknown"` → nhánh lỗi chung "Không kiểm tra được kết nối", **KHÔNG BAO GIỜ nhánh timeout**.
- **ready-503 giữ nguyên hợp đồng**: `zalo-adapter.js:46` vẫn map `error.status === 503` → `"unavailable"` → màn "Máy chủ chưa sẵn sàng" (ApiError của nó có kind `"http"` + status 503, không đổi path/payload/200/503 của `GET /api/v1/health/` và `GET /api/v1/ready/`).
- Không đổi: fetch/timeout/no-retry của client, stale-guard + destroy + demo panel, không thêm polling/retry/cache, không thêm dependency.

### File nguồn thay đổi (của agent B, commit `79f7331` — +86/−31)

| File | Thay đổi |
| --- | --- |
| `src/core/api/client.mjs` | ApiError + kind; gắn kind tại 7 chỗ ném (configuration ×3, http, invalid_response, timeout, network) |
| `src/core/adapter/zalo-adapter.js` | `requireBaseUrl`/`assertZaloHost` → kind "configuration"; 501 → "http"; ready-503 → "unavailable" giữ nguyên |
| `src/core/adapter/mock-adapter.js` | demo timeout → kind "timeout"; demo error 503 → kind "http" |
| `src/core/adapter/adapter.js` | chỉ comment: ADAPTER_METHODS ghi chú kind + cấm suy loại |
| `src/pages/connection-check/index.js` | xoá `isTimeoutError`; `errorKind` + `failureFor` switch theo kind; fallback "unknown" |

### File kiểm thử/tài liệu của Task 13-c

| File | Loại |
| --- | --- |
| `zalo-mini-app/tests/connection-check-errors.test.mjs` | MỚI — 18 test (bảng mục 3) |
| `zalo-mini-app/tests/pages.test.mjs` | 2 chỉnh: `timeoutAdapter` ném kind "timeout", `productionLikeAdapter` ném kind "configuration" (không đổi test nào khác) |
| `docs/handover/miniapp-foundation/connection-check-fix-report.md` | MỚI (file này) |
| `docs/handover/miniapp-foundation/README.md`, `antigravity-checklist.md`, `docs/setup/miniapp/README.md` | cập nhật số test + mô tả phân loại + copy kỳ vọng |

## 3. Bảng kịch bản kiểm thử (18 test / 11 kịch bản — tất cả PASS trên HEAD)

Framework: `node --test` + happy-dom (globals gắn trước import động, giống `pages.test.mjs`); dùng `createZaloAdapter`/`createApiClient`/`createMockAdapter` thật import từ `src`; `globalThis.fetch` stub có save/restore; **không dùng timer fake** — timeout thật = `timeoutMs` 30ms với timer thật; demo timeout chờ thật ~7s.

| # | Kịch bản | Mức kiểm | Kết quả |
| --- | --- | --- | --- |
| SC1 | Thiếu cấu hình: `baseUrl=""` (node:test → `getApiBaseUrl()` trả "") | Client + UI | PASS — client: ApiError kind "configuration", status 0; màn: title "Chưa cấu hình địa chỉ máy chủ" + hướng dẫn chứa "VITE_API_BASE_URL", KHÔNG chứa "quá thời gian" |
| SC2 | Địa chỉ `http://example.com` (HTTP ngoài localhost — client chặn HTTPS) | Client + UI | PASS — kind "configuration" trước khi gọi mạng (`fetch` không được gọi); màn hiện lỗi cấu hình, không phải timeout |
| SC3 | Fetch ném `TypeError("Failed to fetch")` | Client + UI | PASS — kind "network", status 0; màn: title "Chưa kết nối được máy chủ" + nút "Thử lại", không chứa "quá thời gian" |
| SC4 | Timeout thật: `timeoutMs: 30`, fetch chỉ reject khi `signal` bắn "abort" | Client + UI | PASS — kind "timeout", status 0 (đo elapsed ≥ 25ms — timer thật); màn: title "Kết nối quá thời gian chờ" (adapter stub ném kind "timeout" với message không chứa chữ "thời gian" — chứng minh title theo kind, không dò message) |
| SC5 | Health 200 ok + ready 503 `{"status":"unavailable"}` | Client + adapter + UI | PASS — client: ApiError kind "http", status 503; adapter: ready → "unavailable" (hợp đồng giữ nguyên); màn: title "Máy chủ chưa sẵn sàng" |
| SC6 | Health + ready đều 200 ok | UI | PASS — badge "Đã kết nối tới máy chủ", không có ErrorState |
| SC7 | 200 nhưng `json()` ném `SyntaxError` (Response giả) | Client + UI | PASS — kind "invalid_response", status 200; màn: title "Không kiểm tra được kết nối" |
| SC8 | Rời màn khi request đang treo: mount → `page.destroy()` → request hoàn tất hậu destroy | UI (stale-guard) | PASS — body vẫn loading, không ErrorState/success dù deferred fetch được resolve sau destroy |
| SC9 | Thử lại sau lỗi → thành công: lần 1 TypeError, đổi stub → ok ×2, bấm "Thử lại" | UI | PASS — lỗi network → bấm Thử lại → badge "Đã kết nối tới máy chủ" |
| SC10 | Khóa regression: adapter ném `new ApiError("Lỗi lạ.", 0)` (KHÔNG kind) | UI | PASS — title "Không kiểm tra được kết nối", KHÔNG chứa "quá thời gian" (fallback an toàn) |
| SC11 | Demo: bấm "Giả lập: timeout" với mock adapter thật + `rebuildAdapter` | UI | PASS — sau ~4.5s (chờ thật, không fake timer) hiện title "Kết nối quá thời gian chờ" |

Chi tiết test-level (18): SC1/SC2/SC3/SC4/SC5/SC7 có cặp client-level + UI-level; SC5 thêm test riêng mapping adapter "unavailable"; SC6/SC8/SC9/SC10/SC11 ở mức UI. Toàn bộ nằm trong `describe("Tầng API client…")` và `describe("Tầng hiển thị connection-check…")`.

## 4. Bằng chứng "test mới FAIL trên code cũ" (bắt lỗi)

Thủ tục: xanh trên HEAD → `git checkout 84d648b -- <4 file nguồn>` (client.mjs, zalo-adapter.js, mock-adapter.js, connection-check/index.js; không commit) → `npm test` → phục hồi `git checkout HEAD -- <4 file>` → xanh trở lại.

| Trạng thái | tests | pass | fail |
| --- | --- | --- | --- |
| HEAD (fix `79f7331`) | 97 | **97** | 0 |
| Code cũ (4 file baseline `84d648b`) | 97 | 86 | **11** |
| HEAD phục hồi | 97 | **97** | 0 |

11 test FAIL trên code cũ (đúng như thiết kế — test bắt được bug), log: `tool-results/npm-test-old-code-13c.log`:

1. `SC1-client: thiếu baseUrl -> ApiError kind 'configuration', status 0` — ApiError cũ không có `kind`.
2. `SC2-client: baseUrl HTTP ngoài localhost -> kind 'configuration' (client chặn HTTPS)`.
3. `SC3-client: fetch ném TypeError (mạng) -> kind 'network', status 0`.
4. `SC4-client: AbortError do timer thật (timeoutMs 30) -> kind 'timeout', status 0`.
5. `SC5-client: ready trả 503 -> ApiError kind 'http', status 503 (mã HTTP thật)`.
6. `SC7-client: response 200 nhưng json() ném SyntaxError -> kind 'invalid_response'`.
7. `SC1-UI: thiếu VITE_API_BASE_URL -> lỗi cấu hình, TUYỆT ĐỐI không phải timeout` — màn cũ render đúng text sai: `"Kết nối quá thời gian chờ Máy chủ không phản hồi trong thời gian cho phép…"` (chính là bug).
8. `SC2-UI: địa chỉ backend HTTP ngoài localhost -> lỗi cấu hình, không phải timeout` — hiện "Kết nối quá thời gian chờ" trên code cũ.
9. `SC3-UI: fetch ném TypeError -> 'Chưa kết nối được máy chủ'…` — hiện "Kết nối quá thời gian chờ" trên code cũ.
10. `SC9-UI: lỗi mạng -> bấm 'Thử lại'…` — assert đầu fail vì màn cũ misclassify network thành timeout.
11. `SC10-UI (khóa regression): ApiError cũ KHÔNG kind, status 0 -> lỗi chung` — màn cũ hiện nhánh timeout cho lỗi không kind.

Đối chứng: SC4-UI/SC5-UI/SC6-UI/SC8-UI/SC11-UI pass trên CẢ hai phiên bản (hành vi này không đổi bởi fix) — khớp thiết kế bảng mục 3.

## 5. Lệnh đã chạy + kết quả

- `npm ci` (zalo-mini-app): exit 0, "added 140 packages, and audited 141 packages in 4s" (~4.5s; 5 vulnerabilities là báo cáo audit hiện trạng dependency, không phát sinh từ đợt này, không được "fix" bằng upgrade ngoài phạm vi).
- `npm test`: **trước fix 79/79 → sau (HEAD + test mới) 97/97 pass, 0 fail, 0 skip** (18 test mới: 7 client-level + 1 adapter-level + 10 UI-level; `pages.test.mjs` giữ nguyên số test).
- `npm run build`: vite build ✓ + `verify-build.mjs` in **"Verified Zalo app-config and all referenced assets"** (entry `assets/app.module.js`, CSS `assets/index.css`, `www/app-config.json` — manifest/asset hợp lệ).
- Diff/secret check: `git status --porcelain` chỉ còn file thuộc ownership Task 13-c (`tests/connection-check-errors.test.mjs` mới, `tests/pages.test.mjs` sửa 2 adapter) + docs của task này; không đụng `src/**`, không đụng `docs/handover/backend-foundation/**`, không đụng `zalo-mini-app/CONTRACTS.md`; quét mẫu `ghp_`/`github_pat_`/`AKIA` trên diff — sạch.

## 6. Giới hạn kiểm thử

- Kiểm tra là **DOM mô phỏng happy-dom + fetch stub** — KHÔNG phải webview Zalo Android/iOS thật, KHÔNG gọi backend thật. Hành vi mạng/timeout chỉ mô phỏng được mức fetch stub + AbortController/timer thật của Node.
- Không kiểm tra: hiển thị trong Zalo Mini Program thật, safe-area, hiệu năng, CDN zmp-sdk.
- Demo timeout (SC11) tốn ~7s chờ thật trong suite (theo thiết kế, không fake timer) — tổng suite ~29s.
- `npm audit` báo 5 vulnerabilities (1 moderate, 4 high) hiện có của lockfile — ngoài phạm vi, cần quyết định riêng nếu nâng cấp dependency.

## 7. Đề xuất cập nhật `zalo-mini-app/CONTRACTS.md` mục 5.9 (CHƯA sửa trực tiếp)

Mục 5.9 (Connection-check) hiện mô tả các trạng thái loading → success → error → timeout. Đề xuất bổ sung:

> "Phân loại lỗi của connection-check đọc thuộc tính `kind` của ApiError (5 giá trị: configuration/network/timeout/http/invalid_response — gắn tại nơi ném trong `src/core/api/client.mjs`, `zalo-adapter.js`, `mock-adapter.js`). CẤM suy loại lỗi từ `status === 0` hoặc dò câu thông báo. ApiError không `kind` / Error thường → nhánh lỗi chung 'Không kiểm tra được kết nối', không bao giờ hiện nhánh timeout. `ready` trả 503 `{"status":"unavailable"}` là trạng thái hợp lệ → 'Máy chủ chưa sẵn sàng' (không đổi khi thêm kind)."

Việc sửa trực tiếp CONTRACTS.md để dành cho agent docs/lead có quyền trên file đó (Task 13-c chỉ sở hữu các file nêu ở mục 2).

## Phụ lục — Bằng chứng runtime THẬT (Lead xác minh sau Task 13-c, 2026-10-11)

Bổ sung sau phần giới hạn mục 6: ngoài DOM mô phỏng, Lead đã chạy bằng chứng với **backend Django thật** (worktree backend tại đúng SHA `1b233c4b8763a85a9836af4ef6873ebdfd51f4b5`, DJANGO_ENV=development, DB_ENGINE=sqlite — SQLite chỉ là bằng chứng local, không tuyên bố MySQL từ đây) và **trình duyệt thật (headless Chromium qua agent-browser)** với bundle `vite build` nhúng `VITE_API_BASE_URL`, phục vụ tĩnh tại `http://127.0.0.1:4173` (route `#/connection-check`):

| # | Kịch bản | Cách chạy | Kết quả |
| --- | --- | --- | --- |
| A | Backend chạy → thành công | adapter thật (`createZaloAdapter`) gọi `http://127.0.0.1:8000` | `getBackendHealth()="ok"`, `getBackendReady()="ok"` → PASS; browser: badge "Đã kết nối tới máy chủ" (ảnh `tool-results/browser-connected-real-backend.png`) |
| B | Backend tắt → lỗi mạng, không timeout | kill Django → gọi lại + reload browser | ApiError `kind="network"`, status 0 → PASS; browser: "Chưa kết nối được máy chủ" + nút Thử lại, assert `CORRECT_NO_TIMEOUT_TEXT` (ảnh `browser-network-error-real-backend.png`) |
| C | Thiếu `VITE_API_BASE_URL` → lỗi cấu hình | build lại KHÔNG có biến + reload | ApiError `kind="configuration"` → PASS; browser: "Chưa cấu hình địa chỉ máy chủ" + hướng dẫn chứa `VITE_API_BASE_URL`, assert `CORRECT_CONFIG_GUIDANCE` (ảnh `browser-config-error-no-base-url.png`) |
| D | Timeout thật (AbortError do timer) | `createApiClient` timeoutMs 30, host không trả lời | `kind="timeout"` → PASS (kịch bản node, không cần server) |
| E | Thử lại sau lỗi → thành công | bật lại Django → click "Thử lại" trong browser | badge "Đã kết nối tới máy chủ" hiện lại → PASS, assert `RETRY_SUCCESS_SHOWN` (ảnh `browser-retry-success-real-backend.png`) |

Script kiểm tra: `/home/z/my-project/scripts/verify_real_backend_13.mjs` (ngoài repo, dùng đúng `client.mjs`/`zalo-adapter.js` của nhánh fix). Django không bị sửa gì để che lỗi frontend. Ảnh bằng chứng lưu ngoài repo tại `/home/z/my-project/tool-results/`.

**Giới hạn còn lại (cập nhật mục 6):** bằng chứng trình duyệt là headless Chromium desktop với serving tĩnh local — vẫn KHÔNG phải webview Zalo Android/iOS thật (không qua zmp-sdk runtime, không safe-area); kịch bản này thuộc Antigravity theo checklist. CORS local được cấp cho origin `http://127.0.0.1:4173` qua env — production cần cấu hình origin thật theo `antigravity-checklist.md`.
