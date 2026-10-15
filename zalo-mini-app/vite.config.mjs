import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

// __APP_VERSION__ — nhúng phiên bản package.json vào bundle (hiện ở sidebar
// shell + trang help). Chỉ đọc khi build; không phải biến môi trường secret.
function appVersion() {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  return { __APP_VERSION__: JSON.stringify(String(pkg.version || "0.0.0")) };
}

// Family Bridge dùng JS thuần (ES Modules), không React/zmp-ui.
// Zalo cho phép deploy "existing build" kèm app-config.json: plugin dưới
// sinh lại đúng manifest entry/CSS mà zmp-vite-plugin từng tạo, không pin
// plugin cũ đã lỗi thời.
function zaloManifest() {
  return {
    name: "family-bridge-zalo-manifest",
    generateBundle(_options, bundle) {
      const source = JSON.parse(readFileSync("app-config.json", "utf8"));
      const files = Object.values(bundle);
      this.emitFile({
        type: "asset",
        fileName: "app-config.json",
        source: JSON.stringify(
          {
            ...source,
            listCSS: files
              .filter((f) => f.type === "asset" && f.fileName.endsWith(".css"))
              .map((f) => f.fileName),
            listSyncJS: files
              .filter((f) => f.type === "chunk" && f.isEntry)
              .map((f) => f.fileName),
            listAsyncJS: files
              .filter((f) => f.type === "chunk" && !f.isEntry)
              .map((f) => f.fileName),
          },
          null,
          2,
        ),
      });
    },
  };
}

export default defineConfig({
  root: ".",
  base: "./",
  plugins: [zaloManifest()],
  define: appVersion(),
  build: {
    outDir: "www",
    assetsInlineLimit: 0,
    target: "es2020",
    cssTarget: "safari13.1",
    modulePreload: false,
    rollupOptions: {
      output: {
        entryFileNames: "assets/app.module.js",
        chunkFileNames: "assets/[name]-[hash].module.js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
