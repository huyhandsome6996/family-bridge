import { test } from "node:test";
import assert from "node:assert/strict";
import { createHelpApi } from "../api.js";

function fakeApi() {
  const calls = [];
  return {
    calls,
    async get(path, opts) { calls.push(["GET", path, opts]); return { contacts: [] }; },
  };
}

test("help api hits the single public directory path", async () => {
  const api = fakeApi();
  const help = createHelpApi({ api });
  await help.directory();
  assert.equal(api.calls[0][0], "GET");
  assert.equal(api.calls[0][1], "/api/v1/help/directory");
});

test("page modules export factories", async () => {
  const help = await import("../pages/help.js");
  assert.equal(typeof help.createPage, "function");
});

test("call happens only on user tap; expired numbers never shown; no gates", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../pages/help.js", import.meta.url), "utf8");
  // openPhone is invoked INSIDE the click listener only
  assert.match(source, /addEventListener\("click"[\s\S]{0,200}openPhone/);
  assert.match(source, /contact\.phone && contact\.status === "verified"/);
  assert.match(source, /Luôn mở/);
  assert.match(source, /Hết hạn xác minh/);
  assert.match(source, /Không mở được trình gọi/);
  assert.match(source, /Đã mở trình gọi của điện thoại/);
  assert.doesNotMatch(source, /innerHTML\s*=\s*[^`]*\$\{/);
});
