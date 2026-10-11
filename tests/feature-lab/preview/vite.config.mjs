import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

export default defineConfig({
  resolve: {
    alias: {
      family_bridge_mobile_core: path.join(repoRoot, "packages/family_bridge_mobile_core/index.js"),
      family_bridge_mobile: path.join(repoRoot, "packages/family_bridge_mobile"),
    },
  },
  server: { port: 5180, strictPort: false, host: "127.0.0.1" },
  build: { outDir: "dist-lab", emptyOutDir: true },
});
