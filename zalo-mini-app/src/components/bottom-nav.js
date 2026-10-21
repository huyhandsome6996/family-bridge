// createBottomNav — điều hướng chính (CONTRACTS.md mục 3).
// <nav class="fb-bottom-nav" aria-label="Điều hướng chính"> với items mặc định
// là NAV_ITEMS từ ../app/nav.js (router gọi createBottomNav không truyền items):
// Trang chủ / Đồng hành / Hộp thư / Nhật ký / Cá nhân.
//
// DISCREPANCY đã ghi nhận ở nav.js: Zalo DG khuyến nghị bottom bar ≤ 4 tab,
// đề bài chốt 5 mục — nav được tham số hoá `items` để hạ xuống 4 khi có quyết định.
//
// Stitch upgrade (2026-10): icon đổi sang Material Symbols local (icon.js)
// khớp prototype: home / explore / mark_email_unread / menu_book /
// account_circle. Mỗi item luôn kèm nhãn chữ nên svg aria-hidden. Vùng chạm
// ≥ 44px (min-height 56px, CSS). Item active: aria-current="page".
//
// Handoff Stitch 21/10 (SCREEN-MAP M06/M08): badge số chưa đọc đặt trên tab
// Hộp thư qua [data-nav-badge="mailbox"] — router chỉ mở badge khi CÓ số
// chưa đọc THẬT đã tải (hidden mặc định, không bao giờ bịa số).
import { h } from "../app/dom.js";
import { NAV_ITEMS } from "../app/nav.js";
import { createIcon } from "./icon.js";

// Map icon key của NAV_ITEMS -> Material Symbols name trong icon.js.
const NAV_ICONS = {
  home: "home",
  companion: "explore",
  mailbox: "mark_email_unread",
  diary: "menu_book",
  profile: "account_circle",
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

    const iconWrap = h("span", { class: "fb-bottom-nav__icon", "aria-hidden": "true" });
    iconWrap.appendChild(createIcon({ name: NAV_ICONS[item.icon] || "home", size: 24 }));

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
      iconWrap,
      h("span", { class: "fb-bottom-nav__label" }, item.label)
    );

    if (item.badge) {
      // Badge ẩn mặc định — router chỉ hiện khi số chưa đọc > 0 (dữ liệu thật).
      link.appendChild(
        h("span", {
          class: "fb-bottom-nav__badge",
          "data-nav-badge": item.badge,
          "aria-hidden": "true",
          hidden: true,
        })
      );
    }

    list.appendChild(h("li", { class: "fb-bottom-nav__entry" }, link));
  });

  nav.appendChild(list);
  return nav;
}
