// F15 session bridge — điểm nối tới module phiên đăng nhập của F01
// (zalo-mini-app/src/core/session.js, PR #26).
//
// R11 fix — KHÔNG còn dynamic import vào đường nguồn với vite-ignore:
//   cách cũ bỏ qua phân tích tĩnh của Vite, để nguyên đường dẫn nguồn ngoài
//   artifact, nên production build import /core/session.js lúc chạy ->
//   HTTP 404 và trang mãi ở no_session dù F01 đã có phiên.
//   Giờ bridge dùng import.meta.glob (Vite phân tích lúc BUILD): khi
//   src/core/session.js tồn tại, module được BUNDLE thành chunk và map trỏ
//   vào chunk đó (import runtime giải quyết nội bộ artifact — không 404);
//   khi F01 chưa merge, map rỗng -> no_session TRUNG THỰC, build vẫn xanh.
//   Trong node test thuần (không qua Vite) import.meta.glob không tồn tại
//   -> guard trả null, hành vi no_session vẫn đúng.
//
// Interface đã đối chiếu với F01 (session.js): getToken()/clearSession()/
// hasLiveSession() — token CHỈ trong bộ nhớ, không storage, không URL.
//
// Trạng thái thiếu phiên là TRẠNG THÁI THẬT của trang (không fake login,
// không demo âm thầm) — trang quyền riêng tư sẽ báo "chưa có phiên đăng nhập".

const SESSION_GLOB_KEY = "../../core/session.js";
let cachedModulePromise = null;

function sessionModuleLoaders() {
  // Vite build: biểu thức tĩnh import.meta.glob được thay bằng map
  // { "<pattern>": () => import("<bundled chunk>") }. Node thuần: hàm không
  // tồn tại -> TypeError -> bắt và trả null (không có session trong môi
  // trường test thuần — đúng thật, không phải bypass).
  try {
    return import.meta.glob("../../core/session.js") || {};
  } catch {
    return {};
  }
}

function loadSessionModule() {
  if (!cachedModulePromise) {
    const loaders = sessionModuleLoaders();
    const loader = loaders[SESSION_GLOB_KEY];
    if (typeof loader !== "function") {
      // F01 chưa có trong build: không phiên là TRẠNG THÁI THẬT.
      cachedModulePromise = Promise.resolve(null);
      return cachedModulePromise;
    }
    cachedModulePromise = Promise.resolve()
      .then(() => loader())
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
