# family_bridge_shared

Package headless dùng chung cho **zalo-mini-app** và **web** (ADR-1,
docs/handover/web-miniapp-separation/architecture.md — task 18-a).

- **Pure ESM thuần, KHÔNG build step**: các host import trực tiếp bằng
  relative path (`../../packages/family_bridge_shared/src/...` từ
  `zalo-mini-app/src/...`, `../packages/family_bridge_shared/src/...` từ
  `web/src/...`). KHÔNG npm workspaces, KHÔNG `file:` dep, KHÔNG artifact build.
- **Nguồn duy nhất** của client HTTP, session, endpoint factory, hợp đồng
  adapter, mock/demo, helper thuần — chống drift giữa hai frontend.

## Purity contract (bắt buộc — kiểm chứng bằng `node --test tests/*.test.mjs`)

1. **CẤM** mọi tham chiếu tới môi trường trình duyệt/Zalo trong `src/**`:
   `zmp-sdk`, `window`, `document`, `localStorage`, `sessionStorage`,
   `navigator`, import động tới SDK. (Comment giải thích không vi phạm.)
2. **Token getter inject**: `createApiClient({ baseUrl, getToken, timeoutMs })`
   — package không tự đọc token từ bất kỳ đâu; token chỉ nằm trong
   `session.js` in-memory (SEC-10: KHÔNG web storage, KHÔNG cookie, KHÔNG URL).
3. **Session in-memory + generation** (SEC-10): mất khi đóng tab/webview là
   chấp nhận; `setSession`/`clearSession` tăng generation để request của phiên
   cũ không xóa/đè phiên mới.
4. **Không side-effect khi import**: chỉ khai báo hàm/hằng; mọi state nằm trong
   closure/factory.
5. **Lỗi phân loại qua `kind`** của `ApiError`
   (`configuration|network|timeout|http|invalid_response|stale_session`) — UI
   phải đọc `kind`, không suy loại từ `status === 0` hay message.
6. Giá trị mặc định hợp đồng KHÔNG đổi: request timeout **15000ms** (SC18),
   cold-start **60000ms** (Render free tier) qua tham số
   `createHttpEndpoints({ ..., coldStartTimeoutMs })`.

## Bản quyền / owner

- Owner: dự án Family Bridge (cùng owner với `zalo-mini-app`, repo private —
  `license: UNLICENSED`).
- File di chuyển từ `zalo-mini-app/src/core/**` giữ NGUYÊN VĂN nội dung
  (nguồn gốc ghi ở cột "Nguồn" bảng dưới); file MỚI ghi rõ nguồn tách.

## Bảng file (ADR-1)

| File | Nguồn | Ghi chú |
|---|---|---|
| `src/api/client.mjs` | `zalo-mini-app/src/core/api/client.mjs` | ApiError + createApiClient — copy nguyên văn |
| `src/session.js` | `zalo-mini-app/src/core/session.js` | in-memory + generation — copy nguyên văn |
| `src/login-error.js` | `zalo-mini-app/src/core/login-error.js` | copy nguyên văn |
| `src/policy.js` | `zalo-mini-app/src/core/policy.js` | copy nguyên văn |
| `src/fixtures/index.js` | `zalo-mini-app/src/core/fixtures/index.js` | demo fixtures — copy nguyên văn |
| `src/adapter/mock-adapter.js` | `zalo-mini-app/src/core/adapter/mock-adapter.js` | copy nguyên văn (relative imports giữ nguyên vị trí tương đối) |
| `src/adapter/http-endpoints.js` | MỚI — tách từ `zalo-adapter.js` | factory `createHttpEndpoints({request, authed, requireBaseUrl, staleSessionError, coldStartTimeoutMs})`, 67 method endpoint thuần HTTP di chuyển nguyên thân |
| `src/adapter/contract.js` | MỚI | `ADAPTER_METHODS` — 69 tên copy nguyên danh sách |
| `src/connection-check.js` | MỚI — tách từ `pages/connection-check/index.js` | `errorKind`/`messageOf`/`failureFor` copy nguyên văn |
| `src/index.js` | MỚI | barrel re-export |
| `tests/*.test.mjs` | MỚI | `node --test` (stub fetch, KHÔNG happy-dom) |

## Chạy test

Từ repo root:

```bash
node --test packages/family_bridge_shared/tests/*.test.mjs
```
