// createSheet — bottom sheet (CONTRACTS.md mục 3).
//
// Cách dùng (page 3-b): gọi hàm = MỞ sheet ngay. Root tự gắn vào document.body
// (diễn giải contract "focus vào sheet khi mở"); KHÔNG cần append thủ công.
//   const sheet = createSheet({ title, content, actions, onClose });
//   sheet.close(); // đóng chủ động
// Đóng (qua nút X, backdrop, Esc hoặc close()) = REMOVE KHỎI DOM + trả focus
// về phần tử đang focus trước khi mở.
//
// A11y: role="dialog", aria-modal="true", aria-labelledby trỏ tới tiêu đề.
import { h } from "../app/dom.js";

let uidCounter = 0;

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
const BTN_VARIANTS = ["primary", "cta", "ghost", "danger"];

// Markup tĩnh (không chứa dữ liệu người dùng) — an toàn khi gán innerHTML.
const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18"/></svg>';

function appendContent(parent, content) {
  if (content instanceof Node) {
    parent.appendChild(content);
  } else if (Array.isArray(content)) {
    content.forEach((c) => appendContent(parent, c));
  } else if (content !== null && content !== undefined && content !== false && content !== "") {
    parent.appendChild(document.createTextNode(String(content)));
  }
}

export function createSheet({ title, content, actions = [], onClose } = {}) {
  const titleId = `fb-sheet-title-${++uidCounter}`;
  // Người gọi đang focus ở đâu — trả lại sau khi đóng (contract mục 3).
  const restoreFocus = document.activeElement;
  const actionList = Array.isArray(actions) ? actions : [];

  const closeButton = h("button", {
    class: "fb-sheet__close",
    type: "button",
    "aria-label": "Đóng",
    onclick: () => close(),
  });
  closeButton.innerHTML = CLOSE_ICON; // chuỗi tĩnh trong file này

  const panel = h(
    "div",
    {
      class: "fb-sheet",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": titleId,
      tabindex: "-1",
    },
    h(
      "header",
      { class: "fb-sheet__header" },
      h("h2", { class: "fb-sheet__title", id: titleId }, title),
      closeButton
    )
  );

  const body = h("div", { class: "fb-sheet__body" });
  appendContent(body, content);
  panel.appendChild(body);

  if (actionList.length > 0) {
    const footer = h("footer", { class: "fb-sheet__actions" });
    actionList.forEach((action) => {
      if (!action || !action.label) return;
      const variant = BTN_VARIANTS.includes(action.variant) ? action.variant : "primary";
      footer.appendChild(
        h(
          "button",
          {
            class: `fb-btn fb-btn--${variant}`,
            type: "button",
            onclick: () => {
              if (typeof action.onClick === "function") action.onClick();
              close();
            },
          },
          action.label
        )
      );
    });
    panel.appendChild(footer);
  }

  const root = h(
    "div",
    { class: "fb-sheet-root" },
    h("div", { class: "fb-overlay", onclick: () => close() }),
    panel
  );

  function onKeydown(event) {
    if (event && event.key === "Escape") {
      if (typeof event.preventDefault === "function") event.preventDefault();
      close();
    }
  }

  function close() {
    if (!root.isConnected) return; // đã đóng — chống gọi lặp
    root.remove();
    document.removeEventListener("keydown", onKeydown);
    if (restoreFocus && restoreFocus.isConnected) {
      restoreFocus.focus();
    }
    if (typeof onClose === "function") onClose();
  }

  root.close = close;

  // Mở: gắn vào body, focus phần tử focusable đầu (fallback: chính panel),
  // lắng nghe Esc ở mức document.
  document.body.appendChild(root);
  const firstFocusable = panel.querySelector(FOCUSABLE) || panel;
  firstFocusable.focus();
  document.addEventListener("keydown", onKeydown);

  return root;
}
