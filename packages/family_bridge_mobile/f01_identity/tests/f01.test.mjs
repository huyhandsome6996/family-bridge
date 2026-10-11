// F01 node tests: api wrappers hit contract paths; page modules export
// factories. Full DOM interaction is covered by the preview shell manually
// (node has no DOM here; UI rules evidence is manual-review).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createIdentityApi } from "../api.js";

function fakeApi() {
  const calls = [];
  return {
    calls,
    async post(path, opts) { calls.push(["POST", path, opts]); return { ok: 1 }; },
    async get(path, opts) { calls.push(["GET", path, opts]); return { results: [] }; },
  };
}

test("identity api wrappers hit contract paths", async () => {
  const api = fakeApi();
  const identity = createIdentityApi({ api });
  await identity.createInvite("primary");
  await identity.claimInvite("ABCD23456789");
  await identity.confirmInvite("11111111-1111-1111-1111-111111111111", 2);
  await identity.revokeConnection("22222222-2222-2222-2222-222222222222");
  const [, createPath, createBody] = api.calls[0];
  assert.equal(createPath, "/api/v1/connections/invites");
  assert.deepEqual(createBody.body, { relationship_kind: "primary" });
  const [, claimPath, claimOpts] = api.calls[1];
  assert.deepEqual(claimOpts.body, { code: "ABCD23456789" });
  const [, confirmPath, confirmOpts] = api.calls[2];
  assert.equal(confirmPath, "/api/v1/connections/invites/11111111-1111-1111-1111-111111111111/confirm");
  assert.deepEqual(confirmOpts.body, { expected_revision: 2 });
  assert.match(api.calls[3][1], /\/revoke$/);
});

test("confirm without expected revision sends empty object", async () => {
  const api = fakeApi();
  const identity = createIdentityApi({ api });
  await identity.confirmInvite("11111111-1111-1111-1111-111111111111");
  assert.deepEqual(api.calls[0][2].body, {});
});

test("page modules export createPage factories", async () => {
  const onboarding = await import("../pages/onboarding.js");
  const connection = await import("../pages/connection.js");
  assert.equal(typeof onboarding.createPage, "function");
  assert.equal(typeof connection.createPage, "function");
});

test("zalo ids stay strings in adapter contract (regression guard)", async () => {
  const { createMockAdapter } = await import(
    "../../../family_bridge_mobile_core/src/sdk-bridge.js");
  const adapter = createMockAdapter();
  const profile = await adapter.getUserProfile();
  assert.equal(typeof profile.id, "string");
});
