// tests/http-endpoints.test.mjs — factory createHttpEndpoints (node:test thuần,
// KHÔNG happy-dom). Host (glue) cung cấp request/authed/requireBaseUrl/
// staleSessionError — test dựng host tối thiểu GIỐNG HỆT semantics glue mini:
//  - authed cô lập theo thế hệ phiên (401 cùng generation -> clear; kết quả của
//    phiên cũ -> stale_session), chiếu theo zalo-adapter.js.
//  - coldStartTimeoutMs áp dụng cho endpoint mở app đầu tiên (health/ready...).
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import { ApiError, createApiClient } from "../src/api/client.mjs";
import {
  clearSession, clearSessionIfUnchanged, getSession, getSessionGeneration,
  getToken, hasLiveSession, setSession,
} from "../src/session.js";
import { createHttpEndpoints } from "../src/adapter/http-endpoints.js";
import { ADAPTER_METHODS } from "../src/adapter/contract.js";

function jsonResponse(data, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

/** Host test: dựng đúng pattern glue mini (tham số factory ADR-1). */
function makeEndpoints({ baseUrl = "https://backend.example", coldStartTimeoutMs = 60000 } = {}) {
  const request = createApiClient({ baseUrl, getToken, timeoutMs: 15000 });
  function requireBaseUrl() {
    if (!baseUrl) {
      throw new ApiError(
        "Chưa cấu hình địa chỉ máy chủ. Thêm VITE_API_BASE_URL khi build.",
        0,
        "configuration",
      );
    }
  }
  function staleSessionError() {
    return new ApiError(
      "Phiên đã thay đổi khi yêu cầu đang chạy — kết quả của phiên cũ bị bỏ qua.",
      0,
      "stale_session",
    );
  }
  async function authed(run) {
    const capturedGeneration = getSessionGeneration();
    let data;
    try {
      data = await run();
    } catch (error) {
      if (getSessionGeneration() !== capturedGeneration) throw staleSessionError();
      if (error instanceof ApiError && error.status === 401) {
        clearSessionIfUnchanged(capturedGeneration);
      }
      throw error;
    }
    if (getSessionGeneration() !== capturedGeneration) throw staleSessionError();
    return data;
  }
  return createHttpEndpoints({ request, authed, requireBaseUrl, staleSessionError, coldStartTimeoutMs });
}

/** Fetch treo đến khi client bắn abort — đo timeout theo timer thật. */
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

describe("shared http-endpoints — authed + phiên", () => {
  it("authed gắn Bearer từ getToken() (session in-memory được inject, không storage)", async () => {
    clearSession();
    setSession({ token: "tok-endpoints", userId: "u", expiresAt: Date.now() + 60_000 });
    const calls = [];
    mock.method(globalThis, "fetch", async (url, options = {}) => {
      calls.push({ url: String(url), headers: options.headers });
      return jsonResponse({ results: [] });
    });
    try {
      const endpoints = makeEndpoints();
      const page = await endpoints.listConnections();
      assert.deepEqual(page, { results: [], nextCursor: null });
      assert.equal(calls[0].headers.Authorization, "Bearer tok-endpoints");
    } finally {
      clearSession();
      mock.restoreAll();
    }
  });

  it("401 cùng thế hệ phiên: xóa phiên (hành vi đăng xuất đúng)", async () => {
    clearSession();
    setSession({ token: "tok-a", userId: "u", expiresAt: Date.now() + 60_000 });
    mock.method(globalThis, "fetch", async () =>
      jsonResponse({ error: { code: "not_authenticated", details: {} } }, { status: 401 }));
    try {
      const endpoints = makeEndpoints();
      await assert.rejects(() => endpoints.listConnections());
      assert.equal(hasLiveSession(), false, "401 thật phải xóa phiên");
    } finally {
      clearSession();
      mock.restoreAll();
    }
  });

  it("401 của phiên CŨ (generation đã đổi): KHÔNG xóa phiên mới, báo stale_session", async () => {
    clearSession();
    setSession({ token: "tok-old", userId: "u", expiresAt: Date.now() + 60_000 });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    mock.method(globalThis, "fetch", async () => {
      await gate;
      return jsonResponse({ error: { code: "not_authenticated", details: {} } }, { status: 401 });
    });
    try {
      const endpoints = makeEndpoints();
      const pending = endpoints.listConnections().catch((e) => e);
      setSession({ token: "tok-new", userId: "u", expiresAt: Date.now() + 60_000 });
      release();
      const outcome = await pending;
      assert.ok(outcome instanceof ApiError && outcome.kind === "stale_session",
        `phải stale_session, thấy: ${outcome && outcome.kind}`);
      assert.equal(getToken(), "tok-new", "phiên mới phải còn nguyên");
      assert.equal(hasLiveSession(), true);
    } finally {
      clearSession();
      mock.restoreAll();
    }
  });

  it("response 200 của phiên cũ sau khi đổi phiên bị BỎ (stale_session)", async () => {
    clearSession();
    setSession({ token: "tok-old", userId: "u", expiresAt: Date.now() + 60_000 });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    mock.method(globalThis, "fetch", async () => {
      await gate;
      return jsonResponse({ results: [{ connection_id: "conn-old" }] });
    });
    try {
      const endpoints = makeEndpoints();
      const pending = endpoints.listConnections().catch((e) => e);
      setSession({ token: "tok-new", userId: "u", expiresAt: Date.now() + 60_000 });
      release();
      const outcome = await pending;
      assert.ok(outcome instanceof ApiError && outcome.kind === "stale_session");
      assert.equal(getToken(), "tok-new");
    } finally {
      clearSession();
      mock.restoreAll();
    }
  });

  it("loginWithCredentials: cài phiên + loginMethod 'class' + role/classRef do máy chủ trả", async () => {
    clearSession();
    mock.method(globalThis, "fetch", async () => jsonResponse({
      token: "backend-class-token",
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      user: { id: "user-class", display_name: "Mẹ Nam", role: "caregiver", class_ref: "lop-4a" },
      consents_required: ["service"],
    }));
    try {
      const endpoints = makeEndpoints();
      const result = await endpoints.loginWithCredentials({ code: "lop4a", password: "mat-khau" });
      assert.equal(getToken(), "backend-class-token");
      assert.equal(result.role, "caregiver");
      assert.equal(result.classRef, "lop-4a");
      assert.equal(getSession().loginMethod, "class", "nguồn đăng nhập lớp học ghi vào session");
    } finally {
      clearSession();
      mock.restoreAll();
    }
  });

  it("loginWithCredentials: thiếu mã/mật khẩu -> 400 input_invalid, KHÔNG gọi fetch", async () => {
    let fetchCalled = false;
    mock.method(globalThis, "fetch", async () => { fetchCalled = true; return jsonResponse({}); });
    try {
      const endpoints = makeEndpoints();
      await assert.rejects(
        () => endpoints.loginWithCredentials({ code: "  ", password: "x" }),
        (error) => error instanceof ApiError && error.status === 400
          && error.code === "input_invalid",
      );
      assert.equal(fetchCalled, false);
    } finally {
      mock.restoreAll();
    }
  });

  it("loginWithCredentials: POST trả chậm sau khi phiên đổi -> stale_session, KHÔNG cài phiên", async () => {
    clearSession();
    setSession({ token: "tok-prev", userId: "u", expiresAt: Date.now() + 60_000 });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    mock.method(globalThis, "fetch", async () => {
      await gate;
      return jsonResponse({ token: "late-token", user: { id: "late" }, expires_at: Date.now() + 60_000 });
    });
    try {
      const endpoints = makeEndpoints();
      const pending = endpoints.loginWithCredentials({ code: "lop4a", password: "x" }).catch((e) => e);
      setSession({ token: "tok-newer", userId: "u2", expiresAt: Date.now() + 60_000 });
      release();
      const outcome = await pending;
      assert.ok(outcome instanceof ApiError && outcome.kind === "stale_session");
      assert.equal(getToken(), "tok-newer", "đăng nhập lỗi thời không được hồi sinh phiên");
    } finally {
      clearSession();
      mock.restoreAll();
    }
  });
});

describe("shared http-endpoints — idempotency + timeout", () => {
  it("sendMessage gắn X-Idempotency-Key do caller tạo; thiếu key -> kind configuration", async () => {
    clearSession();
    setSession({ token: "tok-m", userId: "u", expiresAt: Date.now() + 60_000 });
    const calls = [];
    mock.method(globalThis, "fetch", async (url, options = {}) => {
      calls.push({ url: String(url), headers: options.headers, body: options.body });
      return jsonResponse({ message_id: "m1", state: "sent" }, { status: 201 });
    });
    try {
      const endpoints = makeEndpoints();
      await endpoints.sendMessage({ kind: "text", recipientId: "r1", body: "hi", key: "key-uuid-1" });
      assert.equal(calls[0].headers["X-Idempotency-Key"], "key-uuid-1");
      await assert.rejects(
        () => endpoints.sendMessage({ kind: "text", recipientId: "r1", body: "hi" }),
        (error) => error.kind === "configuration",
      );
      assert.equal(calls.length, 1, "thiếu key phải chặn trước fetch");
    } finally {
      clearSession();
      mock.restoreAll();
    }
  });

  it("coldStartTimeoutMs áp dụng làm mặc định cho health/ready (call mở app đầu tiên)", async () => {
    const restore = globalThis.fetch;
    globalThis.fetch = fetchHangsUntilAbort();
    try {
      const endpoints = makeEndpoints({ coldStartTimeoutMs: 100 });
      const startedAt = Date.now();
      await assert.rejects(() => endpoints.getBackendHealth(), (error) => error.kind === "timeout");
      const elapsedDefault = Date.now() - startedAt;
      assert.ok(elapsedDefault >= 80,
        `default phải theo coldStartTimeoutMs (100ms), elapsed=${elapsedDefault}ms`);
      // Per-call override đè cold-start: 30ms < 100ms.
      const startedAt2 = Date.now();
      await assert.rejects(() => endpoints.getBackendHealth(30), (error) => error.kind === "timeout");
      const elapsedOverride = Date.now() - startedAt2;
      assert.ok(elapsedOverride < 80,
        `override 30ms phải nhanh hơn cold-start, elapsed=${elapsedOverride}ms`);
    } finally {
      globalThis.fetch = restore;
    }
  });
});

describe("shared http-endpoints — hợp đồng boundary", () => {
  it("getConnectionStatus/getProfile ném 501 (không fake dữ liệu ở mode production)", async () => {
    const endpoints = makeEndpoints();
    await assert.rejects(() => endpoints.getConnectionStatus(),
      (error) => error instanceof ApiError && error.status === 501);
    await assert.rejects(() => endpoints.getProfile(),
      (error) => error instanceof ApiError && error.status === 501);
  });

  it("ready 503 là trạng thái hợp lệ -> 'unavailable' (không phải lỗi)", async () => {
    clearSession();
    mock.method(globalThis, "fetch", async () =>
      jsonResponse({ status: "unavailable" }, { status: 503 }));
    try {
      const endpoints = makeEndpoints();
      assert.equal(await endpoints.getBackendReady(), "unavailable");
    } finally {
      mock.restoreAll();
    }
  });

  it("getCapabilities best-effort: mọi lỗi -> {} (không chặn đăng nhập)", async () => {
    mock.method(globalThis, "fetch", async () => {
      throw new TypeError("fetch failed");
    });
    try {
      const endpoints = makeEndpoints();
      assert.deepEqual(await endpoints.getCapabilities(), {});
    } finally {
      mock.restoreAll();
    }
  });

  it("thiếu baseUrl: requireBaseUrl ném kind configuration trước fetch", async () => {
    let fetchCalled = false;
    mock.method(globalThis, "fetch", async () => { fetchCalled = true; return jsonResponse({}); });
    try {
      const endpoints = makeEndpoints({ baseUrl: "" });
      await assert.rejects(() => endpoints.getBackendHealth(), (error) => {
        assert.equal(error.kind, "configuration");
        return true;
      });
      assert.equal(fetchCalled, false);
    } finally {
      mock.restoreAll();
    }
  });

  it("surface phủ ADAPTER_METHODS: 81 tên hợp đồng, mọi method endpoint đều là hàm", () => {
    const endpoints = makeEndpoints();
    assert.equal(ADAPTER_METHODS.length, 81);
    for (const name of ADAPTER_METHODS) {
      // loginWithZaloToken/trySilentLogin/logout là glue SDK của host (mini: zmp-sdk).
      if (name === "loginWithZaloToken" || name === "trySilentLogin" || name === "logout") continue;
      assert.equal(typeof endpoints[name], "function", `thiếu method ${name}`);
    }
  });
});
