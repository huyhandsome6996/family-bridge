// createDialog — dialog trung tâm (CONTRACTS.md mục 3).
//
// Cách dùng (page 3-b): gọi hàm = MỞ dialog ngay (root tự gắn vào document.body).
//   const dialog = createDialog({ title, message, actions, onClose });
//   dialog.close();
//
// A11y:
// - Có action variant "danger" → role="alertdialog" + coi là DESTRUCTIVE:
//   Esc và backdrop click KHÔNG đóng (người dùng phải chọn rõ một action).
// - Không danger → role="dialog", Esc/backdrop đóng.
// - Focus vào action đầu tiên khi mở; Tab/Shift+Tab xoay vòng trong dialog
//   (focus trap tối thiểu); đóng = remove khỏi DOM + trả focus về caller.
import { h } from "../app/dom.js";

let uidCounter = 0;

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
const BTN_VARIANTS = ["primary", "cta", "ghost", "danger"];

export function createDialog({ title, message, actions = [], onClose } = {}) {
  const titleId = `fb-dialog-title-${++uidCounter}`;
  const messageId = `fb-dialog-message-${uidCounter}`;
  const restoreFocus = document.activeElement;
  const actionList = (Array.isArray(actions) ? actions : []).filter(
    (a) => a && a.label
  );
  const destructive = actionList.some((a) => a.variant === "danger");

  const panel = h(
    "div",
    {
      class: `fb-dialog${destructive ? " fb-dialog--destructive" : ""}`,
      role: destructive ? "alertdialog" : "dialog",
      "aria-modal": "true",
      "aria-labelledby": titleId,
      "aria-describedby": messageId,
      tabindex: "-1",
    },
    h("h2", { class: "fb-dialog__title", id: titleId }, title),
    h("p", { class: "fb-dialog__message", id: messageId }, message ?? "")
  );

  if (actionList.length > 0) {
    const footer = h("div", { class: "fb-dialog__actions" });
    actionList.forEach((action) => {
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
    { class: "fb-dialog-root" },
    // Backdrop chỉ đóng khi KHÔNG destructive (contract: destructive phải chọn rõ)
    h("div", { class: "fb-overlay", onclick: destructive ? null : () => close() }),
    panel
  );

  function focusableElements() {
    return Array.from(panel.querySelectorAll(FOCUSABLE));
  }

  function onKeydown(event) {
    if (!event) return;
    if (event.key === "Escape" && !destructive) {
      if (typeof event.preventDefault === "function") event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;

    const items = focusableElements();
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const current = document.activeElement;

    if (!panel.contains(current)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && current === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && current === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function close() {
    if (!root.isConnected) return;
    root.remove();
    document.removeEventListener("keydown", onKeydown);
    if (restoreFocus && restoreFocus.isConnected) {
      restoreFocus.focus();
    }
    if (typeof onClose === "function") onClose();
  }

  root.close = close;

  document.body.appendChild(root);
  const first = focusableElements()[0] || panel;
  first.focus();
  document.addEventListener("keydown", onKeydown);

  return root;
}
