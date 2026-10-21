import { readFileSync, existsSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { requireApiBaseUrl } from "./build-config.mjs";

const dir = resolve("www");
const info = JSON.parse(readFileSync(resolve(dir, "build-info.json"), "utf8"));
const apiBaseUrl = requireApiBaseUrl(info.apiBaseUrl);
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
assert.ok([...listedJS].some(file => readFileSync(resolve(dir, file), "utf8").includes(apiBaseUrl)),
  "Mini App bundle is missing the configured backend origin");
for (const file of readdirSync(resolve(dir, "assets"))) {
  if (file.endsWith(".js")) {
    assert.ok(listedJS.has(`assets/${file}`), `Unlisted Mini App JS chunk: assets/${file}`);
  }
}
console.log("Verified Zalo app-config and all referenced assets");
