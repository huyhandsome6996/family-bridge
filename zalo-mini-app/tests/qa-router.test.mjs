// tests/qa-router.test.mjs — QA Task 4: router hash-based.
//  1) Route không tồn tại -> trang not-found (id "not-found", data-page="not-found").
//  2) Guard requiresRole: chưa chọn vai trò -> redirect #/role-select.
//  3) Đã có vai trò -> /home render + bottom-nav với aria-current="page".
//  4) Hash có query (#/help?x=1) parse được; điều hướng liên tiếp không crash.
//  5) router.stop() gọi page.destroy -> pending cập nhật bị chặn (connection-check).
//
// Pattern happy-dom giống tests/pages.test.mjs: gắn globals TRƯỚC import động.

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

const { createRouter, routes, parseHash, navigate } = await import("../src/app/router.js");
const { initStore, setRole, resetState, getState } = await import("../src/app/store.js");
const { createMockAdapter } = await import("../src/core/adapter/mock-adapter.js");
const { setSession } = await import("../src/core/session.js");
const notFoundModule = await import("../src/pages/not-found/index.js");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await wait(25);
  }
  return false;
}

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

beforeEach(() => {
  initStore({ demoMode: false });
  resetState();
  domWindow.location.hash = "";
  document.body.innerHTML = "";
  root = null;
  router = null;
});

describe("QA: router hash + not-found", () => {
  it("login keeps the same focused input and text on repeated host hash events", async () => {
    domWindow.location.hash = "#/login";
    const r = freshRouter();
    r.start();
    try {
      assert.ok(await waitFor(() => root.querySelector("#fb-cred-code")));
      const input = root.querySelector("#fb-cred-code");
      input.focus();
      for (const char of "HS001") {
        input.value += char;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        window.dispatchEvent(new Event("resize"));
        window.dispatchEvent(new HashChangeEvent("hashchange"));
        await wait(10);
        assert.equal(root.querySelector("#fb-cred-code"), input);
        assert.equal(document.activeElement, input);
      }
      assert.equal(input.value, "HS001");
      navigate("/help");
      assert.ok(await waitFor(() => root.querySelector('[data-page="help"]')));
      assert.equal(root.querySelector("#fb-cred-code"), null);
    } finally { r.stop(); }
  });

  it("login Next moves focus without submitting; IME composition never authenticates", async () => {
    const { createCredentialForm } = await import("../src/pages/login/credential-form.js");
    let calls = 0;
    const { form } = createCredentialForm({ onLogin: async () => { calls += 1; } });
    document.body.appendChild(form);
    const code = form.querySelector("#fb-cred-code");
    const password = form.querySelector("#fb-cred-password");
    code.value = "PH001";
    password.value = "synthetic-only";
    code.focus();
    code.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
    assert.equal(document.activeElement, password);
    assert.equal(calls, 0);
    password.dispatchEvent(new Event("compositionstart", { bubbles: true }));
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    assert.equal(calls, 0);
    password.dispatchEvent(new Event("compositionend", { bubbles: true }));
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    assert.equal(calls, 1);
  });

  it("password visibility preserves input focus, selection and value", async () => {
    const { createCredentialForm } = await import("../src/pages/login/credential-form.js");
    const { form } = createCredentialForm();
    document.body.appendChild(form);
    const password = form.querySelector("#fb-cred-password");
    const eye = form.querySelector(".fb-cred__eye");
    password.value = "synthetic-only";
    password.focus();
    password.setSelectionRange(3, 5);
    const pointer = new Event("pointerdown", { cancelable: true });
    eye.dispatchEvent(pointer);
    assert.equal(pointer.defaultPrevented, true);
    eye.click();
    assert.equal(password.type, "text");
    assert.equal(document.activeElement, password);
    assert.equal(password.selectionStart, 3);
    assert.equal(password.selectionEnd, 5);
    assert.equal(password.value, "synthetic-only");
  });

  it("routes không có '/abc' -> parseHash trả '/abc'", () => {
    domWindow.location.hash = "#/abc";
    assert.equal(routes["/abc"], undefined);
    const { path } = parseHash();
    assert.equal(path, "/abc");
  });

  it("hash '#/abc' -> render trang not-found (id 'not-found')", async () => {
    domWindow.location.hash = "#/abc";
    const r = freshRouter();
    await r.render();
    assert.equal(notFoundModule.page.id, "not-found");
    const pageEl = root.querySelector('[data-page="not-found"]');
    assert.ok(pageEl, "phải render trang not-found");
    assert.equal(document.title, "Không tìm thấy trang");
    assert.ok(
      Array.from(root.querySelectorAll("button")).find((b) =>
        (b.textContent || "").includes("Về màn hình đầu"),
      ),
      "not-found phải có lối về màn hình đầu",
    );
  });

  it("hash rỗng -> mặc định '/' -> welcome", async () => {
    const r = freshRouter();
    await r.render();
    assert.ok(root.querySelector('[data-page="u01-welcome"]'), "route '/' phải là welcome");
  });
});

describe("QA: guard requiresRole", () => {
  it("chưa có vai trò vào /home -> redirect #/role-select, không render home", async () => {
    assert.equal(getState().role, null);
    domWindow.location.hash = "#/home";
    const r = freshRouter();
    await r.render(); // lần 1: guard chặn -> chỉ đổi hash
    assert.equal(domWindow.location.hash, "#/role-select", "phải redirect về role-select");
    assert.equal(root.querySelector('[data-page="u08-home"]'), null, "không render home");
    await r.render(); // hashchange thật sẽ render lại -> trang role-select
    assert.ok(root.querySelector('[data-page="u04-role-select"]'));
  });

  it("đã có vai trò -> /home render kèm bottom-nav + aria-current đúng mục", async () => {
    setRole("student");
    domWindow.location.hash = "#/home";
    const r = freshRouter();
    await r.render();
    assert.ok(root.querySelector('[data-page="u08-home"]'), "home phải render");
    const nav = root.querySelector(".fb-bottom-nav");
    assert.ok(nav, "home phải có bottom-nav (showBottomNav)");
    const current = nav.querySelector('[aria-current="page"]');
    assert.ok(current, "item active phải có aria-current='page'");
    assert.equal(current.getAttribute("href"), "#/home");
  });
});

describe("QA: hash query + điều hướng liên tiếp không crash", () => {
  it("parseHash đọc query trong hash (#/help?x=1)", async () => {
    domWindow.location.hash = "#/help?x=1";
    const { path, params } = parseHash();
    assert.equal(path, "/help");
    assert.equal(params.get("x"), "1");
    const r = freshRouter();
    await r.render();
    assert.ok(root.querySelector('[data-page="help"]'));
  });

  it("nhảy liên tiếp not-found -> welcome -> help không ném lỗi", async () => {
    const r = freshRouter();
    domWindow.location.hash = "#/khong-ton-tai";
    await r.render();
    assert.ok(root.querySelector('[data-page="not-found"]'));
    domWindow.location.hash = "#/welcome";
    await r.render();
    assert.ok(root.querySelector('[data-page="u01-welcome"]'));
    domWindow.location.hash = "#/help";
    await r.render();
    assert.ok(root.querySelector('[data-page="help"]'));
  });

  it("navigate() tới cùng hash không crash (HashChangeEvent được dispatch)", async () => {
    domWindow.location.hash = "#/welcome";
    const r = freshRouter();
    await r.render();
    assert.doesNotThrow(() => navigate("/welcome"));
    assert.doesNotThrow(() => navigate("#/help"));
  });
});

describe("QA: router.stop() gọi page.destroy và chặn pending cập nhật", () => {
  it("connection-check: stop giữa chừng -> DOM giữ nguyên trạng thái loading", async () => {
    domWindow.location.hash = "#/connection-check";
    const r = freshRouter();
    await r.render();
    const pageEl = root.querySelector('[data-page="connection-check"]');
    assert.ok(pageEl, "connection-check phải render");
    const snapshot = pageEl.innerHTML;
    assert.ok(
      (pageEl.textContent || "").includes("Đang kiểm tra kết nối với máy chủ…"),
      "bắt đầu ở trạng thái loading",
    );

    r.stop(); // cleanup = page.destroy của connection-check

    await wait(2200); // mock cần ~1s để health+ready xong
    assert.equal(pageEl.innerHTML, snapshot, "không được cập nhật DOM sau stop/destroy");
    assert.ok(
      !(pageEl.textContent || "").includes("Đã kết nối tới máy chủ"),
      "không được render kết quả sau khi đã rời app",
    );
  });

  it("start() render theo hash hiện tại; stop() gỡ listener", async () => {
    // PIN UPDATE (task 3-b4, M5a): mailbox w14 là trang chrome "app" +
    // requiresAuth (phiên web sống) — guard yêu cầu phiên trước khi vào
    // #/mailbox, nên test đặt phiên sống trước khi start router.
    setSession({ token: "t-router", userId: "u-router", expiresAt: Date.now() + 3600_000 });
    domWindow.location.hash = "#/mailbox";
    setRole("student"); // mailbox requiresRole
    const r = freshRouter();
    r.start(); // gọi render không await
    const ok = await waitFor(() => root.querySelector('[data-page="mailbox"]'));
    assert.ok(ok, "start() phải render trang theo hash");
    assert.ok(root.querySelector(".fb-bottom-nav"), "mailbox phải có bottom-nav");
    r.stop();
  });
});
