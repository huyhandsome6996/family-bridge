// tests/router.test.mjs — port web (task 19-a + W2-b): bảng route của web GIỮ
// NGUYÊN mini + pattern ":param" + guard requiresAuth/requiresRole đúng thứ tự.
// 8 trang cards/signal/message/mailbox/compose/proposal/
// settings/privacy đã được W2-b port THÀNH TRANG THẬT (thay stub) — meta giữ
// NGUYÊN mini (requiresAuth 7 trang phiên lớp học + compose tự kiểm tra phiên
// trong render), nên mọi assertion meta của 19-a giữ nguyên giá trị.
// Task 3-c (P2-1/QA-3): +1 route "/privacy-items" (F15, parity mini — route
// từng mồ côi ở mini và thiếu hẳn ở web; giờ cả 2 client đều có).
//
// Pattern happy-dom giống pages.test.mjs: gắn globals TRƯỚC khi import động.

import { register } from "node:module";
await register(new URL("./asset-hook.mjs", import.meta.url));
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
globalThis.KeyboardEvent = domWindow.KeyboardEvent;
globalThis.MouseEvent = domWindow.MouseEvent;
globalThis.HashChangeEvent = domWindow.HashChangeEvent;
globalThis.location = domWindow.location;

const { describe, it, beforeEach } = await import("node:test");
const assert = (await import("node:assert/strict")).default;

const { createRouter, routes, parseHash, matchPattern, navigate } =
  await import("../src/app/router.js");
const { initStore, setRole, resetState, getState } = await import("../src/app/store.js");
const { createMockAdapter } = await import("../src/adapter/web-adapter.js");
const { setSession } = await import("../src/core/session.js");
const notFoundModule = await import("../src/pages/not-found/index.js");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------- route table
// 27 hash path: bảng mini (gồm /privacy-items F15) + admin-provision +
// supporters/appointments (F11/F12, 19/10/2026) + 2 route F07 web parity
// (quyết định Huy: /mood + /mood-shared, UI tree web độc lập — route mapping
// giống Mini App). "/privacy-items" thêm Task 3-c theo parity mini.
const EXPECTED_ROUTES = [
  "/", "/welcome", "/how-to-use", "/role-select", "/home", "/companion",
  "/mailbox", "/diary", "/profile", "/connection-check", "/help",
  "/login", "/consent", "/connect", "/compose",
  "/cards", "/signal", "/messages/:id", "/proposal", "/settings", "/privacy",
  "/privacy-items",
  "/admin-provision", "/supporters", "/appointments",
  "/mood", "/mood-shared",
];

// 8 trang phức tạp (W2-b: trang thật thay stub) — GIỮ NGUYÊN meta mini.
const W2B_ROUTES = [
  ["/cards", { id: "cards", requiresAuth: true, showBottomNav: true, chrome: "app" }],
  ["/signal", { id: "signal", requiresAuth: true, showBottomNav: true, chrome: "app" }],
  ["/messages/:id", { id: "message", requiresAuth: true, showBottomNav: false, chrome: "app" }],
  ["/mailbox", { id: "mailbox", requiresAuth: true, showBottomNav: true, chrome: "app" }],
  ["/proposal", { id: "proposal", requiresAuth: true, showBottomNav: true, chrome: "app" }],
  ["/settings", { id: "settings", requiresAuth: true, showBottomNav: true, chrome: "app" }],
  ["/privacy", { id: "privacy", requiresAuth: true, showBottomNav: true, chrome: "app" }],
  // R04 (QA F04 18/10): compose render trong app-shell desktop như 7 trang
  // còn lại — trước đây bare + showBottomNav false khiến desktop 1440px mất
  // shell, .fb-page cap 480px, textarea 52px. requiresAuth vẫn false (tự
  // kiểm tra phiên trong render, giữ nguyên semantics mini).
  ["/compose", { id: "f06-compose", requiresAuth: false, showBottomNav: true, chrome: "app" }],
];

// 13 trang đã port thật (W2-a) — meta khớp mini.
const PORTED_META = [
  ["/", "u01-welcome", { requiresRole: false }],
  ["/welcome", "u01-welcome", { requiresRole: false }],
  ["/how-to-use", "u02-how-to-use", { requiresRole: false }],
  ["/role-select", "u04-role-select", { requiresRole: false }],
  ["/home", "u08-home", { requiresRole: true }],
  ["/companion", "companion", { requiresRole: true }],
  ["/diary", "diary", { requiresRole: true }],
  ["/profile", "profile", { requiresRole: true }],
  ["/connection-check", "connection-check", { requiresRole: false }],
  ["/help", "help", { requiresRole: false }],
  ["/login", "f01-login", { requiresRole: false }],
  ["/consent", "f01-consent", { requiresRole: false }],
  ["/connect", "f01-connect", { requiresRole: false }],
  // Task 3-c: /privacy-items — meta giữ NGUYÊN mini (items.js copy y hệt mini
  // NGOẠI TRỪ 2 chuỗi thông báo: web/tests/qa-web-invariants quét toàn bộ
  // web/src cấm copy "Đã gửi/Đã lưu nháp/Đã lưu/Đã chia sẻ" không có miễn
  // trừ; web đổi thành "Máy chủ xác nhận đã…" — vẫn chỉ hiện SAU khi máy chủ
  // xác nhận). requiresRole như mini, không chrome đặc biệt.
  ["/privacy-items", "f15-items", { requiresRole: true }],
];

describe("Route table: 27 hash path (bảng mini + admin-provision + supporters/appointments + 2 F07 + 1 F15 items)", () => {
  it("đúng 27 route, không thêm/bớt", () => {
    assert.equal(Object.keys(routes).length, 27);

    assert.deepEqual(Object.keys(routes).sort(), [...EXPECTED_ROUTES].sort());
  });

  it("mỗi route là hàm loader trả Promise module có page contract", async () => {
    for (const [path, loader] of Object.entries(routes)) {
      assert.equal(typeof loader, "function", `loader của ${path}`);
      const mod = await loader();
      assert.ok(mod && typeof mod.page === "object", `${path} phải export page`);
      assert.equal(typeof mod.page.render, "function", `${path} page.render`);
      assert.equal(typeof mod.page.id, "string", `${path} page.id`);
      assert.equal(typeof mod.page.title, "string", `${path} page.title`);
    }
  });

  it("8 trang W2-b giữ meta mini (requiresAuth + chrome app)", async () => {
    for (const [path, meta] of W2B_ROUTES) {
      const mod = await routes[path]();
      assert.equal(mod.page.id, meta.id, `${path}: id`);
      // Boolean() theo đúng semantics của guard router (compose thật của mini
      // không khai báo requiresAuth — undefined ≡ false với truthiness guard).
      assert.equal(Boolean(mod.page.requiresAuth), meta.requiresAuth, `${path}: requiresAuth`);
      assert.equal(mod.page.showBottomNav, meta.showBottomNav, `${path}: showBottomNav`);
      if (meta.chrome) assert.equal(mod.page.chrome, meta.chrome, `${path}: chrome`);
      // Trang thật giữ đúng meta mini (không phải stub trung gian).
      assert.equal(mod.page.requiresRole, true, `${path}: vẫn requiresRole như mini`);
    }
  });

  it("13 trang port giữ meta mini", async () => {
    for (const [path, id, meta] of PORTED_META) {
      const mod = await routes[path]();
      assert.equal(mod.page.id, id, `${path}: id`);
      if ("requiresRole" in meta) {
        assert.equal(mod.page.requiresRole, meta.requiresRole, `${path}: requiresRole`);
      }
    }
  });
});

describe("Pattern route /messages/:id", () => {
  it("matchPattern khớp đúng một segment và decode URI", () => {
    assert.deepEqual(matchPattern("/messages/:id", "/messages/abc-123"), { id: "abc-123" });
    assert.deepEqual(matchPattern("/messages/:id", "/messages/t%C3%A0i"), { id: "tài" });
    assert.equal(matchPattern("/messages/:id", "/messages"), null);
    assert.equal(matchPattern("/messages/:id", "/messages/a/b"), null);
    assert.equal(matchPattern("/messages/:id", "/other/abc"), null);
  });

  it("/messages/abc khớp route pattern (exact miss -> pattern)", async () => {
    assert.equal(routes["/messages/abc"], undefined);
    const mod = await routes["/messages/:id"]();
    assert.equal(mod.page.id, "message");
  });
});

describe("parseHash + guard", () => {
  it("hash rỗng -> '/'", () => {
    domWindow.location.hash = "";
    const { path } = parseHash();
    assert.equal(path, "/");
  });

  it("hash query (#/help?x=1) parse được", () => {
    domWindow.location.hash = "#/help?x=1";
    const { path, params } = parseHash();
    assert.equal(path, "/help");
    assert.equal(params.get("x"), "1");
  });

  it("navigate() tới cùng hash không crash", () => {
    domWindow.location.hash = "#/welcome";
    assert.doesNotThrow(() => navigate("/welcome"));
    assert.doesNotThrow(() => navigate("#/help"));
  });
});

// ---------------------------------------------------------------- router mount
function makeCtx() {
  const adapter = createMockAdapter({ scenario: null });
  return {
    store: { getState, setRole },
    adapter,
    navigate,
    setRole: (role) => (role === null ? resetState() : setRole(role)),
    rebuildAdapter: (scenario) => Object.assign(adapter, createMockAdapter({ scenario })),
  };
}

let root;
let router;

function freshRouter() {
  if (router) router.stop();
  root = document.createElement("div");
  document.body.appendChild(root);
  router = createRouter({ root, ctx: makeCtx() });
  return router;
}

async function waitFor(predicate, timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await wait(25);
  }
  return false;
}

beforeEach(() => {
  initStore({ demoMode: false });
  resetState();
  domWindow.location.hash = "";
  document.body.innerHTML = "";
  root = null;
  router = null;
});

describe("Router render (happy-dom)", () => {
  it("hash '#/abc' -> render trang not-found", async () => {
    domWindow.location.hash = "#/abc";
    const r = freshRouter();
    await r.render();
    assert.equal(notFoundModule.page.id, "not-found");
    assert.ok(root.querySelector('[data-page="not-found"]'), "phải render not-found");
    assert.equal(document.title, "Không tìm thấy trang");
  });

  it("hash rỗng -> welcome", async () => {
    const r = freshRouter();
    await r.render();
    assert.ok(root.querySelector('[data-page="u01-welcome"]'));
  });

  it("requiresRole: chưa chọn vai trò vào /home -> redirect #/role-select", async () => {
    assert.equal(getState().role, null);
    domWindow.location.hash = "#/home";
    const r = freshRouter();
    await r.render();
    assert.equal(domWindow.location.hash, "#/role-select");
    assert.equal(root.querySelector('[data-page="u08-home"]'), null);
    await r.render();
    assert.ok(root.querySelector('[data-page="u04-role-select"]'));
  });

  it("requiresAuth TRƯỚC requiresRole: trang /mailbox không phiên -> redirect /login?reason=expired", async () => {
    domWindow.location.hash = "#/mailbox";
    const r = freshRouter();
    await r.render();
    assert.equal(domWindow.location.hash, "#/login?reason=expired");
    assert.equal(root.querySelector('[data-page="mailbox"]'), null,
      "không render trang khi chưa có phiên (guard chạy trước)");
  });

  it("đã có phiên + vai trò -> /mailbox render TRANG THẬT trong app-shell, dữ liệu qua adapter", async () => {
    setSession({ token: "t-router", userId: "u-router", expiresAt: Date.now() + 3600_000 });
    setRole("student");
    domWindow.location.hash = "#/mailbox";
    const r = freshRouter();
    r.start();
    const ok = await waitFor(() => root.querySelector('[data-page="mailbox"]'));
    assert.ok(ok, "trang mailbox phải render sau guard");
    assert.ok(root.querySelector('[data-shell="app"]'), "chrome app -> bọc app-shell");
    // Trang thật (W2-b): chờ adapter (mock shared) trả dữ liệu rồi render heading thật.
    const loaded = await waitFor(
      () => (root.textContent || "").includes("Hộp thư trao đổi thấu cảm"),
    );
    assert.ok(loaded, "mailbox thật phải render heading sau khi tải dữ liệu qua adapter");
    r.stop();
  });

  it("chrome app (home) bọc trong app-shell với sidebar NAV_ITEMS_SIDEBAR", async () => {
    setSession({ token: "t-router", userId: "u-router", expiresAt: Date.now() + 3600_000 });
    setRole("student");
    domWindow.location.hash = "#/home";
    const r = freshRouter();
    r.start();
    const ok = await waitFor(() => root.querySelector('[data-page="u08-home"]'));
    assert.ok(ok, "home phải render");
    const shell = root.querySelector('[data-shell="app"]');
    assert.ok(shell, "home chrome app -> app-shell");
    assert.ok(root.querySelector(".fb-sidebar"), "app-shell có sidebar");
    r.stop();
  });
});
