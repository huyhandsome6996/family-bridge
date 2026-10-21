// createAppShell — khung Mini App mobile MỘT CỘT (320–430px) theo handoff
// Stitch 2026-10-21 (SCREEN-MAP.md, IMPLEMENTATION.md §1: "app-shell/shell.css
// hiện mang nhánh desktop là điểm cần xử lý tại MINI APP").
//
// - Bỏ hoàn toàn sidebar/topbar desktop (web/desktop không thuộc Mini App):
//   mỗi trang tự dựng top-bar (back + title) hoặc app-header (thương hiệu +
//   Trợ giúp + avatar) — tránh hai thanh tiêu đề trùng nhau trên host Zalo.
// - Shell chỉ còn: vùng nội dung cuộn dọc + chiều rộng mobile. Bottom-nav
//   (5 tab cấp một) do router gắn riêng khi page.showBottomNav = true.
// - Badge Hộp thư: router cập nhật [data-nav-badge] bằng số chưa đọc THẬT
//   đã tải (badge nằm trên tab Hộp thư của bottom-nav, không bịa số).
// - KHÔNG gọi network trong shell; KHÔNG chứa dữ liệu nhạy cảm.
import { h } from "../app/dom.js";

export function createAppShell({ children = [] } = {}) {
  const shell = h("div", { class: "fb-shell", dataset: { shell: "app" } });

  const content = h("main", { class: "fb-content", id: "fb-content" });
  for (const child of children) {
    if (child) content.appendChild(child);
  }
  shell.appendChild(content);

  return shell;
}
