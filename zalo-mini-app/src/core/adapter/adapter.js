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
