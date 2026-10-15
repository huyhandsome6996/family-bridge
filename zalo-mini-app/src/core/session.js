// Phiên đăng nhập Family Bridge — CHỈ trong bộ nhớ của tab/webview hiện tại.
//
// Quy tắc an toàn (SEC, qa-secrets-privacy):
// - Token phiên KHÔNG BAO GIỜ được ghi vào bất kỳ web storage/cookie nào.
//   Mất khi đóng app = chấp nhận: Mini App mở lại sẽ đăng nhập lại bằng
//   zmp-sdk getAccessToken (một lần, không lặp vô hạn).
// - Token không bao giờ đặt vào URL. Mọi request đi qua ApiClient với
//   getToken() đọc từ module này.
// - clearSession()/clearSessionIfUnchanged(generation) phải được gọi khi
//   logout, đổi vai trò actor, hoặc khi nhận 401 từ backend (phiên hết hạn/
//   thu hồi/user bị vô hiệu). Với request đang chạy, DÙNG biến thể theo
//   generation để request của phiên cũ không xóa nhầm phiên mới.

let current = null; // { token, userId, expiresAt (ms epoch), consentsRequired }

// Bộ đếm "thế hệ phiên" (session generation): MỖI lần setSession/clearSession
// đều tăng generation. Request/luồng đăng nhập capture generation trước khi
// chạy; khi kết quả trở lại, so generation để quyết định:
//  - 401 của một request thuộc phiên CŨ (generation đã đổi) -> KHÔNG được
//    clearSession() xóa phiên MỚI (review: "CÔ LẬP REQUEST THEO PHIÊN").
//  - Response đăng nhập về chậm sau logout -> kết quả lỗi thời bị BỎ, không
//    được khôi phục phiên ngoài ý muốn.
// Generation là số nguyên tăng đơn điệu trong bộ nhớ tab — không bao giờ
// được persist (cùng quy tắc in-memory với token).
let generation = 0;

function toMillis(expiresAt) {
  if (typeof expiresAt === "number") return expiresAt;
  if (typeof expiresAt === "string") {
    const parsed = Date.parse(expiresAt);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

/** Thế hệ phiên hiện tại (số tăng mỗi lần phiên thay đổi). */
export function getSessionGeneration() {
  return generation;
}

/**
 * Xóa phiên CHỈ KHI phiên chưa đổi kể từ khi caller capture `captured`.
 * Dùng cho logout/hủy theo phiên: nếu giữa chừng có đăng nhập mới hoàn tất
 * (generation đã tăng) thì KHÔNG xóa phiên mới. Trả về true nếu đã xóa.
 */
export function clearSessionIfUnchanged(capturedGeneration) {
  if (generation !== capturedGeneration) return false;
  current = null;
  generation += 1;
  return true;
}

/** Lưu phiên mới (đè bản cũ). Trả về snapshot đã lưu. */
export function setSession({
  token, userId, expiresAt, consentsRequired = null, displayName = null,
  loginMethod = null,
}) {
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
    displayName: typeof displayName === "string" && displayName
      ? displayName : null,
    // "class" | "zalo" | null — nguồn đăng nhập, dùng để chọn đường đổi tên
    // hiển thị ở Cài đặt (lớp: re-auth mật khẩu; Zalo: PUT /auth/me).
    loginMethod: loginMethod === "class" || loginMethod === "zalo"
      ? loginMethod : null,
  };
  generation += 1;
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
    displayName: current.displayName || null,
    loginMethod: current.loginMethod || null,
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

/** Xóa phiên trong bộ nhớ. Idempotent về dữ liệu; MỖI lần gọi đều tăng
 * generation để mọi capture cũ (authed/logout/login) đều hết hiệu lực. */
export function clearSession() {
  current = null;
  generation += 1;
}
