import { test } from "node:test";
import assert from "node:assert/strict";
import { createDraftsApi, remainingSeconds } from "../api.js";

function fakeApi() {
  const calls = [];
  return {
    calls,
    async post(path, opts) { calls.push(["POST", path, opts]); return { ok: 1 }; },
    async get(path, opts) { calls.push(["GET", path, opts]); return { results: [] }; },
    async delete(path, opts) { calls.push(["DELETE", path, opts]); return { ok: 1 }; },
  };
}

test("drafts api wrappers hit contract paths", async () => {
  const api = fakeApi();
  const drafts = createDraftsApi({ api });
  await drafts.list();
  await drafts.create({ kind: "text", body: "lời nháp",
    recipientId: "22222222-2222-2222-2222-222222222222" });
  await drafts.detail("11111111-1111-1111-1111-111111111111");
  await drafts.edit("11111111-1111-1111-1111-111111111111", { body: "sửa" });
  await drafts.pause("11111111-1111-1111-1111-111111111111");
  await drafts.cancelPause("11111111-1111-1111-1111-111111111111");
  await drafts.preview("11111111-1111-1111-1111-111111111111");
  await drafts.confirmSend("11111111-1111-1111-1111-111111111111",
    "33333333-3333-3333-3333-333333333333");
  await drafts.discard("11111111-1111-1111-1111-111111111111");

  assert.equal(api.calls[0][1], "/api/v1/drafts");
  assert.equal(api.calls[1][2].body.kind, "text");
  assert.match(api.calls[2][1], /drafts\/11111111-1111-1111-1111-111111111111$/);
  assert.match(api.calls[4][1], /\/pause$/);
  assert.equal(api.calls[5][0], "DELETE");
  assert.match(api.calls[6][1], /\/preview$/);
  const [, confirmPath, confirmOpts] = api.calls[7];
  assert.match(confirmPath, /\/confirm-send$/);
  assert.equal(confirmOpts.body.preview_id,
    "33333333-3333-3333-3333-333333333333");
  assert.equal(api.calls[8][0], "DELETE");
});

test("remaining uses server deadline + monotonic device elapsed (299/300/301)", () => {
  const deadlineIso = "2026-10-11T03:05:00+00:00";
  const serverTimeIso = "2026-10-11T03:00:00+00:00";
  const fetchMs = 1000;
  // At fetch: exactly 300s remaining.
  assert.equal(remainingSeconds({ deadlineIso, serverTimeIso,
    deviceNowMs: fetchMs + 0, deviceFetchMs: fetchMs }), 300);
  // 1s elapsed -> 299 left (still waiting).
  assert.equal(remainingSeconds({ deadlineIso, serverTimeIso,
    deviceNowMs: fetchMs + 1000, deviceFetchMs: fetchMs }), 299);
  // 300s elapsed -> 0: eligible to preview (client view only).
  assert.equal(remainingSeconds({ deadlineIso, serverTimeIso,
    deviceNowMs: fetchMs + 300000, deviceFetchMs: fetchMs }), 0);
  // 301s elapsed -> still 0, never negative.
  assert.equal(remainingSeconds({ deadlineIso, serverTimeIso,
    deviceNowMs: fetchMs + 301000, deviceFetchMs: fetchMs }), 0);
});

test("device wall-clock changes cannot shorten the wait", () => {
  // performance.now() ticks are independent of wall clock: shifting the
  // WALL clock is invisible to this function (it never receives wall time).
  const deadlineIso = "2026-10-11T03:05:00+00:00";
  const serverTimeIso = "2026-10-11T03:00:00+00:00";
  const fetchMs = 5000;
  const before = remainingSeconds({ deadlineIso, serverTimeIso,
    deviceNowMs: fetchMs + 60_000, deviceFetchMs: fetchMs });
  assert.equal(before, 240);
});

test("page modules export factories", async () => {
  const drafts = await import("../pages/drafts.js");
  assert.equal(typeof drafts.createPage, "function");
});
