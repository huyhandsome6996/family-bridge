import { readFileSync, existsSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
import { resolve } from "node:path";

const dir = resolve("www");
const config = JSON.parse(readFileSync(resolve(dir, "app-config.json"), "utf8"));
assert.equal(config.app.title, "Family Bridge");
assert.ok(config.listSyncJS.length > 0, "Mini App needs a JS entry");
assert.ok(config.listCSS.length > 0, "Mini App needs UI CSS");
for (const file of [...config.listCSS, ...config.listSyncJS, ...config.listAsyncJS]) {
  assert.ok(!file.startsWith("/") && !file.includes(".."), "Assets must use relative paths");
  assert.ok(existsSync(resolve(dir, file)), `Missing Mini App asset: ${file}`);
}
// Every emitted JS chunk must be uploaded, including dynamically loaded pages.
const listedJS = new Set([...config.listSyncJS, ...config.listAsyncJS]);
for (const file of readdirSync(resolve(dir, "assets"))) {
  if (file.endsWith(".js")) {
    assert.ok(listedJS.has(`assets/${file}`), `Unlisted Mini App JS chunk: assets/${file}`);
  }
}

// Build guard VITE_API_BASE_URL (port tối thiểu từ PR44 — handoff Stitch
// 21/10, VERIFICATION.md §B): production build PHẢI truyền origin API công
// khai; không cho phép bundle im lặng rỗng rồi rơi vào lỗi cấu hình lúc chạy.
const apiBase = process.env.VITE_API_BASE_URL || "";
assert.ok(
  /^https:\/\/[a-z0-9.-]+(:\d+)?\/?$/i.test(apiBase),
  "Build must run with VITE_API_BASE_URL set to the public backend origin (e.g. https://family-bridge-backend.onrender.com)",
);
const bundle = config.listSyncJS
  .map((f) => readFileSync(resolve(dir, f), "utf8"))
  .join("\n");
assert.ok(
  bundle.includes(apiBase.replace(/\/$/, "")),
  `Bundle must embed VITE_API_BASE_URL (${apiBase}) — refusing a build that silently loses the backend origin`,
);
console.log("Verified Zalo app-config, all referenced assets, and API base URL");
