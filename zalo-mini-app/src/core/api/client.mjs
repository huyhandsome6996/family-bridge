// Port từ nhánh feat/us-003-kt01 (PR #1, đã review) — giữ nguyên logic an toàn:
// HTTPS bắt buộc, timeout, không retry tự động, không lộ body lỗi server.
//
// Phân loại lỗi CHÍNH THỨC là thuộc tính `kind` của ApiError (gắn tại nơi ném):
//   - "configuration"    — thiếu/sai cấu hình địa chỉ backend.
//   - "network"          — không kết nối được (fetch ném lỗi mạng/TypeError).
//   - "timeout"          — yêu cầu bị hủy do hết thời gian chờ (AbortError từ timer client, kể cả khi đang đọc body).
//   - "http"             — server trả mã lỗi HTTP (status = mã HTTP thật).
//   - "invalid_response" — response không parse được JSON (lỗi cú pháp thật, không phải do timeout).
// `status === 0` chỉ nghĩa "không có HTTP status" (cấu hình, mạng, timeout đều có
// thể là 0) — TUYỆT ĐỐI không dùng status để suy loại lỗi; phía UI phải đọc `kind`,
// và ApiError không kind / lỗi lạ phải rơi vào nhánh lỗi chung (không bao giờ timeout).
export class ApiError extends Error {
  constructor(message, status = 0, kind = "unknown") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.kind = kind;
  }
}

// Auth modules supply tokens in memory. No automatic retry of writes.
export function createApiClient({ baseUrl, getToken = () => null, timeoutMs = 15000 }) {
  return async function request(path, { method = "GET", body } = {}) {
    if (!baseUrl) throw new ApiError("Chưa cấu hình địa chỉ backend.", 0, "configuration");
    let base;
    try {
      base = new URL(baseUrl);
    } catch {
      throw new ApiError("Địa chỉ máy chủ chưa cấu hình đúng. Kiểm tra biến VITE_API_BASE_URL khi build rồi thử lại.", 0, "configuration");
    }
    if (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname))) {
      throw new ApiError("Địa chỉ backend phải sử dụng HTTPS.", 0, "configuration");
    }
    if (base.search || base.hash || base.username || base.password || !path.startsWith("/") || path.startsWith("//")) {
      throw new ApiError("Địa chỉ API không hợp lệ.", 0, "configuration");
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
      if (!response.ok) throw new ApiError("Không thể hoàn tất yêu cầu. Vui lòng thử lại.", response.status, "http");
      let payload;
      try { payload = await response.json(); }
      catch (error) {
        // Timer client hủy request — kể cả khi đã nhận headers và đang đọc body → timeout.
        if (controller.signal.aborted || error.name === "AbortError") {
          throw new ApiError("Kết nối quá thời gian chờ. Vui lòng thử lại.", 0, "timeout");
        }
        // JSON thực sự sai cú pháp → dữ liệu backend không hợp lệ.
        if (error instanceof SyntaxError) {
          throw new ApiError("Backend trả về dữ liệu không hợp lệ.", response.status, "invalid_response");
        }
        // Lỗi truyền tải khi đang đọc body → lỗi mạng.
        throw new ApiError("Chưa kết nối được backend. Kiểm tra mạng và thử lại.", 0, "network");
      }
      return payload;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error.name === "AbortError") throw new ApiError("Kết nối quá thời gian chờ. Vui lòng thử lại.", 0, "timeout");
      throw new ApiError("Chưa kết nối được backend. Kiểm tra mạng và thử lại.", 0, "network");
    } finally { clearTimeout(timer); }
  };
}
