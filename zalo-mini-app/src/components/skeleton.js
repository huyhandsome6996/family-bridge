// createSkeleton — khối giữ kích thước khi tải (CONTRACTS.md mục 3).
// Variant: "line" | "card" | "circle"; count số khối (1–12).
// TĨNH, không shimmer: contract cấm animation ngoài transition 100–200ms
// transform/opacity. aria-hidden trên các khối; wrapper role="status" với
// nhãn "Đang tải nội dung" để trình đọc màn hình biết đang tải (chính sách
// Zalo: loading phải hiển thị rõ).
import { h } from "../app/dom.js";

const VARIANTS = ["line", "card", "circle"];

export function createSkeleton({ variant = "line", count = 1 } = {}) {
  const safeVariant = VARIANTS.includes(variant) ? variant : "line";
  const safeCount = Math.max(1, Math.min(12, Number(count) || 1));

  const group = h("div", {
    class: "fb-skeleton-group",
    role: "status",
    "aria-label": "Đang tải nội dung, vui lòng chờ trong giây lát.",
  });

  for (let i = 0; i < safeCount; i += 1) {
    group.appendChild(
      h("div", {
        class: `fb-skeleton fb-skeleton--${safeVariant}`,
        "aria-hidden": "true",
      })
    );
  }

  return group;
}
