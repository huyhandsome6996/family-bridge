// createLogo — logo chính chủ Family Bridge (mẫu 03).
//
// Nguồn asset: docs/design/assets/family-bridge-logo-reference.png
// (bảng concept do chủ dự án cung cấp). Derivative được tách DETERMINISTIC
// bằng scripts/extract_logo_assets.py (projection theo pixel + threshold
// nền), tọa độ + hash ghi trong docs/design/stitch-ui-upgrade/asset-manifest.json.
// Ảnh giữ nguyên màu gốc rust/amber/nâu — ngoại lệ được user yêu cầu so với
// logo prototype Stitch (PROMPT §4); không vẽ lại, không đổi hue.
//
// Size: "sm" (28px) | "md" (40px) | "lg" (64px). API giữ tương thích cũ
// (createLogo({size})); cấu trúc bên trong đổi từ SVG placeholder sang
// <img> thật (test design-system đã cập nhật theo đúng PROMPT §4).
import { h } from "../app/dom.js";
import logoMarkUrl from "../assets/logo/logo-mark-transparent.png";

const SIZES = ["sm", "md", "lg"];

export function createLogo({ size = "md", variant = "mark" } = {}) {
  const safeSize = SIZES.includes(size) ? size : "md";
  const wrap = h("span", { class: `fb-logo fb-logo--${safeSize}` });
  wrap.appendChild(
    h("img", {
      src: logoMarkUrl, // Vite đóng gói vào build + manifest
      alt: "Family Bridge",
      width: "40",
      height: "40",
      loading: "eager",
      decoding: "async",
    })
  );
  return wrap;
}
