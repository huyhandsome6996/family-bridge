import { readFileSync, existsSync } from "node:fs";
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
console.log("Verified Zalo app-config and all referenced assets");
