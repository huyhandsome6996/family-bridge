// createTextarea — trường nhập nhiều dòng (CONTRACTS.md mục 3).
// Cấu trúc và tiện ích giống createInput (.fb-field + .fb-textarea),
// giữ nguyên nội dung khi hiển thị lỗi.
import { h } from "../app/dom.js";

let uidCounter = 0;

export function createTextarea({
  id,
  label,
  hint,
  error,
  value = "",
  maxlength,
  rows = 4,
  onInput,
} = {}) {
  const fieldId = id || `fb-textarea-${++uidCounter}`;
  const hintId = hint ? `${fieldId}-hint` : null;
  const errorId = `${fieldId}-error`;

  const textarea = h(
    "textarea",
    {
      class: "fb-textarea",
      id: fieldId,
      rows: String(rows > 0 ? rows : 4),
      maxlength: maxlength !== null && maxlength !== undefined ? String(maxlength) : null,
      "aria-invalid": error ? "true" : null,
      "aria-describedby": [hintId, error ? errorId : null].filter(Boolean).join(" ") || null,
      oninput: typeof onInput === "function" ? onInput : null,
    },
    value ?? ""
  );

  const field = h(
    "div",
    { class: `fb-field${error ? " fb-field--error" : ""}` },
    h("label", { class: "fb-field__label", for: fieldId }, label),
    textarea,
    hint ? h("p", { class: "fb-field__hint", id: hintId }, hint) : null,
    error ? h("p", { class: "fb-field__error", id: errorId }, error) : null
  );

  field.setError = (message) => {
    let errorEl = field.querySelector(".fb-field__error");
    if (message) {
      if (!errorEl) {
        errorEl = h("p", { class: "fb-field__error", id: errorId });
        field.appendChild(errorEl);
      }
      errorEl.textContent = String(message);
      textarea.setAttribute("aria-invalid", "true");
      textarea.setAttribute(
        "aria-describedby",
        [hintId, errorId].filter(Boolean).join(" ")
      );
      field.classList.add("fb-field--error");
    } else {
      if (errorEl) errorEl.remove();
      textarea.removeAttribute("aria-invalid");
      if (hintId) textarea.setAttribute("aria-describedby", hintId);
      else textarea.removeAttribute("aria-describedby");
      field.classList.remove("fb-field--error");
    }
  };

  field.input = textarea;
  return field;
}
