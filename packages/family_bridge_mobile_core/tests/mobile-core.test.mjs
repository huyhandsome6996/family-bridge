// Node test runner for the mobile core (no deps: node:test).
// Run: node --test packages/family_bridge_mobile_core/tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { createApiClient, ApiError } from "../src/api-client.js";
import { createMockAdapter, createSdkBridge } from "../src/sdk-bridge.js";
import { createSessionStore } from "../src/session-store.js";
import { createStore } from "../src/state.js";
import { BRAND, FUNCTIONAL } from "../src/theme.js";

function fetchStub(handler) {
  return async (url, init) => handler(new URL(url), init);
}

test("api client sends bearer header and parses envelope errors", async () => {
  let seen = null;
  const client = createApiClient({
    baseUrl: "https://api.test",
    getToken: () => "tok-123",
    fetchImpl: fetchStub(async (url, init) => {
      seen = { url: url.toString(), init };
      return new Response(JSON.stringify({ error: { code: "not_authorized", details: { reason: "x" } } }),
        { status: 403, headers: { "Content-Type": "application/json" } });
    }),
  });
  await assert.rejects(
    client.get("/api/v1/mood/entries/"),
    (err) => err instanceof ApiError && err.code === "not_authorized" && err.status === 403,
  );
  assert.equal(seen.init.headers.Authorization, "Bearer tok-123");
  assert.equal(seen.init.credentials, "omit");
});

test("api client never auto-retries and surfaces network errors as unknown outcome", async () => {
  let calls = 0;
  const client = createApiClient({
    baseUrl: "https://api.test",
    getToken: () => "tok",
    fetchImpl: async () => { calls += 1; throw new TypeError("network down"); },
  });
  await assert.rejects(client.post("/api/v1/messages", { body: {}, idempotencyKey: "key-12345678" }),
    (err) => err.code === "temporarily_unavailable");
  assert.equal(calls, 1, "must not retry mutations");
});

test("idempotency key header is attached", async () => {
  let header = null;
  const client = createApiClient({
    baseUrl: "https://api.test",
    getToken: () => "tok",
    fetchImpl: fetchStub(async (url, init) => {
      header = init.headers["X-Idempotency-Key"];
      return new Response("{}", { status: 200 });
    }),
  });
  await client.post("/api/v1/messages", { body: {}, idempotencyKey: "send-0001-aaaa" });
  assert.equal(header, "send-0001-aaaa");
});

test("mock adapter keeps zalo id as string and storage isolated", async () => {
  const adapter = createMockAdapter();
  const profile = await adapter.getUserProfile();
  assert.equal(typeof profile.id, "string");
  await adapter.storageSet("k", { v: 1 });
  assert.deepEqual(await adapter.storageGet("k"), { v: 1 });
  const bridge = createSdkBridge({ adapter });
  assert.equal(bridge.isMock, true);
});

test("session store clear wipes token/actor and notifies", () => {
  const store = createSessionStore();
  let notified = false;
  store.subscribe(() => { notified = true; });
  store.set({ token: "t", actor: { id: "1" }, role: "student" });
  store.clear();
  assert.deepEqual(store.get(), { token: null, actor: null, role: null });
  assert.equal(notified, true);
});

test("store window bounded to 200 items", () => {
  const store = createStore({});
  const items = Array.from({ length: 260 }, (_, i) => i);
  store.appendItems(items);
  assert.equal(store.get().items.length, 200);
  assert.equal(store.get().items[0], 60, "oldest evicted");
});

test("brand tokens match DEC-07", () => {
  assert.equal(BRAND.primary, "#C65B43");
  assert.equal(BRAND.accent, "#E4AB56");
  assert.equal(BRAND.background, "#FFF4E8");
  assert.equal(BRAND.text, "#713D32");
  assert.equal(FUNCTIONAL.action, "#A84733");
});
