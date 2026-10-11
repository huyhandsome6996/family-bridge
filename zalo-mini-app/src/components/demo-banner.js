// createDemoBanner — dải báo "dữ liệu minh họa" (CONTRACTS.md mục 3).
// Bắt buộc hiển thị trên mọi màn hình xem trước dùng fixture (page contract 3-b).
// role="status" để trình đọc màn hình thông báo ngữ cảnh demo.
import { h } from "../app/dom.js";

export function createDemoBanner() {
  return h(
    "div",
    { class: "fb-demo-banner", role: "status" },
    "Dữ liệu minh họa — chế độ xem trước"
  );
}
