import { test } from "node:test";
import assert from "node:assert/strict";
import { createPrivacyApi } from "../api.js";

function fakeApi() {
  const calls = [];
  return {
    calls,
    async post(path, opts) { calls.push(["POST", path, opts]); return { ok: 1 }; },
    async get(path, opts) { calls.push(["GET", path, opts]); return { shared_by_me: [] }; },
  };
}

test("privacy api wrappers hit contract paths", async () => {
  const api = fakeApi();
  const privacy = createPrivacyApi({ api });
  await privacy.overview();
  await privacy.revokeGrant("mood_entry", "11111111-1111-1111-1111-111111111111",
    "22222222-2222-2222-2222-222222222222");
  await privacy.requestDeletion(["mood", "journal"]);
  await privacy.cancelDeletionRequest("33333333-3333-3333-3333-333333333333", 2);
  await privacy.withdrawConsent("research");
  assert.equal(api.calls[0][1], "/api/v1/privacy/overview");
  assert.match(api.calls[1][1], /grants\/mood_entry\/11111111-1111-1111-1111-111111111111\/revoke$/);
  assert.deepEqual(api.calls[1][2].body, { recipient_id: "22222222-2222-2222-2222-222222222222" });
  assert.deepEqual(api.calls[2][2].body, { categories: ["mood", "journal"] });
  assert.deepEqual(api.calls[3][2].body, { expected_revision: 2 });
  assert.match(api.calls[4][1], /consents\/research\/withdraw$/);
});

test("revoke without recipient sends empty body (revoke all)", async () => {
  const api = fakeApi();
  const privacy = createPrivacyApi({ api });
  await privacy.revokeGrant("journal_page", "11111111-1111-1111-1111-111111111111");
  assert.deepEqual(api.calls[0][2].body, {});
});

test("privacy page module exports factory", async () => {
  const mod = await import("../pages/privacy.js");
  assert.equal(typeof mod.createPage, "function");
});
