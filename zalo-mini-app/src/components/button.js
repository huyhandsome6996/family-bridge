// createButton — nút chuẩn Family Bridge (CONTRACTS.md mục 3).
// Thuần hiển thị: hàm nhận options, trả về HTMLButtonElement qua h().
//
// A11y (contract): khi disabled PHẢI kèm lý do — caller tự gắn `title`
// lên phần tử trả về (btn.title = "Tính năng sắp có") hoặc đặt element
// .fb-btn__hint ngay bên cạnh nút.
import { h } from "../app/dom.js";

const VARIANTS = ["primary", "cta", "ghost", "danger"];
const SIZES = ["md", "lg"];
const TYPES = ["button", "submit", "reset"];

export function createButton(options = {}) {
  const {
    label,
    variant = "primary",
    size = "md",
    disabled = false,
    type = "button",
    onClick,
    ariaLabel,
  } = options;

  const safeVariant = VARIANTS.includes(variant) ? variant : "primary";
  const safeSize = SIZES.includes(size) ? size : "md";
  const safeType = TYPES.includes(type) ? type : "button";

  return h(
    "button",
    {
      class: `fb-btn fb-btn--${safeVariant} fb-btn--${safeSize}`,
      type: safeType,
      disabled: disabled ? true : null,
      "aria-label": ariaLabel || null,
      onclick: typeof onClick === "function" ? onClick : null,
    },
    label ?? ""
  );
}
