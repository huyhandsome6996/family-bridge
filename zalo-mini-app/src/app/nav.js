// Cấu hình điều hướng chính — 5 mục theo yêu cầu US-003.
// DISCREPANCY ghi nhận (báo cáo chính sách Task 2-a, mục 3.2): Zalo Design
// Guidelines khuyến nghị bottom bar ≤ 4 tab. Đề bài đợt này chốt 5 mục
// (Trang chủ / Đồng hành / Hộp thư / Nhật ký / Cá nhân) — giữ 5 mục, nav
// được tham số hóa để hạ xuống 4 nếu Huy/Antigravity quyết sau kiểm tra
// thiết bị thật. Ghi trong docs/handover/miniapp-foundation.

export const NAV_ITEMS = [
  { path: "/home", label: "Trang chủ", icon: "home" },
  { path: "/companion", label: "Đồng hành", icon: "companion" },
  { path: "/mailbox", label: "Hộp thư", icon: "mailbox", badge: "mailbox" },
  { path: "/diary", label: "Nhật ký", icon: "diary" },
  { path: "/profile", label: "Cá nhân", icon: "profile" },
];

// Handoff Stitch 21/10: shell Mini App là mobile một cột — không còn sidebar
// desktop. NAV_ITEMS_SIDEBAR chỉ còn là hằng tham chiếu lịch sử; KHÔNG dùng
// để dựng UI mới (app-shell mobile không render sidebar). Giữ export để không
// phá import cũ trong tests; xoá hẳn chỉ khi dẫn chiếu được toàn bộ caller.
export const NAV_ITEMS_SIDEBAR = NAV_ITEMS;
