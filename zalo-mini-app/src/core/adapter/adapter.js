// Hợp đồng adapter duy nhất của app (US-003). Hai chế độ, KHÔNG trộn:
//   - mode "mock": fixtures synthetic, chỉ khi demo mode bật rõ ràng (?demo=1).
//   - mode "zalo": production — ApiClient + zmp-sdk. Đây là BOUNDARY mà
//     Antigravity sẽ nối backend thật theo docs/contracts/api-foundation.md
//     (GET /api/v1/health/ và /api/v1/ready/).
//
// BẤT BIẾN AN TOÀN (đề bài VII):
//   1. Không có cơ chế gặp lỗi API thì âm thầm chuyển sang mock thành công.
//   2. Lỗi/timeout phải ném lỗi ra để UI hiển thị trạng thái lỗi thật.
//   3. API nghiệp vụ tương lai KHÔNG giả implement — ghi boundary cho US-004.

import { createMockAdapter } from "./mock-adapter.js";
import { createZaloAdapter } from "./zalo-adapter.js";
import { getApiBaseUrl } from "../config.js";

export const ADAPTER_METHODS = [
  "getBackendHealth",   // GET /api/v1/health/ -> 'ok' | throws ApiError
  "getBackendReady",    // GET /api/v1/ready/  -> 'ok' | 'unavailable' | throws
  "getConnectionStatus",// trạng thái kết nối gia đình (fixture ở mock; boundary ở zalo)
  // ---- F01: đăng nhập + đồng ý + kết nối hai phía ----
  "loginWithZaloToken", // getAccessToken (SDK) -> POST /api/v1/auth/session
  "trySilentLogin",     // đăng nhập lại im lặng một lần khi mở app
  "logout",             // POST /api/v1/auth/logout (token cũ đã chụp) + vô hiệu hóa phiên NGAY khi gọi
  "getMyProfile",       // GET /api/v1/auth/me — tên tự khai báo của mình
  "updateMyProfile",    // PUT  /api/v1/auth/me — đặt tên tự khai báo
  "listConsents",       // GET  /api/v1/consents
  "recordConsent",      // POST /api/v1/consents
  "createInvite",       // POST /api/v1/connections/invites
  "listInvites",        // GET  /api/v1/connections/invites
  "previewInvite",      // POST /api/v1/connections/invites/preview (read-only)
  "claimInvite",        // POST /api/v1/connections/invites/claim
  "confirmInvite",      // POST /api/v1/connections/invites/{id}/confirm
  "declineInvite",      // POST /api/v1/connections/invites/{id}/decline
  "cancelInvite",       // POST /api/v1/connections/invites/{id}/cancel
  "listConnections",    // GET  /api/v1/connections
  "revokeConnection",   // POST /api/v1/connections/{id}/revoke
  // ---- F06: nháp + tạm dừng 300s do MÁY CHỦ quyết + preview + xác nhận gửi ----
  // Tên endpoint khớp packages/family_bridge_mobile/f06_drafts/api.js và
  // backend family_bridge_features.f06_drafts (PAUSE_SECONDS = 300, cố định).
  "listDrafts",         // GET    /api/v1/drafts (keyset { results, nextCursor })
  "createDraft",        // POST   /api/v1/drafts
  "getDraft",           // GET    /api/v1/drafts/{id} (kèm server_time)
  "editDraft",          // POST   /api/v1/drafts/{id} (bump revision, giữ deadline)
  "discardDraft",       // DELETE /api/v1/drafts/{id}
  "pauseDraft",         // POST   /api/v1/drafts/{id}/pause (deadline máy chủ)
  "cancelDraftPause",   // DELETE /api/v1/drafts/{id}/pause
  "previewDraft",       // POST   /api/v1/drafts/{id}/preview (chỉ sau deadline)
  "confirmDraftSend",   // POST   /api/v1/drafts/{id}/confirm-send — HÀNH ĐỘNG
                        //   CUỐI CÙNG của người dùng, KHÔNG tự retry.
];
// ApiError ném từ adapter luôn có thuộc tính `kind` (phân loại tại nơi ném):
//   "configuration" | "network" | "timeout" | "http" | "invalid_response".
// UI PHẢI phân loại theo `kind`, không suy loại từ status 0 hay từ câu thông báo.
// Riêng ready: ApiError kind "http" + status 503 -> adapter trả 'unavailable'
// (trạng thái hợp lệ, không phải lỗi) — hợp đồng ready-503 giữ nguyên.

export function createAdapter({ mode, scenario = null } = {}) {
  if (mode === "mock") {
    return createMockAdapter({ scenario });
  }
  if (mode === "zalo") {
    const baseUrl = getApiBaseUrl();
    return createZaloAdapter({ baseUrl });
  }
  throw new Error(`Chế độ adapter không hợp lệ: ${String(mode)}`);
}

/** Chọn mode theo state demo: demo bật rõ -> mock; còn lại luôn zalo. */
export function resolveAdapterMode(demoMode) {
  return demoMode ? "mock" : "zalo";
}
