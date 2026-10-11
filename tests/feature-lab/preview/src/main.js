// Feature-lab preview shell (localhost only, MOCK-labeled).
// Purpose: let each feature branch mount its pages in a browser for manual
// checks. NEVER packaged into the production Mini App (the official client
// shell is zalo-mini-app/, owned by Agent B / integration).

import { createMockAdapter, createRouter, createSdkBridge, createSessionStore } from "family_bridge_mobile_core";

const routes = {};
const nav = document.getElementById("lab-nav");

function addRoute(path, label, factory) {
  routes[path] = factory;
  const link = document.createElement("a");
  link.href = "#" + path;
  link.textContent = label;
  nav.appendChild(link);
  nav.appendChild(document.createTextNode(" "));
}

// Feature modules register themselves here as their branches land, e.g.:
//   import { createPage as moodPage } from "family_bridge_features_mobile/f07_mood";
// addRoute("/f07/mood", "Tâm trạng (F07)", moodPage);
// Until then the preview lists the shared core sanity screen.

const sessionStore = createSessionStore();
const sdk = createSdkBridge({ adapter: createMockAdapter() });
const ctx = { sessionStore, sdk, mock: true };

addRoute("/", "Trang thử", async ({ root }) => {
  const el = document.createElement("div");
  el.className = "fb-page";
  el.innerHTML = [
    "<h1>Feature Lab</h1>",
    "<p>Bộ thử nghiệm mô-đun. Chọn một mô-đun ở menu trên khi các nhánh tính năng đã ghép.</p>",
    "<p class='fb-status fb-status--info'>Mọi dữ liệu ở đây là dữ liệu giả.</p>",
  ].join("");
  return { el, destroy() {} };
});

const router = createRouter({ root: document.getElementById("page-root"), routes,
  notFound: async ({ root }) => {
    const el = document.createElement("div");
    el.className = "fb-page";
    el.innerHTML = "<h1>Không tìm thấy trang thử</h1><p>Trang thử này chưa được đăng ký trong preview.</p>";
    return { el, destroy() {} };
  } });

window.__fbLab = { ctx, router };
router.start();
