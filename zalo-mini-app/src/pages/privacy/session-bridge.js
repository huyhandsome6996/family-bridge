// F15 session bridge — điểm nối tới module phiên đăng nhập của F01
// (zalo-mini-app/src/core/session.js, PR #26). F01 CHƯA merge vào main:
// bridge dùng dynamic import có @vite-ignore nên build không lỗi khi module
// chưa tồn tại; khi F01 được hợp nhất, bridge tự dùng phiên thật.
//
// Interface đã đối chiếu với F01 (session.js): getToken()/clearSession()/
// hasLiveSession() — token CHỈ trong bộ nhớ, không storage, không URL.
//
// Trạng thái thiếu phiên là TRẠNG THÁI THẬT của trang (không fake login,
// không demo âm thầm) — trang quyền riêng tư sẽ báo "chưa có phiên đăng nhập".

const SESSION_MODULE_SPEC = "../../core/session.js";
let cachedModulePromise = null;

function loadSessionModule() {
  if (!cachedModulePromise) {
    // Computed specifier + @vite-ignore: Vite bỏ qua phân tích tĩnh, trình
    // duyệt/node sẽ import lúc chạy; module vắng mặt -> reject -> null.
    const specifier = SESSION_MODULE_SPEC;
    cachedModulePromise = import(/* @vite-ignore */ specifier)
      .then((mod) => (mod && typeof mod.getToken === "function" ? mod : null))
      .catch(() => null);
  }
  return cachedModulePromise;
}

/** Token hiện tại hoặc null (chưa đăng nhập / F01 chưa tích hợp). */
export async function getSessionToken() {
  const mod = await loadSessionModule();
  if (!mod) return null;
  try {
    const token = mod.getToken();
    return typeof token === "string" && token ? token : null;
  } catch {
    return null;
  }
}

/** Phiên còn sống theo module F01 (expiresAt trong bộ nhớ). */
export async function hasLiveSession() {
  const mod = await loadSessionModule();
  if (!mod || typeof mod.hasLiveSession !== "function") return false;
  try {
    return Boolean(mod.hasLiveSession());
  } catch {
    return false;
  }
}

/** Dọn phiên trong bộ nhớ (logout/đổi actor/mất quyền). Idempotent. */
export async function clearSession() {
  const mod = await loadSessionModule();
  if (mod && typeof mod.clearSession === "function") {
    try { mod.clearSession(); } catch { /* im lặng: dọn phiên là tốt nhất */ }
  }
}

/** Dùng cho TEST: reset cache module (giả lập F01 xuất hiện/mất đi). */
export function resetSessionBridgeForTest() {
  cachedModulePromise = null;
}
