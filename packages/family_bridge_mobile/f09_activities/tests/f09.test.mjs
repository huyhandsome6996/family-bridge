import { test } from "node:test";
import assert from "node:assert/strict";
import { createActivitiesApi } from "../api.js";

function fakeApi() {
  const calls = [];
  return {
    calls,
    async post(path, opts) { calls.push(["POST", path, opts]); return { ok: 1 }; },
    async get(path, opts) { calls.push(["GET", path, opts]); return { results: [] }; },
  };
}

test("activities api wrappers hit contract paths", async () => {
  const api = fakeApi();
  const acts = createActivitiesApi({ api });
  await acts.catalog("activity", "student");
  await acts.markProgress({ contentKey: "act-chat-5", contentRevision: 1,
    status: "done" });
  await acts.invite({ contentKey: "act-meal", contentRevision: 2,
    inviteeId: "22222222-2222-2222-2222-222222222222" });
  await acts.respond("33333333-3333-3333-3333-333333333333", "accept");
  await acts.myResponse("33333333-3333-3333-3333-333333333333", "done");
  await acts.cancel("33333333-3333-3333-3333-333333333333");

  assert.deepEqual(api.calls[0][2].query, { kind: "activity", audience: "student" });
  assert.equal(api.calls[1][2].body.status, "done");
  assert.match(api.calls[2][1], /invites$/);
  assert.match(api.calls[3][1], /\/respond$/);
  assert.match(api.calls[4][1], /\/my-response$/);
  assert.match(api.calls[5][1], /\/cancel$/);
});

test("page modules export factories", async () => {
  const acts = await import("../pages/activities.js");
  assert.equal(typeof acts.createPage, "function");
});

test("two-sided wording present; textContent rendering; light media", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../pages/activities.js", import.meta.url), "utf8");
  assert.match(source, /Mỗi người tự đánh dấu phần mình/);
  assert.match(source, /Mình đã làm/);
  assert.doesNotMatch(source, /<video[\s>]|autoplay\s*=/i);
  assert.doesNotMatch(source, /innerHTML\s*=\s*[^`]*\$\{/);
});
