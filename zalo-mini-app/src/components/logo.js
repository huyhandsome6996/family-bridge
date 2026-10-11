// createLogo — logo Family Bridge (CONTRACTS.md mục 3).
//
// ⚠️ PLACEHOLDER — CHỜ ASSET LOGO MẪU 03 ĐƯỢC DUYỆT (docs/design/brand-identity.md).
// KHÔNG coi đây là asset đã duyệt, KHÔNG dùng làm tài liệu thương mại chính thức.
// Cấu trúc: 2 bong bóng lời thoại — bong bóng lớn màu #C65B43 (--fb-primary),
// bong bóng nhỏ màu #E4AB56 (--fb-accent) giao nhau nhẹ; 3 chấm lời nhắn trang trí.
// Size: "sm" (28px) | "md" (40px) | "lg" (64px).
import { h } from "../app/dom.js";

const SIZES = ["sm", "md", "lg"];

// Markup SVG tĩnh (không có dữ liệu người dùng). Comment XML bên trong
// nhắc rõ đây là placeholder; khi asset mẫu 03 được duyệt, thay nguyên khối này.
const LOGO_SVG =
  '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" role="img" focusable="false">' +
  "<title>Family Bridge</title>" +
  "<!-- PLACEHOLDER chờ asset logo mẫu 03 được duyệt — brand-identity.md -->" +
  '<rect x="4" y="11" width="31" height="23" rx="8" fill="#C65B43"/>' +
  '<path d="M12 32.5V41l9.5-8.5Z" fill="#C65B43"/>' +
  '<circle cx="35" cy="16" r="9.5" fill="#E4AB56"/>' +
  '<circle cx="14" cy="22.5" r="1.8" fill="#FFF4E8"/>' +
  '<circle cx="20.5" cy="22.5" r="1.8" fill="#FFF4E8"/>' +
  '<circle cx="27" cy="22.5" r="1.8" fill="#FFF4E8"/>' +
  "</svg>";

export function createLogo({ size = "md" } = {}) {
  const safeSize = SIZES.includes(size) ? size : "md";
  const wrap = h("span", { class: `fb-logo fb-logo--${safeSize}` });
  wrap.innerHTML = LOGO_SVG; // chuỗi tĩnh trong file này
  return wrap;
}
