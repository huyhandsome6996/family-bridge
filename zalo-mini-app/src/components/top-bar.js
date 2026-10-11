// createTopBar — thanh tiêu đề (CONTRACTS.md mục 3).
// CHỈ tiêu đề + nút back bên TRÁI. KHÔNG đặt nút nào góc phải — đó là vùng
// menu Zalo (chính sách Zalo Mini App Design Guidelines, Task 2-a).
// Tiêu đề dùng <h1> của page — page không render <h1> khác để giữ thứ tự heading.
import { h } from "../app/dom.js";

// Markup tĩnh (không dữ liệu người dùng) — mũi tên trái.
const BACK_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m14.5 5.5-6.5 6.5 6.5 6.5"/></svg>';

export function createTopBar({ title, showBack = false, onBack } = {}) {
  const children = [];

  if (showBack) {
    const backIcon = h("span", { class: "fb-top-bar__back-icon", "aria-hidden": "true" });
    backIcon.innerHTML = BACK_ICON; // chuỗi tĩnh trong file này

    children.push(
      h(
        "button",
        {
          class: "fb-top-bar__back",
          type: "button",
          "aria-label": "Quay lại",
          onclick:
            typeof onBack === "function"
              ? onBack
              : () => window.history.back(), // mặc định: back lịch sử webview
        },
        backIcon
      )
    );
  }

  children.push(h("h1", { class: "fb-top-bar__title" }, title));

  return h("header", { class: "fb-top-bar" }, h("div", { class: "fb-top-bar__inner" }, children));
}
