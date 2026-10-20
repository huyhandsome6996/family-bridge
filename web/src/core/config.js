// Cấu hình runtime của web độc lập (ADR-3, task 19-a). KHÔNG đặt secret vào
// VITE_* (SEC-19): mọi biến VITE_* đều được nhúng vào bundle công khai.
//
// Khác biệt có chủ đích so với mini (zalo-mini-app/src/core/config.js):
// - KHÔNG isZaloHost/assertZaloHost — web không chạy trong host Zalo.
// - assertApiBaseUrlConfigured(): ném ApiError kind "configuration" khi thiếu
//   địa chỉ backend (main.js dùng để hiện màn lỗi cấu hình rõ ràng; adapter
//   web dùng như requireBaseUrl trước mỗi call). Message GIỐNG HỆT mini.
//
// Lưu ý khả dụng kiểm thử: dùng optional chaining trên import.meta.env để
// module import được cả trong node:test thuần (Vite thay giá trị khi build;
// ngoài Vite import.meta.env là undefined và các hàm trả giá trị an toàn).

import { ApiError } from "../../../packages/family_bridge_shared/src/api/client.mjs";

// Base URL backend: build production đọc từ biến môi trường Vite.
// Không cấu hình -> trả về chuỗi rỗng (GIỐNG mini — SC1-UI pin hành vi này);
// việc NÉM lỗi cấu hình do assertApiBaseUrlConfigured() đảm nhiệm, tuyệt đối
// không tự chuyển sang mock (không fake-success).
export function getApiBaseUrl() {
  const raw = (import.meta.env && import.meta.env.VITE_API_BASE_URL) || "";
  return raw.replace(/\/$/, "");
}

export const isProductionBuild = Boolean(import.meta.env && import.meta.env.PROD);

/** Visible label for an explicitly configured device-test build. */
export function getTestBuildLabel() {
  const label = (import.meta.env && import.meta.env.VITE_TEST_LABEL) || "";
  return typeof label === "string" ? label.trim().slice(0, 80) : "";
}

/**
 * Ném ApiError kind "configuration" khi thiếu địa chỉ backend — message
 * tiếng Việt GIỐNG HỆT requireBaseUrl của zalo-adapter (nguồn mini, SC1-UI
 * đối chiếu). Dùng ở main.js (màn lỗi cấu hình khi boot) và web-adapter
 * (requireBaseUrl trước mỗi call). Không bao giờ fallback mock.
 */
export function assertApiBaseUrlConfigured(baseUrl = getApiBaseUrl()) {
  if (!baseUrl) {
    throw new ApiError(
      "Chưa cấu hình địa chỉ máy chủ. Thêm VITE_API_BASE_URL khi build.",
      0,
      "configuration",
    );
  }
  return baseUrl;
}

/**
 * Demo mode chỉ bật khi được yêu cầu RÕ RÀNG qua query `?demo=1`.
 * Không có bất kỳ cơ chế fallback tự động nào từ API/auth lỗi sang demo.
 * Chế độ demo luôn hiển thị nhãn "Dữ liệu minh họa" trên mọi màn hình.
 */
export function isDemoModeRequested() {
  try {
    if (typeof window === "undefined" || !window.location) return false;
    const searchParams = new URLSearchParams(window.location.search);
    const searchFlag = searchParams.get("demo");
    if (searchFlag === "1" || searchFlag === "true") return true;

    const hash = window.location.hash || "";
    const qIndex = hash.indexOf("?");
    if (qIndex !== -1) {
      const hashParams = new URLSearchParams(hash.slice(qIndex + 1));
      const hashFlag = hashParams.get("demo");
      if (hashFlag === "1" || hashFlag === "true") return true;
    }
    return false;
  } catch {
    return false;
  }
}
