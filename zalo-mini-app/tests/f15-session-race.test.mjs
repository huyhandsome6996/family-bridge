import { test } from "node:test";
import assert from "node:assert/strict";
import { createAppApi } from "../src/pages/privacy/api.mjs";
import { setSession, clearSession, getToken } from "../src/core/session.js";
function session(token) { setSession({ token, userId: token, expiresAt: Date.now() + 60000 }); }
test("F15 old success cannot expose actor A data to actor B", async () => {
  session("synthetic-A"); let respond;
  globalThis.fetch = () => new Promise(r => { respond = r; });
  const api = createAppApi({ baseUrl: "https://synthetic.example", readToken: async () => getToken() });
  const pending = api.get("/api/v1/privacy/overview");
  await new Promise(r => setTimeout(r, 0));
  session("synthetic-B"); respond({ ok: true, status: 200, json: async () => ({ private: "A" }) });
  await assert.rejects(pending, e => e.kind === "stale_session");
  assert.equal(getToken(), "synthetic-B"); clearSession();
});
test("F15 old 401 cannot clear actor B session; current 401 clears it", async () => {
  session("synthetic-A"); let respond;
  globalThis.fetch = () => new Promise(r => { respond = r; });
  const api = createAppApi({ baseUrl: "https://synthetic.example", readToken: async () => getToken() });
  const pending = api.get("/api/v1/privacy/overview"); await new Promise(r => setTimeout(r, 0));
  session("synthetic-B"); respond({ ok: false, status: 401, json: async () => ({ error: { code: "not_authenticated" } }) });
  await assert.rejects(pending, e => e.kind === "stale_session"); assert.equal(getToken(), "synthetic-B");
  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: { code: "not_authenticated" } }) });
  await assert.rejects(api.get("/api/v1/privacy/overview"), e => e.status === 401); assert.equal(getToken(), null);
});
