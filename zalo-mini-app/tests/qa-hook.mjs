// qa-hook.mjs — loader hook CHỈ dành cho các test QA (tests/qa-*.test.mjs).
// Được bật qua register(..., { data: { active: true } }) — file test khác
// (design-system/pages) không bao giờ đăng ký hook này nên không bị ảnh hưởng.
//
// Lý do tồn tại (phát hiện QA Task 4 — đã báo Lead):
//  1) src/core/config.js import "../../app-config.json" — Node thuần yêu cầu
//     import attribute `with { type: "json" }` (chỉ Vite xử lý giúp) → ERR.
//  2) src/core/config.js đọc `import.meta.env` (biến Vite) ở top-level và
//     trong getApiBaseUrl() → dưới Node thuần import.meta.env là undefined.
// Hook bọc JSON thành module JS và thay ĐÚNG CÂU `import.meta.env` bằng shim
// `globalThis.__FB_QA_ENV__` (được test đặt giá trị PROD:false, baseUrl rỗng —
// đúng hành vi dev/production không cấu hình). Toàn bộ logic
// isDemoModeRequested/isZaloHost/resolveAdapterMode giữ NGUYÊN VĂN.
//
// Lưu ý: hook chạy trên thread riêng (module.register) — cờ active phải truyền
// qua `data` của register(), KHÔNG đọc globalThis của thread chính ở đây.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let active = false;

export function initialize(data) {
  active = Boolean(data && data.active);
}

export async function load(url, context, nextLoad) {
  if (!active) {
    return nextLoad(url, context);
  }

  // (1) JSON → module JS (export default <nội dung JSON>)
  if (url.endsWith(".json")) {
    const source = readFileSync(fileURLToPath(url), "utf8");
    return {
      format: "module",
      source: "export default " + source + ";",
      shortCircuit: true,
    };
  }

  // (2) config.js: thay import.meta.env bằng shim môi trường test
  if (url.endsWith("/src/core/config.js")) {
    const result = await nextLoad(url, context);
    const source = String(result.source).replaceAll(
      "import.meta.env",
      "(globalThis.__FB_QA_ENV__)",
    );
    return { format: result.format, source, shortCircuit: true };
  }

  return nextLoad(url, context);
}
