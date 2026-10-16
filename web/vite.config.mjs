import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

// __APP_VERSION__ — nhúng phiên bản package.json vào bundle (hiện ở sidebar
// shell + trang help). Mô phỏng đúng cách mini app định nghĩa (vite.config.mjs
// của zalo-mini-app); KHÔNG plugin zaloManifest — web không deploy lên Zalo.
function appVersion() {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  return { __APP_VERSION__: JSON.stringify(String(pkg.version || "0.0.0")) };
}

// Web độc lập (ADR-3, task 19-a): root `.`, base `./` (deploy tĩnh Render dưới
// sub-path cũng chạy), outDir `dist`, sourcemap OFF (SEC-19 — không lộ source
// map công khai), KHÔNG plugin Zalo.
export default defineConfig({
  root: ".",
  base: "./",
  define: appVersion(),
  build: {
    outDir: "dist",
    sourcemap: false,
    assetsInlineLimit: 0,
    target: "es2020",
    cssTarget: "safari13.1",
    modulePreload: false,
  },
});
