// Router hash-based (#/route) — an toàn trong webview Zalo, không cần cấu hình server.
// Page contract (mọi page export đúng shape này):
//   export const page = {
//     id: "u01-welcome",            // mã màn
//     title: "Family Bridge",       // document.title khi mở
//     requiresRole: false,          // true -> cần đã chọn vai trò, chưa có thì redirect #/role-select
//     showBottomNav: false,         // true -> hiển thị bottom navigation
//     render(ctx) -> HTMLElement   // ctx: { store, adapter, navigate, params }
//   };

import { clear, h } from "./dom.js";

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
};

export function parseHash() {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const [path, query] = raw.split("?");
  const params = new URLSearchParams(query || "");
  return { path: path || "/", params };
}

export function navigate(path) {
  const target = path.startsWith("#") ? path : `#${path}`;
  if (window.location.hash === target) {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = target;
  }
}

export function createRouter({ root, ctx }) {
  let cleanup = null;
  let renderToken = 0; // chặn render cũ ghi đè khi hashchange chồng nhau

  async function render() {
    const token = ++renderToken;
    const { path, params } = parseHash();
    const loader = routes[path];
    const container = clear(root);

    if (cleanup) {
      try { cleanup(); } catch { /* không chặn render mới */ }
      cleanup = null;
    }

    const mod = loader ? await loader() : await import("../pages/not-found/index.js");
    if (token !== renderToken) return; // có render mới hơn — bỏ kết quả cũ
    const page = mod.page;

    if (page.requiresRole && !ctx.store.getState().role) {
      navigate("/role-select");
      return;
    }

    document.title = page.title || "Family Bridge";
    const el = page.render({ ...ctx, params });
    container.appendChild(el);

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
