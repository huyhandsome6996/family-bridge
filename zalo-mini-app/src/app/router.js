// Router hash-based (#/route) — an toàn trong webview Zalo, không cần cấu hình server.
// Page contract (mọi page export đúng shape này):
//   export const page = {
//     id: "u01-welcome",            // mã màn
//     title: "Family Bridge",       // document.title khi mở
//     requiresRole: false,          // true -> cần đã chọn vai trò, chưa có thì redirect #/role-select
//     requiresAuth: false,          // true -> cần phiên sống (web), chưa có thì redirect #/login?reason=expired
//     chrome: "bare",               // "app" -> bọc trong app-shell (web desktop); mặc định "bare"
//     showBottomNav: false,         // true -> hiển thị bottom navigation
//     render(ctx) -> HTMLElement   // ctx: { store, adapter, navigate, params }
//   };
//
// Web Render (Task 2) — thêm ADDITIVE, giữ nguyên hành vi cũ:
// - Pattern routes: "/messages/:id" — sau khi exact match thất bại, tách segment
//   path và khớp ":param" → gộp vào ctx.params (URLSearchParams + path params).
// - requiresAuth đứng TRƯỚC requiresRole (phiên sống là điều kiện rộng hơn).
//   Demo (?demo=1) được coi như phiên xem trước minh họa — không redirect.
// - chrome: "app" bọc page trong app-shell (sidebar + topbar web); bottom-nav
//   vẫn được gắn như cũ cho mobile (CSS ẩn ở ≥1024px).

import { clear, h } from "./dom.js";
import { getSession, hasLiveSession } from "../core/session.js";

export const routes = {
  "/": () => import("../pages/welcome/index.js"),
  "/welcome": () => import("../pages/welcome/index.js"),
  "/how-to-use": () => import("../pages/how-to-use/index.js"),
  "/role-select": () => import("../pages/role-select/index.js"),
  "/home": () => import("../pages/home/index.js"),
  "/companion": () => import("../pages/companion/index.js"),
  "/mailbox": () => import("../pages/mailbox/index.js"),
  "/diary": () => import("../pages/diary/index.js"),
  "/profile": () => import("../pages/profile/index.js"),
  "/connection-check": () => import("../pages/connection-check/index.js"),
  "/help": () => import("../pages/help/index.js"),
  // ---- F01: đăng nhập + đồng ý + kết nối hai phía ----
  "/login": () => import("../pages/login/index.js"),
  "/consent": () => import("../pages/consent/index.js"),
  "/connect": () => import("../pages/connect/index.js"),
  // ---- F06: soạn thư cảm xúc + tạm dừng 300s máy chủ (U34 Stitch) ----
  "/compose": () => import("../pages/compose/index.js"),
  // ---- Web Render (Task 2): màn web mới + pattern route chi tiết thư ----
  "/cards": () => import("../pages/cards/index.js"),
  "/signal": () => import("../pages/signal/index.js"),
  "/messages/:id": () => import("../pages/message/index.js"),
  "/proposal": () => import("../pages/proposal/index.js"),
  "/settings": () => import("../pages/settings/index.js"),
  "/privacy": () => import("../pages/privacy/index.js"),
};

export function parseHash() {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const [path, query] = raw.split("?");
  const params = new URLSearchParams(query || "");
  return { path: path || "/", params };
}

/**
 * Khớp pattern route "/messages/:id" với path thật "/messages/abc".
 * Trả về map tham số ("{ id: "abc" }") hoặc null khi không khớp.
 * Số segment phải bằng nhau; ":name" khớp đúng MỘT segment (không rỗng).
 */
export function matchPattern(patternPath, actualPath) {
  const patternParts = patternPath.split("/").filter(Boolean);
  const actualParts = actualPath.split("/").filter(Boolean);
  if (patternParts.length !== actualParts.length) return null;
  const params = {};
  for (let i = 0; i < patternParts.length; i += 1) {
    const patternPart = patternParts[i];
    const actualPart = actualParts[i];
    if (patternPart.startsWith(":")) {
      if (!actualPart) return null;
      try {
        params[patternPart.slice(1)] = decodeURIComponent(actualPart);
      } catch {
        // Hash hỏng (percent-encoding sai) — dùng giá trị thô, không treo trang.
        params[patternPart.slice(1)] = actualPart;
      }
    } else if (patternPart !== actualPart) {
      return null;
    }
  }
  return params;
}

export function navigate(path) {
  const target = path.startsWith("#") ? path : `#${path}`;
  if (window.location.hash === target) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = target;
  }
}

/** Tìm loader cho path: exact trước, pattern ":param" sau. */
function findRoute(path) {
  if (routes[path]) return { loader: routes[path], pathParams: null };
  for (const [pattern, loader] of Object.entries(routes)) {
    if (!pattern.includes(":")) continue;
    const pathParams = matchPattern(pattern, path);
    if (pathParams) return { loader, pathParams };
  }
  return null;
}

/**
 * Cập nhật badge số thư chưa đọc TRÊN SHELL bằng dữ liệu ĐÃ tải thật.
 * Best-effort: lỗi mạng → bỏ badge (không bao giờ hiện số bịa).
 * Chạy tối đa một lần mỗi render; mọi trang chrome "app" đều hưởng.
 */
function refreshUnreadBadge(shell, adapter, guardToken) {
  if (!shell || !adapter || typeof adapter.listMessages !== "function") return;
  Promise.resolve()
    .then(() => adapter.listMessages({ limit: 20 }))
    .then((pageData) => {
      if (guardToken() !== true) return; // đã render trang mới — bỏ kết quả cũ
      const badge = shell.querySelector("[data-nav-badge='mailbox']");
      if (!badge) return;
      const rows = (pageData && pageData.results) || [];
      const unread = rows.filter(
        (row) => row && row.direction === "received" && !row.read,
      ).length;
      if (unread > 0) {
        badge.textContent = String(unread);
        badge.hidden = false;
      } else {
        badge.hidden = true;
      }
    })
    .catch(() => {
      if (guardToken() !== true) return;
      const badge = shell.querySelector("[data-nav-badge='mailbox']");
      if (badge) badge.hidden = true; // lỗi → không badge (trung thực)
    });
}

export function createRouter({ root, ctx }) {
  let cleanup = null;
  let renderToken = 0; // chặn render cũ ghi đè khi hashchange chồng nhau

  async function render() {
    const token = ++renderToken;
    const guardToken = () => token === renderToken;
    const { path, params } = parseHash();
    const container = clear(root);

    if (cleanup) {
      try { cleanup(); } catch { /* không chặn render mới */ }
      cleanup = null;
    }

    // 1) Exact match trước, pattern match sau (null → not-found).
    const found = findRoute(path);
    const mod = found ? await found.loader() : await import("../pages/not-found/index.js");
    if (token !== renderToken) return; // có render mới hơn — bỏ kết quả cũ
    const page = mod.page;

    // Gộp path params vào ctx.params (URLSearchParams giữ nguyên query).
    if (found && found.pathParams) {
      for (const [key, value] of Object.entries(found.pathParams)) {
        params.set(key, value);
      }
    }

    // 2) requiresAuth TRƯỚC requiresRole: web không có phiên sống → login.
    //    Demo mode là phiên xem trước minh họa — cho qua (không redirect).
    const demoMode = Boolean(ctx.store.getState().demoMode);
    if (page.requiresAuth && !demoMode && !hasLiveSession()) {
      navigate("/login?reason=expired");
      return;
    }

    if (page.requiresRole && !ctx.store.getState().role) {
      navigate("/role-select");
      return;
    }

    document.title = page.title || "Family Bridge";
    const el = page.render({ ...ctx, params });

    // 3) Chrome: "app" bọc trong app-shell (web); mặc định "bare" giữ nguyên.
    let host = el;
    let shell = null;
    if (page.chrome === "app") {
      const { createAppShell } = await import("../components/app-shell.js");
      if (token !== renderToken) return;
      const session = getSession();
      shell = createAppShell({
        activePath: path,
        profile: {
          displayName: (session && session.displayName) || "Thành viên Family Bridge",
        },
        children: [el],
      });
      host = shell;
      refreshUnreadBadge(shell, ctx.adapter, guardToken);
    }
    container.appendChild(host);

    if (page.showBottomNav) {
      const { createBottomNav } = await import("../components/bottom-nav.js");
      if (token !== renderToken) return; // render mới hơn đã thay thế
      container.appendChild(createBottomNav({ active: path, onNavigate: navigate }));
    }

    window.scrollTo(0, 0);
    cleanup = typeof page.destroy === "function" ? page.destroy : null;
  }

  function start() {
    window.addEventListener("hashchange", render);
    render();
  }

  function stop() {
    window.removeEventListener("hashchange", render);
    if (cleanup) { try { cleanup(); } catch { /* im lặng khi dừng app */ } }
  }

  return { start, stop, render };
}

export { h };
