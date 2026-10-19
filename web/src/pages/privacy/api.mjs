// Bản web của zalo-mini-app/src/pages/privacy/api.mjs (F15 items — Task 3-c).
// CÙNG semantics với bản mini: api { get, post } quanh createApiClient
// (shared — nguồn duy nhất); token gắn TỪNG request lấy từ phiên in-memory
// (SEC-10); guard stale-session theo thế hệ phiên; 401 → clearSessionIfUnchanged.
//
// Khác biệt CHỈ là đường dẫn nguồn theo kiến trúc web (ADR-3):
// - web không có shim zalo-mini-app/src/core/api/client.mjs → import thẳng
//   nguồn shared (cùng cách web-adapter.js đang dùng);
// - phiên lấy qua core/session.js (shim re-export shared session) thay cho
//   privacy/session-bridge.js (import.meta.glob là cơ chế riêng của mini build
//   Vite — web import tĩnh được vì core/session.js luôn tồn tại trong cây).
// Không thêm quyền mới, không chia sẻ mặc định, không tự sinh định danh actor.
import { createApiClient, ApiError } from
  "../../../../packages/family_bridge_shared/src/api/client.mjs";
import { getApiBaseUrl } from "../../core/config.js";
import {
  clearSessionIfUnchanged, getSessionGeneration, getToken,
} from "../../core/session.js";

// mobile-core-style api { get, post } quanh client.mjs của app — giống hệt
// bản mini, chỉ đổi nguồn import.
export function createAppApi({ baseUrl = getApiBaseUrl(), readToken = getToken } = {}) {
  const request = createApiClient({
    baseUrl,
    getToken: () => null, // token gắn từng request qua bridge bên dưới
  });
  async function call(path, opts) {
    const generation = getSessionGeneration();
    const token = await readToken();
    const stale = () => new ApiError("Phiên đã thay đổi; hãy kiểm tra lại trạng thái trước khi thử lại.", 0, "stale_session");
    if (generation !== getSessionGeneration()) throw stale();
    try {
      const data = await request(path, { ...opts, token });
      if (generation !== getSessionGeneration()) throw stale();
      return data;
    } catch (error) {
      if (generation !== getSessionGeneration()) throw stale();
      if (error.status === 401) clearSessionIfUnchanged(generation);
      throw error;
    }
  }
  return {
    async get(path, opts = {}) {
      return call(path, { ...(opts || {}), method: "GET" });
    },
    async post(path, opts = {}) {
      return call(path, { ...(opts || {}), method: "POST" });
    },
  };
}
