import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Zalo permits deployment of an existing build with app-config.json.
// Generate the same entry/CSS manifest without pinning an obsolete Vite plugin.
function zaloManifest() {
  return {
    name: "family-bridge-zalo-manifest",
    generateBundle(options, bundle) {
      const source = JSON.parse(readFileSync("app-config.json", "utf8"));
      const files = Object.values(bundle);
      this.emitFile({ type: "asset", fileName: "app-config.json", source: JSON.stringify({
        ...source,
        listCSS: files.filter(f => f.type === "asset" && f.fileName.endsWith(".css")).map(f => f.fileName),
        listSyncJS: files.filter(f => f.type === "chunk" && f.isEntry).map(f => f.fileName),
        listAsyncJS: files.filter(f => f.type === "chunk" && !f.isEntry && !f.isDynamicEntry).map(f => f.fileName),
      }, null, 2) });
    },
  };
}

export default defineConfig({
  root: ".",
  base: "./",
  plugins: [react(), zaloManifest()],
  build: {
    outDir: "www",
    assetsInlineLimit: 0,
    target: "es2015",
    cssTarget: "safari13.1",
    modulePreload: false,
    rolldownOptions: { output: {
      entryFileNames: "assets/[name].[hash].module.js",
      chunkFileNames: "assets/[name].[hash].module.js",
    } },
  },
});
