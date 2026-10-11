// Mock adapter — fixtures synthetic, CHỈ chạy khi demo mode bật rõ ràng.
// Dữ liệu minh họa có nhãn "Dữ liệu minh họa" ở tầng UI (demo-banner).
// Không lưu token/session giả như session thật; không phát sinh connection
// hoặc grant thật khi hiển thị trạng thái "đã kết nối".

import { ApiError } from "../api/client.mjs";
import { fixtures } from "../fixtures/index.js";

const DEFAULT_LATENCY_MS = 450;
const TIMEOUT_MS = 4000;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * scenario: null | "ok" | "error" | "timeout"
 *  - null: dùng hành vi chuẩn (ok).
 *  - "error": server trả 503 unavailable (mô phỏng ready thất bại).
 *  - "timeout": không trả lời trong thời gian chờ.
 * Chỉ có hiệu lực với mock adapter, được bật RÕ qua UI demo/query param.
 */
export function createMockAdapter({ scenario = null } = {}) {
  const pick = (fallback) => (scenario ?? fallback ?? "ok");

  async function simulate({ kind, fallback }) {
    const mode = pick(fallback);
    if (mode === "timeout") {
      await wait(TIMEOUT_MS + 500); // vượt quá timeoutMs của ApiClient-style guard
      throw new ApiError("Kết nối quá thời gian chờ. Vui lòng thử lại.", 0);
    }
    await wait(DEFAULT_LATENCY_MS);
    if (mode === "error") {
      throw new ApiError(
        kind === "ready"
          ? "Máy chủ chưa sẵn sàng (dữ liệu minh họa)."
          : "Không thể hoàn tất yêu cầu. Vui lòng thử lại.",
        503,
      );
    }
    return true;
  }

  return {
    mode: "mock",

    async getBackendHealth() {
      await simulate({ kind: "health", fallback: "ok" });
      return "ok"; // GET /api/v1/health/ -> {"status":"ok"}
    },

    async getBackendReady() {
      await simulate({ kind: "ready", fallback: "ok" });
      return "ok"; // GET /api/v1/ready/ -> {"status":"ok"} hoặc 503 unavailable
    },

    /**
     * Trạng thái kết nối gia đình ở chế độ demo: fixture, KHÔNG tạo
     * connection/grant/session thật. Cả hai vai trò demo đều gắn với
     * tài khoản minh họa "đã kết nối" để xem trước home đã kết nối.
     */
    async getConnectionStatus() {
      await wait(200);
      return { connected: true, peer: fixtures.demoPeer, source: "fixture" };
    },

    async getProfile(role) {
      await wait(200);
      return { ...fixtures.demoProfile(role), source: "fixture" };
    },
  };
}
