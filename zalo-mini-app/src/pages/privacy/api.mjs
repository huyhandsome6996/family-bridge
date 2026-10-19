import { createApiClient, ApiError } from "../../core/api/client.mjs";
import { getApiBaseUrl } from "../../core/config.js";
import { getSessionToken } from "./session-bridge.js";
import { getSessionGeneration, clearSessionIfUnchanged } from "../../core/session.js";
// mobile-core-style api { get, post } quanh client.mjs của app.
export function createAppApi({ baseUrl = getApiBaseUrl(), readToken = getSessionToken } = {}) {
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

