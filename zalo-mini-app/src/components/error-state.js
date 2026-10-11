// createErrorState — trạng thái lỗi (CONTRACTS.md mục 3).
// `.fb-error`, role="alert". Luôn có cách tiếp tục: nút "Thử lại" (nếu
// caller truyền onRetry) VÀ liên kết "Về trang chủ" (#/home — hash router,
// không cần import router). Không hiển thị mã lỗi kỹ thuật trong luồng người dùng.
import { h } from "../app/dom.js";

// Markup tĩnh (không dữ liệu người dùng) — biểu tượng cảnh báo.
const ERROR_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V13"/><path d="M12 16.5h.01"/></svg>';

export function createErrorState({
  title,
  description,
  retryLabel,
  onRetry,
} = {}) {
  const state = h("div", { class: "fb-error", role: "alert" });

  const icon = h("span", { class: "fb-error__icon", "aria-hidden": "true" });
  icon.innerHTML = ERROR_ICON; // chuỗi tĩnh trong file này
  state.appendChild(icon);

  if (title) state.appendChild(h("h2", { class: "fb-error__title" }, title));
  if (description) {
    state.appendChild(h("p", { class: "fb-error__description" }, description));
  }

  const actions = h("div", { class: "fb-error__actions" });

  if (typeof onRetry === "function") {
    actions.appendChild(
      h(
        "button",
        {
          class: "fb-btn fb-btn--primary fb-btn--md",
          type: "button",
          onclick: onRetry,
        },
        retryLabel || "Thử lại"
      )
    );
  }

  // Lối thoát luôn luôn có: về trang chủ qua hash (#/home).
  actions.appendChild(
    h("a", { class: "fb-btn fb-btn--ghost fb-btn--md", href: "#/home" }, "Về trang chủ")
  );

  state.appendChild(actions);
  return state;
}
