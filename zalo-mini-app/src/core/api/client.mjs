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
  constructor(message, status = 0, kind = "unknown", { code = null, details = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.kind = kind;
    // Mã lỗi nghiệp vụ từ error envelope backend {"error":{"code","details"}}
    // (ví dụ "invalid_or_expired_code", "revision_conflict"). UI nên ưu tiên
    // `code` để chọn thông điệp; `kind` giữ vai trò phân loại vận chuyển.
    this.code = code;
    this.details = details;
  }
}

// Auth modules supply tokens in memory. No automatic retry of writes.
export function createApiClient({ baseUrl, getToken = () => null, timeoutMs = 15000 }) {
  return async function request(path, { method = "GET", body, token, query, idempotencyKey, timeoutMs: perCallTimeoutMs } = {}) {
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
    // timeoutMs truyền theo TỪNG call (login/cold-start 60s) đè mặc định;
    // phân loại lỗi KHÔNG đổi theo timeout (vẫn timeout/network/http...).
    const effectiveTimeoutMs = Number.isFinite(perCallTimeoutMs) && perCallTimeoutMs > 0
      ? perCallTimeoutMs
      : timeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), effectiveTimeoutMs);
    try {
      const headers = { Accept: "application/json" };
      // Idempotency key do CALLER tạo (crypto.randomUUID tại nút xác nhận);
      // client không tự sinh — gửi lại cùng key là replay có chủ đích.
      if (idempotencyKey) headers["X-Idempotency-Key"] = String(idempotencyKey);
      // `token` (tùy chọn): dùng token CHỤP TRƯỚC cho request đi kèm — logout
      // cần thu hồi đúng token cũ dù phiên tại client đã bị vô hiệu hóa ngay
      // từ đầu logout (getToken() lúc đó đã trả null). Vẫn là in-memory,
      // không bao giờ vào URL/storage (SEC-10).
      const bearer = token === undefined ? getToken() : token;
      if (bearer) headers.Authorization = `Bearer ${bearer}`;
      if (body !== undefined) headers["Content-Type"] = "application/json";
      // Query params: nối thêm an toàn vào path đã validate (path phải bắt đầu
      // bằng "/" và không chứa "//" — kiểm tra phía trên). Giá trị được encode
      // bởi URLSearchParams, không ghép chuỗi thô.
      let fullPath = path;
      if (query && typeof query === "object") {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(query)) {
          if (value === null || value === undefined || value === "") continue;
          params.set(key, String(value));
        }
        const qs = params.toString();
        if (qs) fullPath = `${path}${path.includes("?") ? "&" : "?"}${qs}`;
      }
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}${fullPath}`, {
        method, headers, credentials: "omit", signal: controller.signal,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) {
        // Đọc envelope lỗi {"error":{"code","details"}} để UI báo đúng nghiệp vụ
        // (mã mời sai, trùng kết nối, xung đột revision...). Không bao giờ ném
        // token/secret — backend không đưa chúng vào envelope (SEC).
        let code = null;
        let details = null;
        try {
          const problem = await response.json();
          if (problem && typeof problem === "object" && problem.error) {
            if (typeof problem.error.code === "string") code = problem.error.code;
            if (problem.error.details && typeof problem.error.details === "object") {
              details = problem.error.details;
            }
          }
        } catch {
          // body lỗi không parse được — giữ thông điệp chung, không suy thêm.
          if (controller.signal.aborted) {
            throw new ApiError("Kết nối quá thời gian chờ. Vui lòng thử lại.", 0, "timeout");
          }
        }
        throw new ApiError("Không thể hoàn tất yêu cầu. Vui lòng thử lại.", response.status, "http", { code, details });
      }
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
