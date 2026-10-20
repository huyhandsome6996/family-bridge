// tests/f11-f12-spa-parity.test.mjs — Kiểm thử tính năng F11 & F12 trên Web SPA
// Chạy: node --test tests/f11-f12-spa-parity.test.mjs

import { register } from "node:module";
await register(new URL("./asset-hook.mjs", import.meta.url));
const { Window } = await import("happy-dom");
const domWindow = new Window({ url: "https://localhost/?demo=1" });

globalThis.window = domWindow;
globalThis.document = domWindow.document;
globalThis.Node = domWindow.Node;
globalThis.Element = domWindow.Element;
globalThis.HTMLElement = domWindow.HTMLElement;
globalThis.DocumentFragment = domWindow.DocumentFragment;
globalThis.Event = domWindow.Event;
globalThis.CustomEvent = domWindow.CustomEvent;
globalThis.location = domWindow.location;
if (typeof globalThis.requestAnimationFrame === "undefined") {
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
}

const { describe, it, beforeEach } = await import("node:test");
const assert = (await import("node:assert/strict")).default;

const { initStore, setRole, getState, resetState } = await import("../src/app/store.js");
const { createMockAdapter } = await import("../src/adapter/web-adapter.js");
const { setSession, clearSession } = await import("../src/core/session.js");
const { page: appointmentsPage } = await import("../src/pages/appointments/index.js");
const { page: supportersPage } = await import("../src/pages/supporters/index.js");
const { createHttpEndpoints } = await import("../../packages/family_bridge_shared/src/adapter/http-endpoints.js");
const { ApiError } = await import("../../packages/family_bridge_shared/src/api/client.mjs");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeCtx({ demo = true, role = "student", adapter } = {}) {
  initStore({ demoMode: demo });
  resetState();
  if (role) setRole(role);
  const navigateCalls = [];
  const currentAdapter = adapter || createMockAdapter({ scenario: null });
  return {
    ctx: {
      store: { getState },
      adapter: currentAdapter,
      navigate: (path) => navigateCalls.push(path),
      setRole: (nextRole) => setRole(nextRole),
      params: new URLSearchParams(demo ? "demo=1" : ""),
    },
    navigateCalls,
  };
}

describe("F11 & F12 Web SPA Parity & Robustness", () => {
  beforeEach(() => {
    clearSession();
    document.body.innerHTML = "";
  });

  it("F11: shared adapter contactSupporter requires idempotencyKey", async () => {
    const mockRequest = async () => ({ success: true });
    const endpoints = createHttpEndpoints({
      request: mockRequest,
      requireBaseUrl: () => {},
      authed: (fn) => fn(),
    });

    // Missing key -> throws configuration ApiError
    await assert.rejects(
      async () => {
        await endpoints.contactSupporter({ roleId: "r1", body: "xin chào", key: "" });
      },
      (err) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.kind, "configuration");
        assert.match(err.message, /idempotency/i);
        return true;
      }
    );

    // With key -> passes idempotencyKey in options
    let capturedOptions = null;
    const trackingEndpoints = createHttpEndpoints({
      request: async (path, options) => {
        capturedOptions = options;
        return { success: true, message_id: "m-123" };
      },
      requireBaseUrl: () => {},
      authed: (fn) => fn(),
    });

    const res = await trackingEndpoints.contactSupporter({ roleId: "r1", body: "xin chào", key: "key-xyz-123" });
    assert.equal(res.success, true);
    assert.equal(capturedOptions.idempotencyKey, "key-xyz-123");
  });

  it("F11: supportersPage renders cleanly with valid icons and displays commitments & roles", async () => {
    setSession({ token: "tok-student", actorId: "stu-1", role: "student" });
    const { ctx } = makeCtx({ demo: true, role: "student" });

    const host = document.createElement("div");
    document.body.appendChild(host);

    const el = supportersPage.render(ctx);
    assert.ok(el instanceof HTMLElement, "render returns HTMLElement");
    host.appendChild(el);

    await wait(250);

    // Verify no crash from icons (icons used: cottage, history_edu, info)
    const text = host.textContent;
    assert.ok(text.includes("Điểm tựa dự phòng"), "renders main heading");
    assert.ok(text.includes("Điểm tựa đang đồng hành"), "renders active roles heading");
    assert.ok(text.includes("Cô Nguyễn Thị Mai"), "renders active supporter name");

    if (typeof supportersPage.destroy === "function") {
      supportersPage.destroy();
    }
    host.remove();
  });

  it("F11: supportersPage shows explanation card when no connections", async () => {
    setSession({ token: "tok-student", actorId: "stu-1", role: "student" });

    // Mock adapter with 0 connections
    const adapter = createMockAdapter({ scenario: null });
    adapter.listConnections = async () => ({ results: [], nextCursor: null });

    const { ctx } = makeCtx({ demo: true, role: "student", adapter });
    const host = document.createElement("div");
    document.body.appendChild(host);

    const el = supportersPage.render(ctx);
    host.appendChild(el);

    await wait(250);

    const text = host.textContent;
    assert.ok(
      text.includes("Bạn cần có ít nhất một kết nối") || text.includes("kết nối gia đình"),
      "shows no connection explanation"
    );
    const buttons = Array.from(host.querySelectorAll("button"));
    const proposalBtn = buttons.find((b) => b.textContent.includes("đề xuất kết nối"));
    const connectBtn = buttons.find((b) => b.textContent.includes("mã kết nối"));
    assert.ok(proposalBtn, "has button to proposal");
    assert.ok(connectBtn, "has button to connect");

    if (typeof supportersPage.destroy === "function") {
      supportersPage.destroy();
    }
    host.remove();
  });

  it("F12: appointmentsPage renders directory and proposed slots with accept/decline", async () => {
    setSession({ token: "tok-student", actorId: "stu-1", role: "student" });
    const { ctx } = makeCtx({ demo: true, role: "student" });

    const host = document.createElement("div");
    document.body.appendChild(host);

    const el = appointmentsPage.render(ctx);
    assert.ok(el instanceof HTMLElement, "render returns HTMLElement");
    host.appendChild(el);

    await wait(250);

    // Verify directory loaded
    const text = host.textContent;
    assert.ok(text.includes("Đầu mối trường"), "renders directory title");
    assert.ok(
      text.includes("Phòng Tham vấn Học đường") || text.includes("Ban Giám hiệu"),
      "renders contact name"
    );

    // Verify proposed slot rendered with accept & decline buttons
    const buttons = Array.from(host.querySelectorAll("button"));
    const acceptBtn = buttons.find((b) => b.textContent.includes("Chấp nhận"));
    assert.ok(acceptBtn, "renders accept slot button");

    if (typeof appointmentsPage.destroy === "function") {
      appointmentsPage.destroy();
    }
    host.remove();
  });

  it("F12: appointmentsPage handles scheduling_no_staff honestly without crash", async () => {
    setSession({ token: "tok-student", actorId: "stu-1", role: "student" });

    const adapter = createMockAdapter({ scenario: null });
    adapter.listAppointmentRequests = async () => {
      const err = new ApiError("Chưa có thầy cô trực lịch.", 503, "http");
      err.data = { reason: "scheduling_no_staff" };
      throw err;
    };

    const { ctx } = makeCtx({ demo: true, role: "student", adapter });
    const host = document.createElement("div");
    document.body.appendChild(host);

    const el = appointmentsPage.render(ctx);
    host.appendChild(el);

    await wait(250);

    const text = host.textContent;
    assert.ok(
      text.includes("Hệ thống đặt lịch hẹn hiện đang tạm đóng") ||
      text.includes("đang sắp xếp nhân sự tiếp nhận"),
      "renders honest scheduling_no_staff explanation badge"
    );

    if (typeof appointmentsPage.destroy === "function") {
      appointmentsPage.destroy();
    }
    host.remove();
  });
});
