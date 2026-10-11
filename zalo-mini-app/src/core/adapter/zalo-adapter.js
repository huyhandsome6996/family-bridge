// Zalo adapter — chế độ production. BOUNDARY cho US-004/Antigravity:
// hiện chỉ kiểm tra health/ready qua ApiClient. Các API nghiệp vụ khác
// (login Zalo, connection, thẻ cảm xúc, hộp thư...) CHƯA có — không được
// tự đặt thành "đã implement". Khi SDK zmp cần gọi, PHẢI env-guard:
// ngoài môi trường Zalo, SDK trả lỗi -1404 (tham khảo báo cáo Task 2-a).

import { ApiError, createApiClient } from "../api/client.mjs";
import { isZaloHost } from "../config.js";

const TIMEOUT_MS = 15000;

export function createZaloAdapter({ baseUrl } = {}) {
  const request = createApiClient({ baseUrl, timeoutMs: TIMEOUT_MS });

  function requireBaseUrl() {
    if (!baseUrl) {
      throw new ApiError(
        "Chưa cấu hình địa chỉ máy chủ. Thêm VITE_API_BASE_URL khi build.",
        0,
      );
    }
  }

  return {
    mode: "zalo",

    async getBackendHealth() {
      requireBaseUrl();
      const data = await request("/api/v1/health/");
      return data && data.status === "ok" ? "ok" : "unknown";
    },

    async getBackendReady() {
      requireBaseUrl();
      try {
        const data = await request("/api/v1/ready/");
        return data && data.status === "ok" ? "ok" : "unknown";
      } catch (error) {
        // 503 {"status":"unavailable"} là trạng thái HỢP LỆ của ready,
        // không phải lỗi mạng — trả về trạng thái để UI hiển thị đúng.
        if (error instanceof ApiError && error.status === 503) return "unavailable";
        throw error;
      }
    },

    /**
     * BOUNDARY (chưa implement): trạng thái kết nối gia đình thật cần
     * US-004 cấp endpoint + auth. Ở đây KHÔNG giả dữ liệu — luôn ném lỗi
     * để UI hiển thị "chưa triển khai" thay vì fake-success.
     */
    async getConnectionStatus() {
      throw new ApiError("Tính năng kết nối chưa được triển khai ở bản nền tảng.", 501);
    },

    /**
     * BOUNDARY: định danh Zalo thật (getAccessToken -> server xác minh
     * appsecret_proof) thuộc US-004/US-011. Không gọi zmp-sdk getUserInfo
     * ở bản nền tảng; SDK trên localhost còn trả mock cứng — không tin.
     */
    async getProfile() {
      throw new ApiError("Định danh người dùng chưa được triển khai ở bản nền tảng.", 501);
    },

    /** Helper cho US-004 sau này: chỉ cho phép gọi SDK trong Zalo thật. */
    assertZaloHost() {
      if (!isZaloHost()) {
        throw new ApiError("Tính năng này chỉ hoạt động trong Zalo.", 0);
      }
    },
  };
}
