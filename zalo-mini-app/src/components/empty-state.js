// createEmptyState — trạng thái trống (CONTRACTS.md mục 3).
// `.fb-empty` với title + description (nêu bước tiếp theo) + action tuỳ chọn
// dạng { label, onClick } hoặc null. Icon trang trí, aria-hidden.
import { h } from "../app/dom.js";

// Markup tĩnh (không dữ liệu người dùng) — bong bóng lời thoại rỗng.
const EMPTY_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H12l-4 4v-4H6.5A2.5 2.5 0 0 1 4 14.5Z"/></svg>';

export function createEmptyState({ title, description, action } = {}) {
  const state = h("div", { class: "fb-empty" });

  const icon = h("span", { class: "fb-empty__icon", "aria-hidden": "true" });
  icon.innerHTML = EMPTY_ICON; // chuỗi tĩnh trong file này
  state.appendChild(icon);

  if (title) state.appendChild(h("h2", { class: "fb-empty__title" }, title));
  if (description) {
    state.appendChild(h("p", { class: "fb-empty__description" }, description));
  }

  if (action && action.label) {
    state.appendChild(
      h(
        "button",
        {
          class: "fb-btn fb-btn--ghost fb-btn--md",
          type: "button",
          onclick: typeof action.onClick === "function" ? action.onClick : null,
        },
        action.label
      )
    );
  }

  return state;
}
