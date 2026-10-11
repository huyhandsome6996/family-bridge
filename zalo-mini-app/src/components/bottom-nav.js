// createBottomNav — điều hướng chính (CONTRACTS.md mục 3).
// <nav class="fb-bottom-nav" aria-label="Điều hướng chính"> với items mặc định
// là NAV_ITEMS từ ../app/nav.js (router gọi createBottomNav không truyền items):
// Trang chủ / Đồng hành / Hộp thư / Nhật ký / Cá nhân.
//
// DISCREPANCY đã ghi nhận ở nav.js: Zalo DG khuyến nghị bottom bar ≤ 4 tab,
// đề bài chốt 5 mục — nav được tham số hoá `items` để hạ xuống 4 khi có quyết định.
//
// Item active: aria-current="page". Icon SVG inline tĩnh, viewBox 24,
// stroke-based, có <title> tiếng Việt (contract), svg aria-hidden vì mỗi item
// luôn kèm nhãn chữ hiển thị. Vùng chạm ≥ 44px (min-height 56px, CSS).
import { h } from "../app/dom.js";
import { NAV_ITEMS } from "../app/nav.js";

// Markup icon tĩnh — cố định trong file, không nhận dữ liệu người dùng.
const ICONS = {
  home:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><title>Trang chủ</title><path d="M4 11.2 12 4.5l8 6.7"/><path d="M6.2 9.8V19a1 1 0 0 0 1 1h9.6a1 1 0 0 0 1-1V9.8"/></svg>',
  companion:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><title>Đồng hành</title><path d="M12 20.5C7.2 16.8 3.5 13.4 3.5 9.7 3.5 7.1 5.5 5 8 5c1.6 0 3.1.9 4 2.3C12.9 5.9 14.4 5 16 5c2.5 0 4.5 2.1 4.5 4.7 0 3.7-3.7 7.1-8.5 10.8Z"/></svg>',
  mailbox:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><title>Hộp thư</title><rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m4.5 7.5 7.5 5.5 7.5-5.5"/></svg>',
  diary:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><title>Nhật ký</title><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></svg>',
  profile:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><title>Cá nhân</title><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.9-3.4 3.7-5.5 7-5.5s6.1 2.1 7 5.5"/></svg>',
};

export function createBottomNav({ items = NAV_ITEMS, active = "", onNavigate } = {}) {
  const nav = h("nav", {
    class: "fb-bottom-nav",
    "aria-label": "Điều hướng chính",
  });
  const list = h("ul", { class: "fb-bottom-nav__list" });

  const safeItems = Array.isArray(items) && items.length > 0 ? items : NAV_ITEMS;

  safeItems.forEach((item) => {
    const isActive = item.path === active;

    const icon = h("span", { class: "fb-bottom-nav__icon", "aria-hidden": "true" });
    icon.innerHTML = ICONS[item.icon] || ICONS.home; // chuỗi tĩnh từ ICONS ở trên

    const link = h(
      "a",
      {
        class: `fb-bottom-nav__item${isActive ? " fb-bottom-nav__item--active" : ""}`,
        href: `#${item.path}`,
        "aria-current": isActive ? "page" : null,
        onclick:
          typeof onNavigate === "function"
            ? (event) => {
                event.preventDefault(); // router (onNavigate) lo chuyển trang
                onNavigate(item.path);
              }
            : null, // không có onNavigate: anchor #/path tự hoạt động với hash router
      },
      icon,
      h("span", { class: "fb-bottom-nav__label" }, item.label)
    );

    list.appendChild(h("li", { class: "fb-bottom-nav__entry" }, link));
  });

  nav.appendChild(list);
  return nav;
}
