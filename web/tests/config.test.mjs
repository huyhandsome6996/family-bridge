// tests/config.test.mjs — port web (task 19-a): cấu hình build-time của web.
//  1) Thiếu VITE_API_BASE_URL -> assertApiBaseUrlConfigured ném ApiError kind
//     "configuration" (message tiếng Việt GIỐNG mini); getApiBaseUrl trả ""
//     (pin SC1-UI — node:test không có env Vite).
//  2) demo=1|true -> mock adapter từ shared; demo tắt -> adapter web thật.
//     Mock KHÔNG tạo token/phiên thật (isolation qa-demo-isolation).
//  3) getTestBuildLabel / VITE_TEST_LABEL best-effort.

import { register } from "node:module";
await register(new URL("./asset-hook.mjs", import.meta.url));
globalThis.__FB_QA_ENV__ = { PROD: false, VITE_API_BASE_URL: "" };
const { Window } = await import("happy-dom");

// Bốn window với URL khác nhau — config.js đọc window.location.search lúc GỌI
// (không phải lúc import) nên có thể đổi window giữa các assertion.
const winPlain = new Window({ url: "https://localhost/" });
const winDemoOne = new Window({ url: "https://localhost/?demo=1" });
const winDemoTrue = new Window({ url: "https://localhost/?demo=true" });
const winDemoZero = new Window({ url: "https://localhost/?demo=0" });

function useWindow(w) {
  globalThis.window = w;
  globalThis.location = w.location;
  globalThis.document = w.document;
}

useWindow(winPlain);

const { describe, it } = await import("node:test");
const assert = (await import("node:assert/strict")).default;

const {
  getApiBaseUrl, assertApiBaseUrlConfigured, getTestBuildLabel, isDemoModeRequested,
} = await import("../src/core/config.js");
const { createAdapter, resolveAdapterMode, createWebAdapter } =
  await import("../src/adapter/web-adapter.js");
const { ApiError } = await import("../../packages/family_bridge_shared/src/api/client.mjs");
const { hasLiveSession, clearSession, getToken } = await import("../src/core/session.js");

describe("Cấu hình: VITE_API_BASE_URL", () => {
  it("getApiBaseUrl không cấu hình -> chuỗi rỗng (không tự đoán URL)", () => {
    assert.equal(getApiBaseUrl(), "");
  });

  it("thiếu baseUrl -> assertApiBaseUrlConfigured ném ApiError kind 'configuration', message tiếng Việt giống mini", () => {
    try {
      assertApiBaseUrlConfigured("");
      assert.fail("phải ném ApiError");
    } catch (error) {
      assert.ok(error instanceof ApiError, `phải là ApiError, nhận: ${error?.name}`);
      assert.equal(error.kind, "configuration");
      assert.equal(error.status, 0);
      assert.ok(
        error.message.includes("Chưa cấu hình địa chỉ máy chủ"),
        `message: ${error.message}`,
      );
      assert.ok(
        error.message.includes("VITE_API_BASE_URL"),
        "message phải gợi ý biến cấu hình",
      );
    }
  });

  it("assertApiBaseUrlConfigured với baseUrl hợp lệ -> trả về chính nó", () => {
    assert.equal(assertApiBaseUrlConfigured("https://api.example.com"), "https://api.example.com");
  });

  it("getTestBuildLabel ngoài Vite -> chuỗi rỗng (an toàn)", () => {
    assert.equal(getTestBuildLabel(), "");
  });
});

describe("Demo mode (?demo=1|true) — isolation như mini", () => {
  it("isDemoModeRequested = FALSE khi URL không có ?demo", () => {
    useWindow(winPlain);
    assert.equal(isDemoModeRequested(), false);
  });

  it("isDemoModeRequested = FALSE khi ?demo=0 (chỉ nhận '1' hoặc 'true')", () => {
    useWindow(winDemoZero);
    assert.equal(isDemoModeRequested(), false);
  });

  it("isDemoModeRequested = TRUE khi ?demo=1 hoặc ?demo=true", () => {
    useWindow(winDemoOne);
    assert.equal(isDemoModeRequested(), true);
    useWindow(winDemoTrue);
    assert.equal(isDemoModeRequested(), true);
    useWindow(winPlain);
  });
});

describe("Adapter mode — không fallback tự động", () => {
  it("resolveAdapterMode: null/false/undefined -> 'web' (KHÔNG BAO GIỜ mock khi demo tắt)", () => {
    assert.equal(resolveAdapterMode(null), "web");
    assert.equal(resolveAdapterMode(false), "web");
    assert.equal(resolveAdapterMode(undefined), "web");
  });

  it("resolveAdapterMode: true -> 'mock' (chỉ khi demo bật rõ ràng)", () => {
    assert.equal(resolveAdapterMode(true), "mock");
  });

  it("createAdapter mode không hợp lệ -> throw (không âm thầm chọn chế độ)", () => {
    assert.throws(() => createAdapter({ mode: "khong-hop-le" }), /Chế độ adapter không hợp lệ/);
    assert.throws(() => createAdapter({}), /Chế độ adapter không hợp lệ/);
  });

  it("createAdapter 'mock' -> adapter mock (mode 'mock'), có surface ADAPTER_METHODS", () => {
    const adapter = createAdapter({ mode: "mock" });
    assert.equal(adapter.mode, "mock");
    assert.equal(typeof adapter.getBackendHealth, "function");
    assert.equal(typeof adapter.loginWithCredentials, "function");
  });

  it("createAdapter 'web' (baseUrl mặc định rỗng) -> adapter mode 'web'; health ném lỗi cấu hình, KHÔNG fallback mock", async () => {
    const adapter = createAdapter({ mode: "web" });
    assert.equal(adapter.mode, "web");
    await assert.rejects(
      () => adapter.getBackendHealth(),
      (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.kind, "configuration");
        assert.match(error.message, /Chưa cấu hình địa chỉ máy chủ/);
        return true;
      },
    );
  });

  it("createWebAdapter trực tiếp KHÔNG có method Zalo (loginWithZaloToken/trySilentLogin/assertZaloHost)", () => {
    const adapter = createWebAdapter({ baseUrl: "https://api.example.com" });
    assert.equal(adapter.loginWithZaloToken, undefined);
    assert.equal(adapter.trySilentLogin, undefined);
    assert.equal(adapter.assertZaloHost, undefined);
    // Đường đăng nhập duy nhất của web:
    assert.equal(typeof adapter.loginWithCredentials, "function");
    assert.equal(typeof adapter.getCapabilities, "function");
    assert.equal(typeof adapter.logout, "function");
  });
});

describe("Demo isolation: mock không tạo token/phiên thật", () => {
  it("loginWithZaloToken trên mock (demo) KHÔNG cài phiên sống có token thật ngoài bộ nhớ demo", async () => {
    useWindow(winDemoOne);
    try {
      clearSession();
      const adapter = createAdapter({ mode: "mock" });
      const result = await adapter.loginWithZaloToken();
      // Demo fixture: phiên minh họa trong bộ nhớ adapter/mock, mang nhãn
      // minh họa — KHÔNG phải phiên production; không có token thật nào được
      // phát hành bởi backend (không gọi mạng — fetch không bị stub ở đây vẫn
      // pass vì mock không fetch).
      assert.ok(result, "demo login trả kết quả fixture");
      assert.ok(!getToken()?.startsWith("real-"), "không có token thật");
      assert.equal(hasLiveSession(), true, "mock dùng session in-memory demo");
    } finally {
      clearSession();
      useWindow(winPlain);
    }
  });

  it("demo adapter: getConnectionStatus trả fixture với source 'fixture' (giống mini)", async () => {
    const adapter = createAdapter({ mode: "mock" });
    const status = await adapter.getConnectionStatus();
    assert.equal(status.connected, true);
    assert.equal(status.source, "fixture");
    assert.ok(
      String(status.peer?.displayLabel || "").includes("minh họa"),
      "peer phải mang nhãn minh họa",
    );
  });
});
