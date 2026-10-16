// DOM helpers thuần (không framework). Mọi component/page dùng chung.
// Quy tắc bảo mật (SEC-12): text người dùng/AI LUÔN render qua textContent,
// không bao giờ gắn chuỗi chưa escape vào innerHTML.

/**
 * Tạo element: h("button", { class: "fb-btn", onclick: fn }, "Nhãn")
 * - attr là thuộc tính chuẩn (class, id, type, href, aria-*, data-*...)
 * - on* được gắn làm event listener.
 * - children: string (textContent an toàn) | Node | null/undefined | array.
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "dataset") {
      Object.assign(el.dataset, value);
    } else if (value === true) {
      el.setAttribute(key, "");
    } else {
      el.setAttribute(key, String(value));
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) {
      append(el, child);
    } else if (child instanceof Node) {
      el.appendChild(child);
    } else {
      el.appendChild(document.createTextNode(String(child)));
    }
  }
}

/** Escape chuỗi khi bắt buộc phải dùng innerHTML (tránh XSS). Ưu tiên h(). */
export function esc(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

/** Xóa toàn bộ con của một element. */
export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** Truy vấn text hiển thị của element để test. */
export function text(el) {
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}
