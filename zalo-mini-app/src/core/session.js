// Phiên đăng nhập Family Bridge — CHỈ trong bộ nhớ của tab/webview hiện tại.
//
// Quy tắc an toàn (SEC, qa-secrets-privacy):
// - Token phiên KHÔNG BAO GIỜ được ghi vào bất kỳ web storage/cookie nào.
//   Mất khi đóng app = chấp nhận: Mini App mở lại sẽ đăng nhập lại bằng
//   zmp-sdk getAccessToken (một lần, không lặp vô hạn).
// - Token không bao giờ đặt vào URL. Mọi request đi qua ApiClient với
//   getToken() đọc từ module này.
// - clearSession() phải được gọi khi logout, đổi vai trò actor, hoặc khi nhận
//   401 từ backend (phiên hết hạn/thu hồi/user bị vô hiệu).

let current = null; // { token, userId, expiresAt (ms epoch), consentsRequired }

function toMillis(expiresAt) {
  if (typeof expiresAt === "number") return expiresAt;
  if (typeof expiresAt === "string") {
    const parsed = Date.parse(expiresAt);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

/** Lưu phiên mới (đè bản cũ). Trả về snapshot đã lưu. */
export function setSession({ token, userId, expiresAt, consentsRequired = null }) {
  if (typeof token !== "string" || !token) {
    throw new TypeError("Phiên không hợp lệ: thiếu token.");
  }
  current = {
    token,
    userId: userId == null ? null : String(userId),
    expiresAt: toMillis(expiresAt),
    consentsRequired: Array.isArray(consentsRequired)
      ? consentsRequired.slice()
      : null,
  };
  return getSession();
}

/** Snapshot đọc-only (bản sao). null khi chưa đăng nhập. */
export function getSession() {
  if (!current) return null;
  return {
    token: current.token,
    userId: current.userId,
    expiresAt: current.expiresAt,
    consentsRequired: current.consentsRequired
      ? current.consentsRequired.slice()
      : null,
  };
}

export function getToken() {
  return current ? current.token : null;
}

export function getUserId() {
  return current ? current.userId : null;
}

/** Phiên còn sống: có token và chưa quá expiresAt. */
export function hasLiveSession(now = Date.now()) {
  if (!current || !current.token) return false;
  if (!current.expiresAt) return true; // backend luôn trả expires_at; phòng thủ
  return current.expiresAt > now;
}

/** Xóa phiên trong bộ nhớ. Idempotent. */
export function clearSession() {
  current = null;
}
