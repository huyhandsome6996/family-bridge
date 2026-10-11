import { test } from "node:test";
import assert from "node:assert/strict";
import { createMoodApi } from "../api.js";

function fakeApi() {
  const calls = [];
  return {
    calls,
    async post(path, opts) { calls.push(["POST", path, opts]); return { ok: 1 }; },
    async get(path, opts) { calls.push(["GET", path, opts]); return { results: [] }; },
    async patch(path, opts) { calls.push(["PATCH", path, opts]); return { ok: 1 }; },
  };
}

test("mood api wrappers hit contract paths (per-entry share only)", async () => {
  const api = fakeApi();
  const mood = createMoodApi({ api });
  await mood.list("cursor-1", 20);
  await mood.create({ entryDate: "2026-10-11", emotion: "buon", note: "mệt" });
  await mood.detail("11111111-1111-1111-1111-111111111111");
  await mood.edit("11111111-1111-1111-1111-111111111111", { note: "sửa" });
  await mood.summary(90);
  await mood.entryShares("11111111-1111-1111-1111-111111111111");
  await mood.share("11111111-1111-1111-1111-111111111111",
    "22222222-2222-2222-2222-222222222222");
  await mood.revoke("33333333-3333-3333-3333-333333333333");
  await mood.sharedWithMe();
  await mood.sharedDetail("33333333-3333-3333-3333-333333333333");

  assert.equal(api.calls[0][1], "/api/v1/mood/entries");
  assert.deepEqual(api.calls[0][2].query, { cursor: "cursor-1", page_size: "20" });
  assert.equal(api.calls[1][2].body.emotion, "buon");
  assert.match(api.calls[2][1], /entries\/11111111-1111-1111-1111-111111111111$/);
  assert.equal(api.calls[3][0], "PATCH");
  assert.equal(api.calls[4][1], "/api/v1/mood/entries/summary");
  assert.match(api.calls[6][1], /\/share$/);
  assert.equal(api.calls[6][2].body.recipient_id,
    "22222222-2222-2222-2222-222222222222");
  assert.match(api.calls[7][1], /shares\/33333333-3333-3333-3333-333333333333\/revoke$/);
  assert.equal(api.calls[8][1], "/api/v1/mood/shared");
});

test("page modules export factories", async () => {
  const mood = await import("../pages/mood.js");
  const shared = await import("../pages/mood-shared.js");
  assert.equal(typeof mood.createPage, "function");
  assert.equal(typeof shared.createPage, "function");
});

test("share wording promises per-entry only; text renders as text", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../pages/mood.js", import.meta.url), "utf8");
  assert.match(source, /Chia sẻ mục này/);
  assert.match(source, /không chia sẻ cả lịch sử/);
  assert.match(source, /li\.textContent = `\$\{row\.label\}: \$\{row\.count\} ngày`/);
  assert.match(source, /text\.textContent = `\$\{entry\.entry_date\}/);
});
