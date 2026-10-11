// tests/connection-check-errors.test.mjs — Task 13-c: kiểm thử độc lập cho
// fix phân loại lỗi connection-check (US-003, commit 79f7331).
//
// Bug cũ: isTimeoutError coi mọi ApiError status===0 là timeout → thiếu
// VITE_API_BASE_URL và lỗi mạng hiển thị sai "Kết nối quá thời gian chờ".
// Fix: ApiError có `kind` ("configuration"|"network"|"timeout"|"http"|
// "invalid_response") gắn tại nơi ném; connection-check phân nhánh theo kind;
// lỗi không kind → "unknown" → lỗi chung, KHÔNG bao giờ timeout; ready-503
// → "unavailable" giữ nguyên.
//
// Phạm vi test: cả TẦNG API CLIENT (kind thực tế từ createApiClient /
// createZaloAdapter thật + fetch stub) lẫn TẦNG HIỂN THỊ (mount page
// connection-check thật + adapter thật/stub). KHÔNG dùng timer fake —
// timeout thật dùng timeoutMs nhỏ (30–50ms) với timer thật.
//
// Chạy: node --test tests/connection-check-errors.test.mjs
// happy-dom globals PHẢI gắn TRƯỚC khi import động pages (giống pages.test.mjs).

// ---------------------------------------------------------------- globals
const { Window } = await import("happy-dom");
const domWindow = new Window({ url: "https://localhost/" });

globalThis.window = domWindow;
globalThis.document = domWindow.document;
globalThis.Node = domWindow.Node;
globalThis.Element = domWindow.Element;
globalThis.HTMLElement = domWindow.HTMLElement;
globalThis.DocumentFragment = domWindow.DocumentFragment;
globalThis.Event = domWindow.Event;
globalThis.CustomEvent = domWindow.CustomEvent;
globalThis.location = domWindow.location;

const { describe, it } = await import("node:test");
const assert = (await import("node:assert/strict")).default;

// --------------------------------------------------- app code (import sau globals)
const { initStore, resetState, setRole, getState } = await import("../src/app/store.js");
const { createZaloAdapter } = await import("../src/core/adapter/zalo-adapter.js");
const { createMockAdapter } = await import("../src/core/adapter/mock-adapter.js");
const { ApiError, createApiClient } = await import("../src/core/api/client.mjs");
const { getApiBaseUrl } = await import("../src/core/config.js");
const { page: connectionCheck } = await import("../src/pages/connection-check/index.js");

// ---------------------------------------------------------------- helpers
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const OK_BASE = "https://api.example.com";

/** Response giả đủ mặt dùng bởi client.mjs: ok, status, json(). */
function jsonResponse(data, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

const okResponse = () => jsonResponse({ status: "ok" });

/** Cài fetch stub + trả hàm khôi phục (gọi trong finally). */
function stubFetch(impl) {
  const previous = globalThis.fetch;
  globalThis.fetch = impl;
  return () => {
    globalThis.fetch = previous;
  };
}

/** Fetch chỉ reject khi AbortController của client bắn "abort" (timer thật). */
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

function makeCtx({ demo = false, role = null, adapter } = {}) {
  initStore({ demoMode: demo });
  resetState();
  if (role) setRole(role);
  const navigateCalls = [];
  const currentAdapter = adapter || createMockAdapter({ scenario: null });
  return {
    ctx: {
      store: { getState }, // store thật từ src/app/store.js
      adapter: currentAdapter,
      navigate: (path) => navigateCalls.push(path),
      setRole: (nextRole) => setRole(nextRole),
      rebuildAdapter: (scenario) => {
        // giống main.js: mutate adapter hiện có, giữ nguyên tham chiếu
        Object.assign(currentAdapter, createMockAdapter({ scenario }));
      },
      params: new URLSearchParams(""),
    },
    navigateCalls,
  };
}

function mountConnectionPage(ctx) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const el = connectionCheck.render(ctx);
  assert.ok(el instanceof HTMLElement, "render phải trả về HTMLElement");
  host.appendChild(el);
  return { host, el };
}

/** Unmount + destroy — mọi test gọi trong finally để không dính state. */
function teardown({ host }) {
  connectionCheck.destroy();
  host.remove();
}

function textOf(el) {
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

function findButton(root, needle) {
  return Array.from(root.querySelectorAll("button")).find(
    (btn) => textOf(btn).includes(needle),
  );
}

/** Mount + chờ kết thúc chuỗi health/ready (đủ cho latency stub đồng bộ). */
async function mountAndSettle(ctx, ms = 80) {
  const mounted = mountConnectionPage(ctx);
  await wait(ms);
  return mounted;
}

// ---------------------------------------------------------------- tests

describe("Tầng API client — kind gắn tại nơi ném (fetch stub, timer thật)", () => {
  it("SC1-client: thiếu baseUrl -> ApiError kind 'configuration', status 0", async () => {
    const request = createApiClient({ baseUrl: "" });
    await assert.rejects(request("/api/v1/health/"), (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.kind, "configuration");
      assert.equal(error.status, 0); // status 0 chỉ nghĩa "không có HTTP status"
      return true;
    });
  });

  it("SC2-client: baseUrl HTTP ngoài localhost -> kind 'configuration' (client chặn HTTPS)", async () => {
    let fetchCalled = false;
    const restore = stubFetch(() => {
      fetchCalled = true;
      return Promise.resolve(okResponse());
    });
    try {
      const request = createApiClient({ baseUrl: "http://example.com", timeoutMs: 50 });
      await assert.rejects(request("/api/v1/health/"), (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.kind, "configuration");
        assert.equal(error.status, 0);
        return true;
      });
      assert.equal(fetchCalled, false, "chặn trước khi gọi mạng");
    } finally {
      restore();
    }
  });

  it("SC3-client: fetch ném TypeError (mạng) -> kind 'network', status 0", async () => {
    const restore = stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    try {
      const request = createApiClient({ baseUrl: OK_BASE, timeoutMs: 50 });
      await assert.rejects(request("/api/v1/health/"), (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.kind, "network");
        assert.equal(error.status, 0);
        return true;
      });
    } finally {
      restore();
    }
  });

  it("SC4-client: AbortError do timer thật (timeoutMs 30) -> kind 'timeout', status 0", async () => {
    const restore = stubFetch(fetchHangsUntilAbort());
    try {
      const request = createApiClient({ baseUrl: OK_BASE, timeoutMs: 30 });
      const startedAt = Date.now();
      await assert.rejects(request("/api/v1/health/"), (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.kind, "timeout");
        assert.equal(error.status, 0);
        return true;
      });
      assert.ok(Date.now() - startedAt >= 25, "timeout phải đến từ timer thật, không phải lỗi tức thời");
    } finally {
      restore();
    }
  });

  it("SC5-client: ready trả 503 -> ApiError kind 'http', status 503 (mã HTTP thật)", async () => {
    const restore = stubFetch(() => Promise.resolve(jsonResponse({ status: "unavailable" }, { status: 503 })));
    try {
      const request = createApiClient({ baseUrl: OK_BASE, timeoutMs: 50 });
      await assert.rejects(request("/api/v1/ready/"), (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.kind, "http");
        assert.equal(error.status, 503);
        return true;
      });
    } finally {
      restore();
    }
  });

  it("SC5b-adapter: zalo-adapter giữ nguyên hợp đồng ready-503 -> 'unavailable'", async () => {
    const restore = stubFetch((input) => {
      const url = typeof input === "string" ? input : String(input && input.url);
      if (url.includes("/api/v1/ready/")) {
        return Promise.resolve(jsonResponse({ status: "unavailable" }, { status: 503 }));
      }
      return Promise.resolve(okResponse());
    });
    try {
      const adapter = createZaloAdapter({ baseUrl: OK_BASE });
      assert.equal(await adapter.getBackendHealth(), "ok");
      assert.equal(await adapter.getBackendReady(), "unavailable");
    } finally {
      restore();
    }
  });

  it("SC7-client: response 200 nhưng json() ném SyntaxError -> kind 'invalid_response'", async () => {
    const restore = stubFetch(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token '<', \"<html>\" is not valid JSON");
        },
      }),
    );
    try {
      const request = createApiClient({ baseUrl: OK_BASE, timeoutMs: 50 });
      await assert.rejects(request("/api/v1/health/"), (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.kind, "invalid_response");
        assert.equal(error.status, 200);
        return true;
      });
    } finally {
      restore();
    }
  });
});

describe("Tầng hiển thị connection-check — mount page thật (happy-dom)", () => {
  it("SC1-UI: thiếu VITE_API_BASE_URL -> lỗi cấu hình, TUYỆT ĐỐI không phải timeout", async () => {
    // node --test thuần: import.meta.env undefined -> getApiBaseUrl() trả ""
    assert.equal(getApiBaseUrl(), "", "tiền đề: node:test không có VITE_API_BASE_URL");
    const adapter = createZaloAdapter({ baseUrl: getApiBaseUrl() });
    const { ctx } = makeCtx({ demo: false, adapter });
    const mounted = await mountAndSettle(ctx);
    try {
      const text = textOf(mounted.el);
      assert.ok(text.includes("Chưa cấu hình địa chỉ máy chủ"), `title cấu hình: ${text}`);
      assert.ok(text.includes("VITE_API_BASE_URL"), `hướng dẫn cấu hình: ${text}`);
      assert.ok(!text.includes("quá thời gian"), "không được hiện thông báo timeout");
      assert.ok(!text.includes("quà thời gian"), "không được hiện thông báo timeout (mọi biến thể)");
      assert.ok(findButton(mounted.el, "Thử lại"), "ErrorState vẫn phải có nút Thử lại");
    } finally {
      teardown(mounted);
    }
  });

  it("SC2-UI: địa chỉ backend HTTP ngoài localhost -> lỗi cấu hình, không phải timeout", async () => {
    const adapter = createZaloAdapter({ baseUrl: "http://example.com" });
    const { ctx } = makeCtx({ demo: false, adapter });
    const mounted = await mountAndSettle(ctx);
    try {
      const text = textOf(mounted.el);
      assert.ok(text.includes("Chưa cấu hình địa chỉ máy chủ"), `title cấu hình: ${text}`);
      assert.ok(!text.includes("Kết nối quá thời gian chờ"));
      assert.ok(!text.includes("Chưa kết nối được máy chủ"), "chặn HTTPS diễn ra trước lớp mạng");
    } finally {
      teardown(mounted);
    }
  });

  it("SC3-UI: fetch ném TypeError -> 'Chưa kết nối được máy chủ' + nút Thử lại, không phải timeout", async () => {
    const restore = stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    try {
      const adapter = createZaloAdapter({ baseUrl: OK_BASE });
      const { ctx } = makeCtx({ demo: false, adapter });
      const mounted = await mountAndSettle(ctx);
      try {
        const text = textOf(mounted.el);
        assert.ok(text.includes("Chưa kết nối được máy chủ"), `title mạng: ${text}`);
        assert.ok(findButton(mounted.el, "Thử lại"), "phải có nút Thử lại");
        assert.ok(!text.includes("quá thời gian"), "lỗi mạng không được hiện thông báo timeout");
      } finally {
        teardown(mounted);
      }
    } finally {
      restore();
    }
  });

  it("SC4-UI: adapter ném kind 'timeout' -> title 'Kết nối quá thời gian chờ' (theo kind, không dò message)", async () => {
    // Message không chứa chữ "thời gian" — title timeout phải đến từ kind.
    const timeoutKindAdapter = {
      mode: "zalo",
      getBackendHealth: async () => {
        throw new ApiError("abort-sentinel-no-timeout-text", 0, "timeout");
      },
      getBackendReady: async () => "ok",
    };
    const { ctx } = makeCtx({ demo: false, adapter: timeoutKindAdapter });
    const mounted = await mountAndSettle(ctx);
    try {
      const text = textOf(mounted.el);
      assert.ok(text.includes("Kết nối quá thời gian chờ"), `title timeout: ${text}`);
      assert.ok(findButton(mounted.el, "Thử lại"));
      assert.ok(!text.includes("Giả lập:"), "production không có nút giả lập");
    } finally {
      teardown(mounted);
    }
  });

  it("SC5-UI: health ok + ready 503 unavailable -> 'Máy chủ chưa sẵn sàng' (không phải lỗi mạng/timeout)", async () => {
    const restore = stubFetch((input) => {
      const url = typeof input === "string" ? input : String(input && input.url);
      if (url.includes("/api/v1/ready/")) {
        return Promise.resolve(jsonResponse({ status: "unavailable" }, { status: 503 }));
      }
      return Promise.resolve(okResponse());
    });
    try {
      const adapter = createZaloAdapter({ baseUrl: OK_BASE });
      const { ctx } = makeCtx({ demo: false, adapter });
      const mounted = await mountAndSettle(ctx);
      try {
        const text = textOf(mounted.el);
        assert.ok(text.includes("Máy chủ chưa sẵn sàng"), `title unavailable: ${text}`);
        assert.ok(!text.includes("Chưa kết nối được máy chủ"));
        assert.ok(!text.includes("quá thời gian"));
        assert.ok(!text.includes("Đã kết nối tới máy chủ"));
      } finally {
        teardown(mounted);
      }
    } finally {
      restore();
    }
  });

  it("SC6-UI: health + ready đều ok -> badge 'Đã kết nối tới máy chủ'", async () => {
    const restore = stubFetch(() => Promise.resolve(okResponse()));
    try {
      const adapter = createZaloAdapter({ baseUrl: OK_BASE });
      const { ctx } = makeCtx({ demo: false, adapter });
      const mounted = await mountAndSettle(ctx);
      try {
        const text = textOf(mounted.el);
        assert.ok(text.includes("Đã kết nối tới máy chủ"), `badge success: ${text}`);
        assert.ok(!text.includes("fb-error"), "không được có ErrorState");
      } finally {
        teardown(mounted);
      }
    } finally {
      restore();
    }
  });

  it("SC7-UI: 200 nhưng json() hỏng -> kind 'invalid_response' -> 'Không kiểm tra được kết nối'", async () => {
    const restore = stubFetch(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token '<'");
        },
      }),
    );
    try {
      const adapter = createZaloAdapter({ baseUrl: OK_BASE });
      const { ctx } = makeCtx({ demo: false, adapter });
      const mounted = await mountAndSettle(ctx);
      try {
        const text = textOf(mounted.el);
        assert.ok(text.includes("Không kiểm tra được kết nối"), `title invalid_response: ${text}`);
        assert.ok(!text.includes("quá thời gian"), "JSON hỏng không được hiện thông báo timeout");
      } finally {
        teardown(mounted);
      }
    } finally {
      restore();
    }
  });

  it("SC8-UI: destroy khi request đang treo -> vẫn loading, không render stale khi request hoàn tất sau đó", async () => {
    // Fetch treo: promise không resolve; giữ deferred để hoàn tất có kiểm soát
    // sau assert (tránh bỏ lại timer 15s của client treo event loop).
    let mounted = null;
    const pending = [];
    const restore = stubFetch(
      () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
    );
    try {
      const adapter = createZaloAdapter({ baseUrl: OK_BASE });
      const { ctx } = makeCtx({ demo: false, adapter });
      mounted = mountConnectionPage(ctx);
      connectionCheck.destroy(); // rời trang ngay khi request đang chạy
      await wait(120);
      const loadingText = "Đang kiểm tra kết nối với máy chủ…";
      assert.ok(textOf(mounted.el).includes(loadingText), "phải vẫn loading sau destroy");
      assert.ok(!textOf(mounted.el).includes("Không kiểm tra được kết nối"));
      assert.ok(!textOf(mounted.el).includes("Đã kết nối tới máy chủ"));
      // Request hoàn tất SAU destroy — stale-guard không được render gì thêm.
      for (const { resolve } of pending.splice(0)) resolve(okResponse());
      await wait(120);
      for (const { resolve } of pending.splice(0)) resolve(okResponse());
      await wait(120);
      assert.ok(
        textOf(mounted.el).includes(loadingText),
        "sau khi request hậu destroy hoàn tất, màn vẫn phải giữ loading",
      );
      assert.ok(!textOf(mounted.el).includes("Đã kết nối tới máy chủ"));
    } finally {
      if (mounted) teardown(mounted);
      restore();
    }
  });

  it("SC9-UI: lỗi mạng -> bấm 'Thử lại' sau khi backend hồi phục -> 'Đã kết nối tới máy chủ'", async () => {
    let backendUp = false;
    const restore = stubFetch(() => {
      if (!backendUp) return Promise.reject(new TypeError("Failed to fetch"));
      return Promise.resolve(okResponse());
    });
    try {
      const adapter = createZaloAdapter({ baseUrl: OK_BASE });
      const { ctx } = makeCtx({ demo: false, adapter });
      const mounted = await mountAndSettle(ctx);
      try {
        assert.ok(textOf(mounted.el).includes("Chưa kết nối được máy chủ"));
        backendUp = true; // "backend hồi phục"
        const retry = findButton(mounted.el, "Thử lại");
        assert.ok(retry, "phải có nút Thử lại");
        retry.click();
        await wait(120);
        assert.ok(textOf(mounted.el).includes("Đã kết nối tới máy chủ"), "thử lại phải thành công");
      } finally {
        teardown(mounted);
      }
    } finally {
      restore();
    }
  });

  it("SC10-UI (khóa regression): ApiError cũ KHÔNG kind, status 0 -> lỗi chung, KHÔNG bao giờ timeout", async () => {
    const legacyAdapter = {
      mode: "zalo",
      getBackendHealth: async () => {
        throw new ApiError("Lỗi lạ.", 0); // ApiError cũ: không có thuộc tính kind
      },
      getBackendReady: async () => "ok",
    };
    const { ctx } = makeCtx({ demo: false, adapter: legacyAdapter });
    const mounted = await mountAndSettle(ctx);
    try {
      const text = textOf(mounted.el);
      assert.ok(text.includes("Không kiểm tra được kết nối"), `title lỗi chung: ${text}`);
      assert.ok(!text.includes("quá thời gian"), "lỗi không kind không bao giờ được coi là timeout");
      assert.ok(!text.includes("Kết nối quá thời gian chờ"));
      assert.ok(findButton(mounted.el, "Thử lại"));
    } finally {
      teardown(mounted);
    }
  });

  it("SC11-UI (demo): bấm 'Giả lập: timeout' (mock adapter thật + rebuildAdapter) -> ~4.5s sau hiện title timeout", async () => {
    const adapter = createMockAdapter({ scenario: null });
    const { ctx } = makeCtx({ demo: true, adapter });
    const mounted = await mountAndSettle(ctx, 1600); // mock latency 450ms x2
    try {
      assert.ok(
        textOf(mounted.el).includes("Đã kết nối tới máy chủ"),
        "tiền đề: mock scenario null phải thành công trước",
      );
      const timeoutBtn = findButton(mounted.el, "Giả lập: timeout");
      assert.ok(timeoutBtn, "demo phải có nút 'Giả lập: timeout'");
      timeoutBtn.click(); // rebuildAdapter("timeout") + chạy lại kiểm tra
      // Mock timeout: wait(4000+500) rồi ném ApiError kind "timeout" — chờ THẬT.
      await wait(5400);
      const text = textOf(mounted.el);
      assert.ok(text.includes("Kết nối quá thời gian chờ"), `demo timeout: ${text}`);
      assert.ok(findButton(mounted.el, "Thử lại"));
    } finally {
      teardown(mounted);
    }
  });
});
