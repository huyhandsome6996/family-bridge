import { test } from "node:test";
import assert from "node:assert/strict";
import { createInboxApi } from "../api.js";

function fakeApi() {
  const calls = [];
  return {
    calls,
    async post(path, opts) { calls.push(["POST", path, opts]); return { ok: 1 }; },
    async get(path, opts) { calls.push(["GET", path, opts]); return { results: [] }; },
  };
}

test("inbox api wrappers hit contract paths and carry idempotency key", async () => {
  const api = fakeApi();
  const inbox = createInboxApi({ api });
  await inbox.list();
  await inbox.list("cursor-token");
  await inbox.detail("11111111-1111-1111-1111-111111111111");
  await inbox.send({ kind: "text", recipientId: "22222222-2222-2222-2222-222222222222",
    body: "xin chào", key: "send-0001-abcdef01" });
  await inbox.markRead("11111111-1111-1111-1111-111111111111");
  await inbox.quickReplies("caregiver");
  assert.equal(api.calls[0][1], "/api/v1/messages");
  assert.deepEqual(api.calls[1][2].query, { cursor: "cursor-token" });
  assert.match(api.calls[2][1], /messages\/11111111-1111-1111-1111-111111111111$/);
  const [, sendPath, sendOpts] = api.calls[3];
  assert.equal(sendPath, "/api/v1/messages");
  assert.equal(sendOpts.idempotencyKey, "send-0001-abcdef01");
  assert.equal(sendOpts.body.body, "xin chào");
  assert.match(api.calls[4][1], /\/read$/);
  assert.deepEqual(api.calls[5][2].query, { audience: "caregiver" });
});

test("page modules export factories", async () => {
  const inbox = await import("../pages/inbox.js");
  const detail = await import("../pages/message-detail.js");
  assert.equal(typeof inbox.createPage, "function");
  assert.equal(typeof detail.createPage, "function");
});
