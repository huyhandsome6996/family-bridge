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
//
// ADR-2 (task 18-a): danh sách ADAPTER_METHODS chuyển về shared contract làm
// NGUỒN DUY NHẤT (69 tên copy nguyên văn) — file này re-export lại để giữ
// nguyên export surface cho mọi importer cũ.

export { ADAPTER_METHODS } from "../../../../packages/family_bridge_shared/src/adapter/contract.js";
// ApiError ném từ adapter luôn có thuộc tính `kind` (phân loại tại nơi ném):
//   "configuration" | "network" | "timeout" | "http" | "invalid_response".
// UI PHẢI phân loại theo `kind`, không suy loại từ status 0 hay từ câu thông báo.
// Riêng ready: ApiError kind "http" + status 503 -> adapter trả 'unavailable'
// (trạng thái hợp lệ, không phải lỗi) — hợp đồng ready-503 giữ nguyên.

import { createMockAdapter } from "./mock-adapter.js";
import { createZaloAdapter } from "./zalo-adapter.js";
import { getApiBaseUrl } from "../config.js";

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
