// tests/client.test.mjs — shared api/client.mjs (node:test thuần, KHÔNG happy-dom).
// Phủ semantics SC: thiếu baseUrl → kind configuration (không lộ URL), https-only,
// timeout khi đang đọc body → kind timeout, 503 → mapping envelope, JSON lỗi →
// invalid_response, default timeout 15000ms (mock timer), Bearer từ getToken.
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import { ApiError, createApiClient } from "../src/api/client.mjs";
import { clearSession, setSession, getToken } from "../src/session.js";

function jsonResponse(data, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

/** Fetch treo đến khi AbortController của client bắn abort (timer thật/mock). */
function fetchHangsUntilAbort() {
  return (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => {
        const abortError = new Error("The operation was aborted");
        abortError.name = "AbortError";
        reject(abortError);
      });
    });
}

describe("shared client — phân loại lỗi theo kind", () => {
  it("thiếu baseUrl -> ApiError kind 'configuration', KHÔNG gọi fetch, message không lộ địa chỉ", async () => {
    let fetchCalled = false;
    mock.method(globalThis, "fetch", async () => { fetchCalled = true; return jsonResponse({}); });
    try {
      const request = createApiClient({ baseUrl: "" });
      await assert.rejects(request("/api/v1/health/"), (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.kind, "configuration");
        assert.equal(error.status, 0);
        assert.ok(error.message.includes("cấu hình"));
        return true;
      });
      assert.equal(fetchCalled, false, "lỗi cấu hình phải chặn trước lớp mạng");
    } finally {
      mock.restoreAll();
    }
  });

  it("baseUrl sai cú pháp -> kind 'configuration', KHÔNG lộ URL gốc/exception parser", async () => {
    const request = createApiClient({ baseUrl: "not-a-url", timeoutMs: 50 });
    await assert.rejects(request("/api/v1/health/"), (error) => {
      assert.equal(error.kind, "configuration");
      assert.ok(!String(error.message).includes("not-a-url"), "không lộ baseUrl");
      assert.ok(!String(error.message).includes("Invalid URL"), "không lộ exception thô");
      return true;
    });
  });

  it("https-only: http:// tới host không phải localhost -> kind 'configuration'", async () => {
    const request = createApiClient({ baseUrl: "http://api.example.com", timeoutMs: 50 });
    await assert.rejects(request("/api/v1/health/"), (error) => {
      assert.equal(error.kind, "configuration");
      assert.match(error.message, /HTTPS/);
      return true;
    });
  });

  it("timer hủy giữa lúc đọc body -> kind 'timeout' (KHÔNG phải invalid_response)", async () => {
    const restore = globalThis.fetch;
    globalThis.fetch = fetchHangsUntilAbort();
    try {
      const request = createApiClient({ baseUrl: "https://api.example.com", timeoutMs: 60 });
      const startedAt = Date.now();
      await assert.rejects(request("/api/v1/health/"), (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.kind, "timeout");
        assert.equal(error.status, 0);
        return true;
      });
      assert.ok(Date.now() - startedAt >= 40, "timeout đến từ timer thật");
    } finally {
      globalThis.fetch = restore;
    }
  });

  it("timeout mặc định 15000ms: tại 14999ms chưa hủy, 15000ms hủy -> 'timeout' (mock timer)", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const restore = globalThis.fetch;
    globalThis.fetch = fetchHangsUntilAbort();
    try {
      const request = createApiClient({ baseUrl: "https://api.example.com" });
      const outcome = request("/api/v1/health/").then(
        () => "resolved",
        (error) => error.kind,
      );
      await t.mock.timers.tick(14999);
      const marker = await Promise.race([outcome, Promise.resolve("still-pending")]);
      assert.equal(marker, "still-pending", "14999ms chưa được phép hủy");
      t.mock.timers.tick(1);
      assert.equal(await outcome, "timeout", "15000ms (SC18) phải hủy với kind timeout");
    } finally {
      globalThis.fetch = restore;
      mock.restoreAll();
    }
  });

  it("503 + envelope {error:{code,details}} -> kind 'http', status 503, giữ code/details", async () => {
    mock.method(globalThis, "fetch", async () =>
      jsonResponse(
        { error: { code: "feature_disabled", details: { reason: "provider_not_configured" } } },
        { status: 503 },
      ));
    try {
      const request = createApiClient({ baseUrl: "https://api.example.com", timeoutMs: 50 });
      await assert.rejects(request("/api/v1/ready/"), (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.kind, "http");
        assert.equal(error.status, 503);
        assert.equal(error.code, "feature_disabled");
        assert.deepEqual(error.details, { reason: "provider_not_configured" });
        return true;
      });
    } finally {
      mock.restoreAll();
    }
  });

  it("body 200 không parse được JSON (SyntaxError) -> kind 'invalid_response', giữ mã HTTP", async () => {
    mock.method(globalThis, "fetch", async () => ({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError("Unexpected token < in JSON"); },
    }));
    try {
      const request = createApiClient({ baseUrl: "https://api.example.com", timeoutMs: 50 });
      await assert.rejects(request("/api/v1/health/"), (error) => {
        assert.equal(error.kind, "invalid_response");
        assert.equal(error.status, 200);
        return true;
      });
    } finally {
      mock.restoreAll();
    }
  });

  it("Bearer từ getToken() — token chỉ nằm trong memory (SEC-10), không vào URL/storage", async () => {
    clearSession();
    setSession({ token: "tok-shared-client", userId: "u1", expiresAt: Date.now() + 60_000 });
    let seen = null;
    mock.method(globalThis, "fetch", async (url, init) => {
      seen = { url: String(url), headers: init.headers };
      return jsonResponse({ ok: true });
    });
    try {
      const request = createApiClient({ baseUrl: "https://api.example.com", timeoutMs: 50, getToken });
      const data = await request("/api/v1/auth/me");
      assert.equal(getToken(), "tok-shared-client");
      assert.equal(seen.headers.Authorization, "Bearer tok-shared-client");
      assert.ok(!seen.url.includes("tok-shared-client"), "token không bao giờ vào URL");
      assert.equal(data.ok, true);
    } finally {
      clearSession();
      mock.restoreAll();
    }
  });
});
