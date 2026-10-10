import test from "node:test";
import assert from "node:assert/strict";
import { createApiClient } from "../src/api/client.mjs";

test("rejects missing configuration before issuing any request", async () => {
  await assert.rejects(createApiClient({ baseUrl: "" })("/api/v1/health/"), /Chưa cấu hình/);
});
test("rejects HTTP on public hosts", async () => {
  await assert.rejects(createApiClient({ baseUrl: "http://example.com" })("/api/v1/health/"), /HTTPS/);
});
test("uses a bearer header and omits cookies", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://api.example.com/api/v1/health/");
    assert.equal(options.headers.Authorization, "Bearer private-token");
    assert.equal(options.credentials, "omit");
    return new Response('{"status":"ok"}', { status: 200 });
  });
  assert.deepEqual(await createApiClient({ baseUrl: "https://api.example.com", getToken: () => "private-token" })("/api/v1/health/"), { status: "ok" });
});
test("does not expose server response bodies or retry writes", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => { requests++; return new Response("private diary secret", { status: 500 }); });
  await assert.rejects(createApiClient({ baseUrl: "https://api.example.com" })("/messages/", { method: "POST", body: { text: "hello" } }), (e) => e.status === 500 && !e.message.includes("secret"));
  assert.equal(requests, 1);
});
test("aborts a stalled request", async (t) => {
  t.mock.method(globalThis, "fetch", (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  }));
  await assert.rejects(createApiClient({ baseUrl: "https://api.example.com", timeoutMs: 5 })("/api/v1/health/"), /quá thời gian/);
});
