// createStatusBadge — nhãn trạng thái (CONTRACTS.md mục 3).
// `<span class="fb-badge fb-badge--{tone}">` — text-based, KHÔNG dùng chấm
// màu kiểu cảm xúc học sinh. Icon tuỳ chọn: Node (caller tự tạo) hoặc tên
// icon tĩnh ("success" | "warning" | "error" | "info" | "neutral").
// Icon chỉ mang tính minh hoạ, luôn aria-hidden vì nhãn chữ đã mô tả.
import { h } from "../app/dom.js";

const TONES = ["success", "warning", "error", "info", "neutral"];

// Bộ icon tĩnh stroke-based, viewBox 24 — markup cố định trong file,
// không nhận dữ liệu người dùng nên gán qua innerHTML là an toàn.
const ICONS = {
  success:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  warning:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 4 2.8 19.5h18.4Z"/><path d="M12 10v4.5"/><path d="M12 17.5h.01"/></svg>',
  error:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.5"/><path d="m9 9 6 6M15 9l-6 6"/></svg>',
  info:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><path d="M12 7.5h.01"/></svg>',
  neutral:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 12h12"/></svg>',
};

export function createStatusBadge({ tone = "neutral", label, icon } = {}) {
  const safeTone = TONES.includes(tone) ? tone : "neutral";
  const badge = h("span", { class: `fb-badge fb-badge--${safeTone}` });

  if (icon instanceof Node) {
    const wrap = h("span", { class: "fb-badge__icon", "aria-hidden": "true" });
    wrap.appendChild(icon);
    badge.appendChild(wrap);
  } else if (typeof icon === "string" && ICONS[icon]) {
    const wrap = h("span", { class: "fb-badge__icon", "aria-hidden": "true" });
    wrap.innerHTML = ICONS[icon]; // chuỗi tĩnh từ ICONS ở trên
    badge.appendChild(wrap);
  }

  // Nhãn luôn qua text node — an toàn XSS, giữ nguyên dấu tiếng Việt.
  badge.appendChild(document.createTextNode(label ?? ""));
  return badge;
}
