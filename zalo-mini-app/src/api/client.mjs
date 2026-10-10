export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// Auth modules supply tokens in memory. No automatic retry of writes.
export function createApiClient({ baseUrl, getToken = () => null, timeoutMs = 15000 }) {
  return async function request(path, { method = "GET", body } = {}) {
    if (!baseUrl) throw new ApiError("Chưa cấu hình địa chỉ backend.");
    const base = new URL(baseUrl);
    if (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname))) {
      throw new ApiError("Địa chỉ backend phải sử dụng HTTPS.");
    }
    if (base.search || base.hash || base.username || base.password || !path.startsWith("/") || path.startsWith("//")) {
      throw new ApiError("Địa chỉ API không hợp lệ.");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = { Accept: "application/json" };
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      if (body !== undefined) headers["Content-Type"] = "application/json";
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
        method, headers, credentials: "omit", signal: controller.signal,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) throw new ApiError("Không thể hoàn tất yêu cầu. Vui lòng thử lại.", response.status);
      try { return await response.json(); }
      catch { throw new ApiError("Backend trả về dữ liệu không hợp lệ.", response.status); }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error.name === "AbortError") throw new ApiError("Kết nối quá thời gian chờ. Vui lòng thử lại.");
      throw new ApiError("Chưa kết nối được backend. Kiểm tra mạng và thử lại.");
    } finally { clearTimeout(timer); }
  };
}
