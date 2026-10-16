// F04 node tests: api wrappers hit contract paths (with input_revision per
// contract v1); page modules export factories; the page reads suggested_text
// (never refined_text), renders via textContent and implements the C4 stale
// guard. Full DOM interaction is covered by the preview shell manually
// (node has no DOM here; UI rules evidence is manual-review).

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
  await ai.refine({ text: "lời bộc phát", key: "ai-0001-abcdef01", inputRevision: 3 });
  await ai.list();
  await ai.detail("11111111-1111-1111-1111-111111111111");
  await ai.accept("11111111-1111-1111-1111-111111111111");
  await ai.discard("11111111-1111-1111-1111-111111111111");

  assert.equal(api.calls[0][1], "/api/v1/ai/status");
  const [, refinePath, refineOpts] = api.calls[1];
  assert.equal(refinePath, "/api/v1/ai/refine");
  assert.equal(refineOpts.idempotencyKey, "ai-0001-abcdef01");
  assert.equal(refineOpts.body.purpose, "refine_expression");
  // Hợp đồng v1 (C4): input_revision đi cùng request khi client có revision.
  assert.equal(refineOpts.body.input_revision, 3);
  assert.equal(api.calls[2][1], "/api/v1/ai/suggestions");
  assert.match(api.calls[3][1], /suggestions\/11111111-1111-1111-1111-111111111111$/);
  assert.match(api.calls[4][1], /\/accept$/);
  assert.match(api.calls[5][1], /\/discard$/);
});

test("refine without inputRevision omits the optional field", async () => {
  const api = fakeApi();
  const ai = createAiApi({ api });
  await ai.refine({ text: "lời bộc phát", key: "ai-0002-abcdef02" });
  assert.equal(api.calls[0][2].body.input_revision, undefined);
  assert.equal(api.calls[0][2].body.original_text, "lời bộc phát");
});

test("page modules export factories", async () => {
  const refine = await import("../pages/refine.js");
  assert.equal(typeof refine.createPage, "function");
});

test("suggestion text renders as text (suggested_text only); notice states minimal payload", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../pages/refine.js", import.meta.url), "utf8");
  assert.match(source, /#ai-suggested"\)\.textContent = data\.suggested_text/);
  assert.match(source, /Chỉ câu bạn nhập/);
  assert.match(source, /Không gửi\s*\n?\s*lịch sử/);
  assert.doesNotMatch(source, /innerHTML\s*=\s*[^`]*\$\{/);
  assert.doesNotMatch(source, /refined_text/, "hợp đồng v1: không còn refined_text");
});

test("page implements inputRevision stale guard bound at request time", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../pages/refine.js", import.meta.url), "utf8");
  // Revision bắt đầu 1, tăng trên MỖI input event của ô original (C4).
  assert.match(source, /let inputRevision = 1/);
  assert.match(source, /inputRevision \+= 1/);
  assert.match(source, /inputRevision: revisionAtRequest/);
  // Gợi ý gắn revision lúc tạo; sửa trước/trong/sau response -> STALE:
  // cảnh báo + nút Dùng lời này bị khóa; chốt lại revision TẠI LÚC BẤM apply.
  assert.match(source, /boundRevision: Number\.isFinite\(echo\) && echo > 0 \? echo : revisionAtRequest/);
  assert.match(source, /function isStale\(\)/);
  assert.match(source, /acceptBtn\.disabled = stale \|\| applying/);
  assert.match(source, /if \(isStale\(\)\) \{\s*\n\s*renderStale\(\);/);
});
