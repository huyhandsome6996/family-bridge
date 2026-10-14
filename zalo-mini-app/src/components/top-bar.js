// createTopBar — thanh tiêu đề (CONTRACTS.md mục 3).
// Mặc định CHỈ tiêu đề + nút back bên TRÁI, không có gì góc phải (vùng menu
// Zalo) — hành vi cũ giữ nguyên, test design-system pin .fb-top-bar__right
// không tồn tại khi không truyền actions.
// Stitch upgrade: thêm slot `actions` TÙY CHỌN (mảng Node) — màn U34 dùng
// để đặt pill "Trợ giúp" bên trái vùng capsule Zalo như prototype (header
// prototype chừa pr-20 cho capsule). Không truyền actions => không render.
// Tiêu đề dùng <h1> của page — page không render <h1> khác để giữ thứ tự heading.
import { h } from "../app/dom.js";

// Markup tĩnh (không dữ liệu người dùng) — mũi tên trái.
const BACK_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m14.5 5.5-6.5 6.5 6.5 6.5"/></svg>';

export function createTopBar({ title, showBack = false, onBack, actions = null } = {}) {
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

  const innerChildren = [h("div", { class: "fb-top-bar__left" }, children)];

  if (Array.isArray(actions) && actions.length > 0) {
    // Slot phải TÙY CHỌN — chỉ render khi caller truyền rõ ràng.
    innerChildren.push(
      h("div", { class: "fb-top-bar__right fb-top-bar__right--actions" }, ...actions)
    );
  }

  return h("header", { class: "fb-top-bar" }, h("div", { class: "fb-top-bar__inner" }, innerChildren));
}
