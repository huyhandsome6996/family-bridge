// Web adapter — chế độ production của web độc lập (ADR-3, task 19-a). GLUE
// MỎNG tương đương zalo-adapter.js của mini nhưng KHÔNG zmp-sdk, KHÔNG host
// Zalo, KHÔNG silent login:
//   - factory createWebAdapter({ baseUrl }),
//   - createApiClient (shared) + getToken từ session (shared, in-memory SEC-10),
//   - createHttpEndpoints (shared, NGUỒN DUY NHẤT của ~67 method endpoint —
//     truyền staleSessionError / coldStartTimeoutMs 60000 / timeoutMs 15000
//     GIỐNG HỆT mini; SC18 pin 15000 — KHÔNG đổi),
//   - loginWithCredentials (shared, POST /api/v1/auth/class-session) — đường
//     đăng nhập duy nhất của web theo capabilities `local_class`,
//   - logout (gọi endpoint thu hồi với token cũ đã chụp + clearSession NGAY),
//   - requireBaseUrl / staleSessionError / authed (cô lập theo thế hệ phiên).
//
// BẤT BIẾN AN TOÀN giữ nguyên từ mini:
//   1. Không có cơ chế gặp lỗi API thì âm thầm chuyển sang mock thành công.
//   2. Lỗi/timeout phải ném lỗi ra để UI hiển thị trạng thái lỗi thật.
//   3. Demo (?demo=1) là chế độ RÕ RÀNG qua createMockAdapter (shared) — không
//      fallback tự động; mock không tạo token/phiên thật (qa-demo-isolation).
//
// Surface method: mọi tên từ ADAPTER_METHODS (shared contract) — pages port
// KHÔNG phải đổi tên; method riêng của mini (loginWithZaloToken/trySilentLogin/
// assertZaloHost) KHÔNG tồn tại ở production adapter của web (không host Zalo);
// mock adapter của shared vẫn cung cấp chúng cho demo fixtures.

import { ApiError, createApiClient } from "../../../packages/family_bridge_shared/src/api/client.mjs";
import { createHttpEndpoints } from "../../../packages/family_bridge_shared/src/adapter/http-endpoints.js";
import { ADAPTER_METHODS } from "../../../packages/family_bridge_shared/src/adapter/contract.js";
import { createMockAdapter } from "../../../packages/family_bridge_shared/src/adapter/mock-adapter.js";
import {
  clearSession, clearSessionIfUnchanged, getSession, getSessionGeneration,
  getToken, hasLiveSession, setSession,
} from "../../../packages/family_bridge_shared/src/session.js";
import { assertApiBaseUrlConfigured, getApiBaseUrl } from "../core/config.js";

const TIMEOUT_MS = 15000;
// Cold-start Render free tier: các call mở app đầu tiên (login, capabilities,
// health/ready, consents, profile, proposals, help directory) dùng 60s.
const COLD_START_TIMEOUT_MS = 60000;

export { ADAPTER_METHODS, createMockAdapter };

export function createWebAdapter({ baseUrl } = {}) {
  const request = createApiClient({ baseUrl, getToken, timeoutMs: TIMEOUT_MS });

  function requireBaseUrl() {
    // Thiếu cấu hình là lỗi kind "configuration" — KHÔNG phải timeout/mạng,
    // dù status = 0 (status 0 chỉ nghĩa "không có HTTP status"). Message
    // GIỐNG HỆT mini (assertApiBaseUrlConfigured — nguồn duy nhất của chuỗi).
    assertApiBaseUrlConfigured(baseUrl);
  }

  // Lỗi "kết quả lỗi thời do phiên đã đổi" — dùng chung cho login/authed.
  // KHÔNG báo chắc chắn thất bại: với thao tác ghi, máy chủ CÓ THỂ đã xử lý
  // trước khi response bị bỏ theo phiên — UI phải kiểm tra lại trạng thái
  // mới nhất, KHÔNG tự retry (cả đọc lẫn ghi) để tránh nhân đôi mutation.
  function staleSessionError() {
    return new ApiError(
      "Phiên đã thay đổi khi yêu cầu đang chạy — kết quả của phiên cũ bị bỏ qua. " +
      "Với thao tác ghi, máy chủ có thể đã xử lý trước khi phiên đổi: hãy kiểm " +
      "tra lại trạng thái mới nhất trước khi thử lại.",
      0,
      "stale_session",
    );
  }

  // Wrapper cho các call cần đăng nhập — GIỐNG HỆT zalo-adapter: cô lập theo
  // thế hệ phiên cho CẢ thành công lẫn lỗi; 401 của phiên hiện tại xóa phiên;
  // response của thế hệ cũ bị BỎ (stale_session), không tự retry.
  async function authed(run) {
    const capturedGeneration = getSessionGeneration();
    let data;
    try {
      data = await run();
    } catch (error) {
      if (getSessionGeneration() !== capturedGeneration) {
        throw staleSessionError();
      }
      if (error instanceof ApiError && error.status === 401) {
        clearSessionIfUnchanged(capturedGeneration);
      }
      throw error;
    }
    if (getSessionGeneration() !== capturedGeneration) {
      throw staleSessionError();
    }
    return data;
  }

  return {
    mode: "web",

    // Endpoint thuần HTTP từ shared (67 method: health/ready, 501 boundaries,
    // F01/F06, class-session, proposals, F05/F03/F10/F04, help, privacy,
    // mood/program/activities) — bao gồm loginWithCredentials/getCapabilities.
    ...createHttpEndpoints({
      request,
      authed,
      requireBaseUrl,
      staleSessionError,
      coldStartTimeoutMs: COLD_START_TIMEOUT_MS,
    }),

    async logout() {
      requireBaseUrl();
      // Chụp token TRƯỚC khi vô hiệu hóa: request thu hồi phải đi đúng token
      // cũ (explicit token override) dù phiên tại client đã xóa ngay sau đây.
      const token = getToken();
      // Vô hiệu hóa NGAY LẶC TỨC (giống mini): mọi luồng đăng nhập và request
      // bắt đầu trước logout đều mất hiệu lực từ thời điểm này.
      clearSession();
      if (token) {
        // Vẫn gửi thu hồi đúng token cũ đã chụp. Response này (kể cả lỗi)
        // KHÔNG đụng vào phiên: đăng nhập mới do người dùng chủ động bắt đầu
        // sau logout phải sống nguyên vẹn. Không retry thu hồi.
        await request("/api/v1/auth/logout", { method: "POST", body: {}, token });
        return true;
      }
      return false;
    },
  };
}

/** Chọn mode theo state demo: demo bật rõ -> mock; còn lại luôn web thật. */
export function resolveAdapterMode(demoMode) {
  return demoMode ? "mock" : "web";
}

/** Tạo adapter theo mode — KHÔNG fallback tự động (giống mini adapter.js). */
export function createAdapter({ mode, scenario = null } = {}) {
  if (mode === "mock") {
    return createMockAdapter({ scenario });
  }
  if (mode === "web") {
    return createWebAdapter({ baseUrl: getApiBaseUrl() });
  }
  throw new Error(`Chế độ adapter không hợp lệ: ${String(mode)}`);
}
