// tests/qa-demo-isolation.test.mjs — QA Task 4: cô lập chế độ demo.
// Kiểm chứng: demo CHỈ bật bằng ?demo=1|true (không fallback tự động),
// resolveAdapterMode không bao giờ chọn mock khi demo tắt, adapter mock trả
// fixture (source "fixture"), adapter zalo NÉM lỗi (501) thay vì fake dữ liệu.
//
// Kỹ thuật: src/core/config.js dùng import.core JSON + import.meta.env (Vite)
// nên phải chạy qua tests/qa-hook.mjs (module.register) — xem ghi chú trong
// qa-hook.mjs. happy-dom globals gắn TRƯỚC khi import động module src.

// Shim import.meta.env cho config.js (nhờ qa-hook.mjs): giá trị đúng như
// build không cấu hình — PROD:false, không VITE_API_BASE_URL.
import { register } from "node:module";
await register(new URL("./asset-hook.mjs", import.meta.url));
globalThis.__FB_QA_ENV__ = { PROD: false, VITE_API_BASE_URL: "" };

register("./qa-hook.mjs", import.meta.url, { data: { active: true } });

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

const { isDemoModeRequested, getApiBaseUrl } = await import("../src/core/config.js");
const { createAdapter, resolveAdapterMode } = await import("../src/core/adapter/adapter.js");
const { createZaloAdapter } = await import("../src/core/adapter/zalo-adapter.js");
const { createMockAdapter } = await import("../src/core/adapter/mock-adapter.js");
const { ApiError } = await import("../src/core/api/client.mjs");

const { describe, it } = await import("node:test");
const assert = (await import("node:assert/strict")).default;

describe("QA: demo isolation (config)", () => {
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
  });

  it("getApiBaseUrl không cấu hình -> chuỗi rỗng (không tự đoán URL)", () => {
    assert.equal(getApiBaseUrl(), "");
  });
});

describe("QA: resolveAdapterMode (không fallback tự động)", () => {
  it("null / false / undefined -> 'zalo' (KHÔNG BAO GIỜ mock khi demo tắt)", () => {
    assert.equal(resolveAdapterMode(null), "zalo");
    assert.equal(resolveAdapterMode(false), "zalo");
    assert.equal(resolveAdapterMode(undefined), "zalo");
  });

  it("true -> 'mock' (chỉ khi demo bật rõ ràng)", () => {
    assert.equal(resolveAdapterMode(true), "mock");
  });

  it("createAdapter mode không hợp lệ -> throw (không âm thầm chọn chế độ)", () => {
    assert.throws(() => createAdapter({ mode: "khong-hop-le" }), /Chế độ adapter không hợp lệ/);
    assert.throws(() => createAdapter({}), /Chế độ adapter không hợp lệ/);
  });
});

describe("QA: adapter mock (demo) trả fixture, không giả session thật", () => {
  it("mode 'mock' + getConnectionStatus trả fixture với source 'fixture'", async () => {
    const adapter = createAdapter({ mode: "mock" });
    assert.equal(adapter.mode, "mock");
    const status = await adapter.getConnectionStatus();
    assert.equal(status.connected, true);
    assert.equal(status.source, "fixture");
    assert.ok(
      String(status.peer?.displayLabel || "").includes("minh họa"),
      "peer phải mang nhãn minh họa",
    );
  });

  it("adapter mock KHÔNG có phương thức gửi tín hiệu/tin nhắn (send/submit/push)", () => {
    const adapter = createMockAdapter({ scenario: null });
  // F06 drafts: hợp đồng backend thật (xác nhận gửi CUỐI do người dùng bấm
  // sau bước preview; máy chủ thực thi + ghi trạng thái). Không phải cơ chế
  // auto-send mà rule này cấm — rule vẫn cấm mọi method lạ ngoài danh sách.
  const F06_CONTRACT_METHODS = new Set([
    "listDrafts", "createDraft", "getDraft", "editDraft", "discardDraft",
    "pauseDraft", "cancelDraftPause", "previewDraft", "confirmDraftSend",
  ]);

    for (const key of Object.keys(adapter)) {
      if (F06_CONTRACT_METHODS.has(key)) continue;
      assert.doesNotMatch(key, /send|submit|push|publish|post/i, `method lạ: ${key}`);
    }
    for (const key of F06_CONTRACT_METHODS) {
      assert.ok(typeof adapter[key] === "function", `thiếu method F06: ${key}`);
    }
  });
});

describe("QA: adapter zalo (production) KHÔNG fake dữ liệu", () => {
  it("mode 'zalo': getConnectionStatus phải THROW ApiError 501 (boundary chưa triển khai)", async () => {
    const adapter = createAdapter({ mode: "zalo" });
    assert.equal(adapter.mode, "zalo");
    await assert.rejects(
      () => adapter.getConnectionStatus(),
      (error) => {
        assert.ok(error instanceof ApiError, `phải là ApiError, nhận: ${error?.name}`);
        assert.equal(error.status, 501);
        return true;
      },
    );
  });

  it("mode 'zalo' thiếu baseUrl: health/ready ném ApiError cấu hình — KHÔNG fallback mock", async () => {
    const adapter = createAdapter({ mode: "zalo" });
    await assert.rejects(
      () => adapter.getBackendHealth(),
      (error) => {
        assert.ok(error instanceof ApiError);
        assert.match(error.message, /Chưa cấu hình địa chỉ máy chủ/);
        return true;
      },
    );
    await assert.rejects(() => adapter.getBackendReady(), ApiError);
  });

  it("createZaloAdapter trực tiếp (baseUrl rỗng) vẫn ném 501 cho getConnectionStatus", async () => {
    const adapter = createZaloAdapter({ baseUrl: "" });
    await assert.rejects(
      () => adapter.getConnectionStatus(),
      (error) => error instanceof ApiError && error.status === 501,
    );
  });

  it("adapter zalo KHÔNG có phương thức gửi tín hiệu/tin nhắn", () => {
    const adapter = createZaloAdapter({ baseUrl: "https://example.org" });
  // F06 drafts: hợp đồng backend thật (xác nhận gửi CUỐI do người dùng bấm
  // sau bước preview; máy chủ thực thi + ghi trạng thái). Không phải cơ chế
  // auto-send mà rule này cấm — rule vẫn cấm mọi method lạ ngoài danh sách.
  const F06_CONTRACT_METHODS = new Set([
    "listDrafts", "createDraft", "getDraft", "editDraft", "discardDraft",
    "pauseDraft", "cancelDraftPause", "previewDraft", "confirmDraftSend",
  ]);

    for (const key of Object.keys(adapter)) {
      if (F06_CONTRACT_METHODS.has(key)) continue;
      assert.doesNotMatch(key, /send|submit|push|publish|post/i, `method lạ: ${key}`);
    }
    for (const key of F06_CONTRACT_METHODS) {
      assert.ok(typeof adapter[key] === "function", `thiếu method F06: ${key}`);
    }
  });
});
