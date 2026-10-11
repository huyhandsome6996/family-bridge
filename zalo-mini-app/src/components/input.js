// createInput — trường nhập một dòng (CONTRACTS.md mục 3).
// Trả về wrapper <div class="fb-field"> chứa label (luôn hiển thị) + input
// + hint/error gần trường. Khi có lỗi, GIỮ NGUYÊN nội dung người dùng nhập.
//
// Tiện ích gắn thêm (bổ sung, không phá contract):
//   field.input            — tham chiếu phần tử <input>
//   field.setError(msg)    — cập nhật/xoá lỗi mà không cần render lại field
import { h } from "../app/dom.js";

let uidCounter = 0;

export function createInput({
  id,
  label,
  hint,
  error,
  value = "",
  placeholder,
  required = false,
  maxlength,
  onInput,
} = {}) {
  const fieldId = id || `fb-input-${++uidCounter}`;
  const hintId = hint ? `${fieldId}-hint` : null;
  const errorId = `${fieldId}-error`;

  const input = h("input", {
    class: "fb-input",
    id: fieldId,
    type: "text",
    value: value || null,
    placeholder: placeholder || null,
    required: required ? true : null,
    "aria-required": required ? "true" : null,
    maxlength: maxlength !== null && maxlength !== undefined ? String(maxlength) : null,
    "aria-invalid": error ? "true" : null,
    "aria-describedby": [hintId, error ? errorId : null].filter(Boolean).join(" ") || null,
    oninput: typeof onInput === "function" ? onInput : null,
  });

  const field = h(
    "div",
    { class: `fb-field${error ? " fb-field--error" : ""}` },
    h("label", { class: "fb-field__label", for: fieldId }, label),
    input,
    hint ? h("p", { class: "fb-field__hint", id: hintId }, hint) : null,
    error ? h("p", { class: "fb-field__error", id: errorId }, error) : null
  );

  // Cập nhật trạng thái lỗi động (message = string | null).
  field.setError = (message) => {
    let errorEl = field.querySelector(".fb-field__error");
    if (message) {
      if (!errorEl) {
        errorEl = h("p", { class: "fb-field__error", id: errorId });
        field.appendChild(errorEl);
      }
      errorEl.textContent = String(message); // textContent — an toàn XSS
      input.setAttribute("aria-invalid", "true");
      input.setAttribute(
        "aria-describedby",
        [hintId, errorId].filter(Boolean).join(" ")
      );
      field.classList.add("fb-field--error");
    } else {
      if (errorEl) errorEl.remove();
      input.removeAttribute("aria-invalid");
      if (hintId) input.setAttribute("aria-describedby", hintId);
      else input.removeAttribute("aria-describedby");
      field.classList.remove("fb-field--error");
    }
  };

  field.input = input;
  return field;
}
