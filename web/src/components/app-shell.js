// createAppShell — khung web desktop (Stitch w05/w08–w16): sidebar 240px +
// topbar. Bọc PAGE CONTENT do router truyền (children); KHÔNG gọi network —
// badge Hộp thư do router cập nhật bằng dữ liệu thật đã tải (data-nav-badge).
//
// - Sidebar 6 mục từ NAV_ITEMS_SIDEBAR (../app/nav.js): active theo
//   aria-current="page"; ẩn <1024px bằng CSS (shell.css), bottom-nav đảm nhiệm.
// - Footer sidebar: thẻ "Hỗ trợ khẩn cấp" → #/help (help luôn truy cập được).
// - Topbar: logo mark (asset local, h-32px) + "Family Bridge" + 3 liên kết
//   (ẩn <xl bằng CSS) + CTA "Tìm trợ giúp" + user chip (tên hoặc fallback).
// - Version từ __APP_VERSION__ (Vite define từ package.json).
import { h } from "../app/dom.js";
import { NAV_ITEMS_SIDEBAR } from "../app/nav.js";
import { createIcon } from "./icon.js";
import { createLogo } from "./logo.js";

// __APP_VERSION__ được Vite define khi build (package.json version). Ngoài
// Vite (node:test) biến không tồn tại — typeof guard trả fallback an toàn.
const APP_VERSION = typeof __APP_VERSION__ === "string" && __APP_VERSION__
  ? __APP_VERSION__
  : "0.3.0";

const SIDEBAR_ICONS = {
  cottage: "cottage",
  diversity_1: "diversity_1",
  mail: "mail",
  auto_stories: "auto_stories",
  group: "group",
  shield_person: "shield_person",
};

export function createAppShell({ activePath = "/", profile = null, children = [] } = {}) {
  const shell = h("div", { class: "fb-shell", dataset: { shell: "app" } });

  // ------------------------------ Sidebar ------------------------------
  const sidebar = h("aside", { class: "fb-sidebar", "aria-label": "Điều hướng chính web" });

  const brandRow = h("div", { class: "fb-sidebar__brand" });
  brandRow.appendChild(
    h("span", { class: "fb-sidebar__brand-badge" }, "Riêng tư & An toàn"),
  );
  brandRow.appendChild(h("span", { class: "fb-sidebar__version" }, `v${APP_VERSION}`));
  sidebar.appendChild(brandRow);

  const nav = h("nav", { class: "fb-sidebar__nav" });
  const list = h("ul", { class: "fb-sidebar__list" });
  NAV_ITEMS_SIDEBAR.forEach((item) => {
    const isActive = item.path === activePath;
    const link = h("a", {
      class: `fb-sidebar__item${isActive ? " fb-sidebar__item--active" : ""}`,
      href: `#${item.path}`,
      "aria-current": isActive ? "page" : null,
    });
    const iconWrap = h("span", { class: "fb-sidebar__icon", "aria-hidden": "true" });
    iconWrap.appendChild(createIcon({ name: SIDEBAR_ICONS[item.icon] || "home", size: 22 }));
    link.appendChild(iconWrap);
    link.appendChild(h("span", { class: "fb-sidebar__label" }, item.label));
    if (item.badge) {
      // Badge ẩn mặc định — router chỉ mở khi CÓ số chưa đọc thật (>0).
      link.appendChild(h("span", {
        class: "fb-sidebar__badge",
        "data-nav-badge": item.badge,
        hidden: true,
      }));
    }
    list.appendChild(h("li", {}, link));
  });
  nav.appendChild(list);
  sidebar.appendChild(nav);

  const supportCard = h("div", { class: "fb-sidebar__support" });
  supportCard.appendChild(
    h("div", { class: "fb-sidebar__support-head" },
      createIcon({ name: "emergency", size: 20, className: "fb-sidebar__support-icon" }),
      h("span", { class: "fb-sidebar__support-title" }, "Hỗ trợ khẩn cấp"),
    ),
  );
  supportCard.appendChild(
    h("p", { class: "fb-sidebar__support-text" },
      "Khi bạn cần trợ giúp tức thì về tinh thần hoặc an toàn."),
  );
  supportCard.appendChild(
    h("a", { class: "fb-sidebar__support-btn", href: "#/help" }, "Tìm trợ giúp ngay"),
  );
  sidebar.appendChild(supportCard);

  const versionLabel = h("p", { class: "fb-sidebar__version-note" },
    `Family Bridge • Phiên bản ${APP_VERSION}`);
  sidebar.appendChild(versionLabel);

  shell.appendChild(sidebar);

  // ---------------------------- Main + topbar ----------------------------
  const main = h("div", { class: "fb-main" });

  const topbar = h("header", { class: "fb-topbar" });
  const topbarInner = h("div", { class: "fb-topbar__inner" });

  const brand = h("a", { class: "fb-topbar__brand", href: "#/home" });
  brand.appendChild(createLogo({ size: "sm" }));
  brand.appendChild(h("span", { class: "fb-topbar__app-name" }, "Family Bridge"));
  topbarInner.appendChild(brand);

  const links = h("nav", { class: "fb-topbar__links", "aria-label": "Liên kết giới thiệu" });
  [
    { href: "#/welcome", label: "Giới thiệu" },
    { href: "#/how-to-use", label: "Cách sử dụng" },
    { href: "#/help", label: "Tìm trợ giúp" },
  ].forEach(({ href, label }) => {
    links.appendChild(h("a", { class: "fb-topbar__link", href }, label));
  });
  topbarInner.appendChild(links);

  const actions = h("div", { class: "fb-topbar__actions" });
  actions.appendChild(
    h("a", { class: "fb-btn fb-btn--primary fb-topbar__cta", href: "#/help" }, "Tìm trợ giúp"),
  );
  const chip = h("div", { class: "fb-topbar__user", title: "Tài khoản của bạn" });
  const name = profile && profile.displayName ? String(profile.displayName) : "Thành viên Family Bridge";
  chip.appendChild(
    h("span", { class: "fb-topbar__avatar", "aria-hidden": "true" },
      (name.trim().charAt(0) || "•").toUpperCase()),
  );
  chip.appendChild(h("span", { class: "fb-topbar__user-name" }, name));
  actions.appendChild(chip);
  topbarInner.appendChild(actions);
  topbar.appendChild(topbarInner);
  main.appendChild(topbar);

  const content = h("main", { class: "fb-content", id: "fb-content" });
  for (const child of children) {
    if (child) content.appendChild(child);
  }
  main.appendChild(content);
  shell.appendChild(main);

  return shell;
}
