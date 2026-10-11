import { test } from "node:test";
import assert from "node:assert/strict";
import { createAiApi } from "../api.js";

function fakeApi() {
  const calls = [];
  return {
    calls,
    async post(path, opts) { calls.push(["POST", path, opts]); return { ok: 1 }; },
    async get(path, opts) { calls.push(["GET", path, opts]); return { results: [] }; },
  };
}

test("ai api wrappers hit contract paths and carry idempotency key", async () => {
  const api = fakeApi();
  const ai = createAiApi({ api });
  await ai.status();
  await ai.refine({ text: "lời bộc phát", key: "ai-0001-abcdef01" });
  await ai.list();
  await ai.detail("11111111-1111-1111-1111-111111111111");
  await ai.accept("11111111-1111-1111-1111-111111111111");
  await ai.discard("11111111-1111-1111-1111-111111111111");

  assert.equal(api.calls[0][1], "/api/v1/ai/status");
  const [, refinePath, refineOpts] = api.calls[1];
  assert.equal(refinePath, "/api/v1/ai/refine");
  assert.equal(refineOpts.idempotencyKey, "ai-0001-abcdef01");
  assert.equal(refineOpts.body.purpose, "refine_expression");
  assert.equal(api.calls[2][1], "/api/v1/ai/suggestions");
  assert.match(api.calls[3][1], /suggestions\/11111111-1111-1111-1111-111111111111$/);
  assert.match(api.calls[4][1], /\/accept$/);
  assert.match(api.calls[5][1], /\/discard$/);
});

test("page modules export factories", async () => {
  const refine = await import("../pages/refine.js");
  assert.equal(typeof refine.createPage, "function");
});

test("suggestion text renders as text; notice states minimal payload", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../pages/refine.js", import.meta.url), "utf8");
  assert.match(source, /#ai-suggested"\)\.textContent = data\.suggested_text/);
  assert.match(source, /Chỉ câu bạn nhập/);
  assert.match(source, /Không gửi\s*\n?\s*lịch sử/);
  assert.doesNotMatch(source, /innerHTML\s*=\s*[^`]*\$\{/);
});
