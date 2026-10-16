// tests/hs-ph-zalo-release.test.mjs — Kiểm thử toàn diện bản phát hành HS/PH trong Zalo Mini App.
// Yêu cầu bắt buộc của Huy (16/10/2026):
//  1. Trong host Zalo (isZaloHost), người dùng mở /login thấy form HS/PH thật (mã tài khoản + mật khẩu).
//  2. Submit gửi POST /api/v1/auth/class-session qua loginWithCredentials; zmp-sdk và loginWithZaloToken KHÔNG bị gọi.
//  3. Backend zalo=true hay zalo=false đều KHÔNG mở màn Zalo cũ.
//  4. Implementation màn hình và nút "Đăng nhập bằng Zalo" cũ được bảo tồn nguyên vẹn trong module legacy,
//     nhưng bị gate compile-time (LEGACY_ZALO_LOGIN_ENABLED = false) và không có route/link nào mở được.
//  5. Startup không silent SDK login ngầm.
//  6. Sai mật khẩu / không tìm thấy tài khoản / lỗi mạng hiển thị thông báo trung thực.

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
globalThis.location = domWindow.location;
if (typeof globalThis.requestAnimationFrame === "undefined") {
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
}

const { describe, it } = await import("node:test");
const assert = (await import("node:assert/strict")).default;

const { clearSession, hasLiveSession, setSession } = await import("../src/core/session.js");
const { initStore, getState, setRole, resetState } = await import("../src/app/store.js");
const loginPage = (await import("../src/pages/login/index.js")).page;
const { renderLegacyZaloLogin, LEGACY_ZALO_LOGIN_ENABLED } = await import("../src/pages/login/legacy-zalo-login.js");
const { getLoginStartupPlan, getLegacyZaloSilentLoginCondition } = await import("../src/core/login-startup.js");
const { routes } = await import("../src/app/router.js");
const { ApiError } = await import("../src/core/api/client.mjs");

function textOf(el) {
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

function findButton(root, needle) {
  return Array.from(root.querySelectorAll("button")).find(
    (btn) => textOf(btn).includes(needle),
  );
}

function mount(pageModule, ctx) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const el = pageModule.render(ctx);
  host.appendChild(el);
  return { host, el };
}

function unmount(host) {
  host.remove();
}

function makeCtx({ demo = false, adapter = {} } = {}) {
  initStore({ demoMode: demo });
  const navigateCalls = [];
  return {
    navigateCalls,
    ctx: {
      store: { getState, setRole },
      navigate: (path) => navigateCalls.push(path),
      setRole: (role) => {
        if (role === null) resetState();
        else setRole(role);
        return getState();
      },
      adapter: {
        getCapabilities: async () => ({
          login_methods: { local_class: true, zalo: false },
        }),
        listConsents: async () => [],
        loginWithCredentials: async ({ code, password }) => {
          setSession({
            token: "valid-class-token",
            userId: "hs001-uuid",
            displayName: "Học sinh 001",
            expiresAt: Date.now() + 3600000,
            consentsRequired: ["service"],
            loginMethod: "class",
          });
          return {
            userId: "hs001-uuid",
            displayName: "Học sinh 001",
            role: "student",
            classRef: "12A1",
          };
        },
        loginWithZaloToken: async () => {
          throw new Error("SDK should NOT be called in HS/PH release");
        },
        ...adapter,
      },
    },
  };
}

describe("Bản phát hành Zalo Mini App HS/PH (16/10/2026)", () => {
  it("trong host Zalo: /login hiển thị form HS/PH (mã tài khoản + mật khẩu), KHÔNG có nút Zalo", async () => {
    clearSession();
    // Giả lập host Zalo
    try {
      domWindow.location.href = "https://h5.zdn.vn/zapps/3411096375330044972/index.html";
    } catch {
      // ignore
    }
    try {
      Object.defineProperty(globalThis.navigator, "userAgent", {
        value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Zalo/24.10.01",
        configurable: true,
      });
    } catch {
      // fallback nếu navigator không configure được
    }
    const { ctx } = makeCtx({ demo: false });
    const { host, el } = mount(loginPage, ctx);

    const text = textOf(el);
    assert.ok(text.includes("Đăng nhập Family Bridge"), "tiêu đề form HS/PH phải hiển thị");
    assert.ok(text.includes("Mã tài khoản"), "phải có trường Mã tài khoản");
    assert.ok(el.querySelector("input#fb-cred-code"), "phải có input mã tài khoản");
    assert.ok(el.querySelector("input#fb-cred-password"), "phải có input mật khẩu");

    // Tuyệt đối không có nút hay chữ 'Đăng nhập bằng Zalo'
    assert.equal(findButton(el, "Đăng nhập bằng Zalo"), undefined, "KHÔNG được có nút Đăng nhập bằng Zalo");
    assert.ok(!text.includes("Đăng nhập bằng Zalo"), "không được chứa văn bản Đăng nhập bằng Zalo");

    unmount(host);
  });

  it("submit form HS/PH thành công: gọi loginWithCredentials, nhận role từ server, chuyển hướng tiếp", async () => {
    clearSession();
    let credentialsCalled = false;
    let zaloSdkCalled = false;

    const { ctx, navigateCalls } = makeCtx({
      demo: false,
      adapter: {
        getCapabilities: async () => ({ login_methods: { local_class: true, zalo: false } }),
        loginWithCredentials: async ({ code, password }) => {
          credentialsCalled = true;
          assert.equal(code, "HS001");
          assert.equal(password, "matkhau123");
          setSession({
            token: "valid-session",
            userId: "student-1",
            expiresAt: Date.now() + 3600000,
            consentsRequired: ["service"],
          });
          return { role: "student", userId: "student-1" };
        },
        loginWithZaloToken: async () => {
          zaloSdkCalled = true;
          throw new Error("SDK forbidden");
        },
        listConsents: async () => [],
      },
    });

    const { host, el } = mount(loginPage, ctx);
    const codeInput = el.querySelector("input#fb-cred-code");
    const passInput = el.querySelector("input#fb-cred-password");
    codeInput.value = "HS001";
    passInput.value = "matkhau123";

    const submitBtn = el.querySelector("button[type=submit]");
    assert.ok(submitBtn, "phải có nút submit form");
    submitBtn.click();

    await new Promise((r) => setTimeout(r, 100));

    assert.equal(credentialsCalled, true, "loginWithCredentials phải được gọi");
    assert.equal(zaloSdkCalled, false, "zmp-sdk loginWithZaloToken TUYỆT ĐỐI không được gọi");
    assert.equal(getState().role, "student", "role phải được gán từ response server");
    assert.ok(navigateCalls.includes("/consent") || navigateCalls.includes("/home"), "phải điều hướng tiếp");

    unmount(host);
    clearSession();
  });

  it("backend trả zalo=true thì bản hiện hành VẪN giữ luồng HS/PH, không mở màn Zalo cũ", async () => {
    clearSession();
    const { ctx } = makeCtx({
      demo: false,
      adapter: {
        getCapabilities: async () => ({ login_methods: { local_class: true, zalo: true } }),
      },
    });
    const { host, el } = mount(loginPage, ctx);
    const text = textOf(el);

    assert.ok(text.includes("Mã tài khoản"), "vẫn phải ở form HS/PH");
    assert.equal(findButton(el, "Đăng nhập bằng Zalo"), undefined, "backend zalo=true KHÔNG được mở lại nút Zalo");
    unmount(host);
  });

  it("local_class unavailable: hiển thị thông báo trung thực, không fallback sang Zalo", async () => {
    clearSession();
    const { ctx } = makeCtx({
      demo: false,
      adapter: {
        getCapabilities: async () => ({ login_methods: { local_class: false } }),
      },
    });
    const { host, el } = mount(loginPage, ctx);

    // Chờ promise probe capabilities chạy
    await new Promise((r) => setTimeout(r, 50));
    const text = textOf(el);
    assert.ok(text.includes("chưa được bật trên máy chủ"), "phải báo trạng thái trung thực");
    assert.equal(findButton(el, "Đăng nhập bằng Zalo"), undefined, "không được fallback sang màn Zalo");
    unmount(host);
  });

  it("capabilities timeout/error: probe bỏ qua và form HS/PH vẫn dùng bình thường", async () => {
    clearSession();
    const { ctx } = makeCtx({
      demo: false,
      adapter: {
        getCapabilities: async () => {
          throw new ApiError("timeout", 0, "timeout");
        },
      },
    });
    const { host, el } = mount(loginPage, ctx);
    await new Promise((r) => setTimeout(r, 50));

    assert.ok(el.querySelector("input#fb-cred-code"), "form vẫn giữ nguyên, không crash");
    unmount(host);
  });

  it("router public: không có route, alias hay path nào dẫn tới màn Zalo cũ", () => {
    const routeKeys = Object.keys(routes);
    assert.ok(!routeKeys.includes("/zalo-login"), "không có route /zalo-login");
    assert.ok(!routeKeys.includes("/legacy-login"), "không có route /legacy-login");
    assert.ok(!routeKeys.includes("/login/zalo"), "không có route /login/zalo");
  });

  it("startup plan: HS/PH release tắt silentLogin ngầm để người dùng trải nghiệm form", () => {
    const plan = getLoginStartupPlan({ inZalo: true, hasSession: false });
    assert.equal(plan.silentLogin, false, "silentLogin phải là false trong bản HS/PH");
    assert.equal(getLegacyZaloSilentLoginCondition({ inZalo: true, hasSession: false }), true, "legacy condition bảo tồn dormant");
  });

  it("module legacy Zalo login được bảo tồn nguyên vẹn và kiểm thử cách ly", async () => {
    assert.equal(LEGACY_ZALO_LOGIN_ENABLED, false, "cờ gate compile-time phải là false");

    // Kiểm thử độc lập isolated cho hàm renderLegacyZaloLogin
    let legacySdkCalled = false;
    let proceeded = false;
    const dummyCtx = {
      adapter: {
        loginWithZaloToken: async () => {
          legacySdkCalled = true;
        },
      },
    };
    const container = renderLegacyZaloLogin({
      ctx: dummyCtx,
      proceedAfterLogin: async () => {
        proceeded = true;
      },
      cancelled: () => false,
    });

    assert.ok(textOf(container).includes("Đăng nhập bằng Zalo"), "module legacy giữ đúng heading");
    assert.ok(textOf(container).includes("Chúng tôi xác minh bạn như thế nào"), "module legacy giữ đúng giải thích");
    const zaloBtn = findButton(container, "Đăng nhập bằng Zalo");
    assert.ok(zaloBtn, "module legacy có nút Đăng nhập bằng Zalo");

    zaloBtn.click();
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(legacySdkCalled, true, "handler SDK cũ hoạt động đúng khi chạy isolated");
    assert.equal(proceeded, true, "proceedAfterLogin được gọi sau login SDK thành công");
  });
});
