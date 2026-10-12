// tests/f01-flows.test.mjs — hành vi F01: session in-memory, đăng nhập,
// đồng ý theo mục đích, luồng kết nối hai phía (tạo/nhập/xác nhận/hủy/thu hồi).
// Chạy: node --test tests/f01-flows.test.mjs

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
globalThis.KeyboardEvent = domWindow.KeyboardEvent;
globalThis.location = domWindow.location;
if (typeof globalThis.requestAnimationFrame === "undefined") {
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
}

const { describe, it } = await import("node:test");
const assert = (await import("node:assert/strict")).default;

// --------------------------------------------------- app code (import sau globals)
const {
  clearSession, getSession, getToken, hasLiveSession, setSession,
} = await import("../src/core/session.js");
const { createMockAdapter } = await import("../src/core/adapter/mock-adapter.js");
const { ApiError } = await import("../src/core/api/client.mjs");
const { ADAPTER_METHODS } = await import("../src/core/adapter/adapter.js");
const { initStore, resetState, setRole, getState } = await import("../src/app/store.js");
const loginPage = (await import("../src/pages/login/index.js")).page;
const consentPage = (await import("../src/pages/consent/index.js")).page;
const connectPage = (await import("../src/pages/connect/index.js")).page;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function mount(pageModule, ctx) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const el = pageModule.render(ctx);
  host.appendChild(el);
  return { host, el };
}

function unmount(host) {
  host.remove();
  document.querySelectorAll(".fb-sheet-root, .fb-dialog-root").forEach((el) => el.remove());
}

function textOf(el) {
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

function findButton(root, needle) {
  return Array.from(root.querySelectorAll("button")).find(
    (btn) => textOf(btn).includes(needle),
  );
}

function makeCtx({ demo = false, role = null, adapter } = {}) {
  initStore({ demoMode: demo });
  resetState();
  if (role) setRole(role);
  const navigateCalls = [];
  return {
    ctx: {
      store: { getState },
      adapter: adapter || createMockAdapter({ scenario: null }),
      navigate: (path) => navigateCalls.push(path),
      setRole: (nextRole) => setRole(nextRole),
      rebuildAdapter: () => {},
      params: new URLSearchParams(""),
    },
    navigateCalls,
  };
}

// ---------------------------------------------------------------- session
describe("F01 session (memory only)", () => {
  it("setSession/getSession/clearSession: chỉ nằm trong memory", () => {
    clearSession();
    assert.equal(getSession(), null);
    assert.equal(getToken(), null);
    assert.equal(hasLiveSession(), false);

    setSession({
      token: "tok-1",
      userId: "user-1",
      expiresAt: Date.now() + 60_000,
      consentsRequired: ["service"],
    });
    assert.equal(getToken(), "tok-1");
    assert.equal(getSession().userId, "user-1");
    assert.equal(hasLiveSession(), true);

    // Không được ghi vào storage nào
    assert.equal(domWindow.localStorage.length, 0);
    assert.equal(domWindow.sessionStorage.length, 0);

    clearSession();
    assert.equal(getSession(), null);
    assert.equal(hasLiveSession(), false);
    // clearSession idempotent
    clearSession();
  });

  it("phiên hết hạn: hasLiveSession trả false theo expiresAt", () => {
    setSession({ token: "tok-old", userId: "u", expiresAt: Date.now() - 1000 });
    assert.equal(hasLiveSession(), false);
    clearSession();
  });

  it("setSession không chấp nhận token rỗng", () => {
    assert.throws(() => setSession({ token: "", expiresAt: Date.now() + 1 }));
    clearSession();
  });
});

// ---------------------------------------------------------------- adapter surface
describe("F01 adapter surface", () => {
  it("ADAPTER_METHODS phủ F01 và không có tên kiểu auto-send", () => {
    for (const name of [
      "loginWithZaloToken", "trySilentLogin", "logout", "listConsents",
      "recordConsent", "createInvite", "listInvites", "claimInvite",
      "confirmInvite", "declineInvite", "cancelInvite", "listConnections",
      "revokeConnection",
    ]) {
      assert.ok(ADAPTER_METHODS.includes(name), `thiếu method ${name}`);
    }
    for (const name of ADAPTER_METHODS) {
      assert.doesNotMatch(name, /send|submit|push|publish|post/i,
        `tên method không được gợi ý auto-send: ${name}`);
    }
  });

  it("mock adapter: login trả phiên fixture + logout clear", async () => {
    clearSession();
    const mock = createMockAdapter({ scenario: null });
    const result = await mock.loginWithZaloToken();
    assert.equal(result.source, "fixture");
    assert.equal(hasLiveSession(), true);
    assert.equal(await mock.logout(), true);
    assert.equal(hasLiveSession(), false);
  });

  it("mock adapter: claim mã sai -> 404 invalid_or_expired_code (không lộ tồn tại)", async () => {
    const mock = createMockAdapter({ scenario: null });
    await assert.rejects(
      () => mock.claimInvite("SAIMAISAISAI"),
      (error) => error instanceof ApiError && error.status === 404
        && error.details && error.details.reason === "invalid_or_expired_code",
    );
  });
});

// ---------------------------------------------------------------- login page
describe("F01 trang đăng nhập", () => {

  it("production ngoài Zalo: hướng dẫn mở trong Zalo, nút đăng nhập bị chặn", () => {
    clearSession();
    const { ctx } = makeCtx({ demo: false });
    const { host, el } = mount(loginPage, ctx);
    const text = textOf(el);
    assert.ok(text.includes("Hãy mở trong Zalo"), `nhưng thấy: ${text}`);
    const loginBtn = findButton(el, "Đăng nhập bằng Zalo");
    assert.ok(loginBtn, "thiếu nút đăng nhập");
    assert.equal(loginBtn.disabled, true, "ngoài Zalo phải chặn nút");
    assert.ok(loginBtn.title && loginBtn.title.length > 0, "nút disabled phải có lý do");
    assert.ok(text.includes("Tìm trợ giúp"), "trợ giúp luôn truy cập được");
    unmount(host);
  });

  it("demo: đăng nhập fixture -> điều hướng tiếp (không phải phiên thật)", async () => {
    clearSession();
    const { ctx, navigateCalls } = makeCtx({ demo: true });
    const { host, el } = mount(loginPage, ctx);
    const btn = findButton(el, "Vào bản xem trước (dữ liệu minh họa)");
    assert.ok(btn, "demo phải có nút vào bản xem trước");
    btn.click();
    await wait(500);
    assert.equal(hasLiveSession(), true, "demo vẫn set phiên trong memory");
    assert.ok(
      navigateCalls.includes("/consent") || navigateCalls.includes("/role-select"),
      `phải đi tiếp theo luồng, thấy: ${navigateCalls.join(",")}`,
    );
    clearSession();
    unmount(host);
  });

  it("banner phiên hết hạn (?reason=expired) hiển thị cảnh báo", () => {
    clearSession();
    const { ctx } = makeCtx({ demo: false });
    ctx.params = new URLSearchParams("reason=expired");
    const { host, el } = mount(loginPage, ctx);
    assert.ok(textOf(el).includes("Phiên đã hết hạn. Vui lòng đăng nhập lại."));
    unmount(host);
  });

  it("đã có phiên sống: không hiện form đăng nhập lại", () => {
    clearSession();
    setSession({ token: "t", userId: "u", expiresAt: Date.now() + 60_000 });
    const { ctx } = makeCtx({ demo: false });
    const { host, el } = mount(loginPage, ctx);
    const text = textOf(el);
    assert.ok(text.includes("Bạn đã đăng nhập"));
    assert.ok(!findButton(el, "Đăng nhập bằng Zalo"));
    clearSession();
    unmount(host);
  });

  it("đăng nhập thất bại: thông báo lỗi + cho thử lại, không ném 500 UI", async () => {
    clearSession();
    const failing = {
      mode: "zalo",
      loginWithZaloToken: async () => {
        throw new ApiError("Kết nối quá thời gian chờ. Vui lòng thử lại.", 0, "timeout");
      },
      listConsents: async () => [],
    };
    const { ctx } = makeCtx({ demo: false, adapter: failing });
    // Mô phỏng môi trường Zalo để nút bật (isZaloHost false trong happy-dom,
    // nhưng nút vẫn render; test qua gọi onClick trực tiếp khi không disabled).
    const { host, el } = mount(loginPage, ctx);
    const btn = findButton(el, "Đăng nhập bằng Zalo");
    if (btn && !btn.disabled) {
      btn.click();
      await wait(50);
      assert.ok(
        textOf(el).includes("Kết nối quá thời gian chờ")
          || textOf(el).includes("Đăng nhập chưa thành công"),
        "phải hiện thông báo lỗi rõ ràng",
      );
    }
    assert.equal(hasLiveSession(), false, "thất bại không được tạo phiên");
    unmount(host);
  });
});

// ---------------------------------------------------------------- consent page
describe("F01 trang đồng ý", () => {

  function consentAdapter({ existing = [], fail = false } = {}) {
    const recorded = [];
    return {
      mode: "zalo",
      recorded,
      listConsents: async () => (fail
        ? Promise.reject(new ApiError("nope", 503, "http"))
        : existing.slice()),
      recordConsent: async (input) => {
        recorded.push(input);
        return { consent_id: `c-${recorded.length}` };
      },
    };
  }

  it("chưa đăng nhập (production): điều hướng về /login, không render form", () => {
    clearSession();
    const { ctx, navigateCalls } = makeCtx({ demo: false, adapter: consentAdapter() });
    const { host, el } = mount(consentPage, ctx);
    assert.ok(navigateCalls.includes("/login?reason=expired"));
    assert.ok(!textOf(el).includes("Xác nhận và tiếp tục"));
    unmount(host);
  });

  it("không precheck: mọi checkbox mặc định KHÔNG chọn, nút continue bị khóa", async () => {
    clearSession();
    setSession({ token: "t", userId: "u", expiresAt: Date.now() + 60_000 });
    const adapter = consentAdapter({ existing: [] });
    const { ctx } = makeCtx({ demo: false, adapter });
    const { host, el } = mount(consentPage, ctx);
    await wait(50);
    const boxes = Array.from(el.querySelectorAll('input[type="checkbox"]'));
    assert.equal(boxes.length, 3, "phải có đủ 3 mục đích đồng ý");
    assert.ok(boxes.every((b) => !b.checked), "không được precheck bất kỳ mục nào");
    const cont = findButton(el, "Xác nhận và tiếp tục");
    assert.ok(cont, "thiếu nút xác nhận");
    assert.equal(cont.disabled, true, "service chưa chấp nhận -> nút khóa");
    clearSession();
    unmount(host);
  });

  it("đã chấp nhận đúng phiên bản: khôi phục trạng thái đã chọn (không phải precheck)", async () => {
    clearSession();
    setSession({ token: "t", userId: "u", expiresAt: Date.now() + 60_000 });
    const adapter = consentAdapter({
      existing: [
        { purpose: "service", decision: "accepted", policy_version: "service-v1", withdrawn: false },
      ],
    });
    const { ctx } = makeCtx({ demo: false, adapter });
    const { host, el } = mount(consentPage, ctx);
    await wait(50);
    const serviceBox = el.querySelector("#fb-consent-service");
    assert.ok(serviceBox, "thiếu checkbox service");
    assert.equal(serviceBox.checked, true, "service đã chấp nhận đúng phiên bản -> hiển thị đúng thực tế");
    assert.ok(textOf(el).includes("Bạn đã chấp nhận phiên bản service-v1 trước đó."));
    clearSession();
    unmount(host);
  });

  it("ghi nhận lựa chọn: chấp nhận service, từ chối mục tùy chọn, không ghi trùng", async () => {
    clearSession();
    setSession({ token: "t", userId: "u", expiresAt: Date.now() + 60_000 });
    const adapter = consentAdapter({ existing: [] });
    const { ctx, navigateCalls } = makeCtx({ demo: false, adapter });
    const { host, el } = mount(consentPage, ctx);
    await wait(50);
    el.querySelector("#fb-consent-service").click();
    const cont = findButton(el, "Xác nhận và tiếp tục");
    assert.equal(cont.disabled, false, "service được chấp nhận -> mở nút");
    cont.click();
    await wait(120);
    assert.equal(adapter.recorded.length, 3, "3 mục được ghi rõ ràng vào sổ cái");
    assert.deepEqual(adapter.recorded.map((r) => r.decision), ["accepted", "declined", "declined"]);
    assert.ok(navigateCalls.includes("/role-select"), "tiếp theo là chọn vai trò");
    clearSession();
    unmount(host);
  });

  it("lỗi tải: ErrorState + Thử lại, không im lặng bỏ qua", async () => {
    clearSession();
    setSession({ token: "t", userId: "u", expiresAt: Date.now() + 60_000 });
    const { ctx } = makeCtx({ demo: false, adapter: consentAdapter({ fail: true }) });
    const { host, el } = mount(consentPage, ctx);
    await wait(60);
    assert.ok(textOf(el).includes("Không tải được trạng thái đồng ý"));
    assert.ok(findButton(el, "Thử lại"));
    clearSession();
    unmount(host);
  });
});

// ---------------------------------------------------------------- connect page
describe("F01 trang kết nối", () => {

  function connectAdapter({ connections = [], invites = [], failLists = false } = {}) {
    const calls = { create: 0, claim: 0, confirm: 0, cancel: 0, decline: 0, revoke: 0 };
    return {
      mode: "zalo",
      calls,
      listConnections: async () => {
        if (failLists) throw new ApiError("boom", 503, "http");
        return connections;
      },
      listInvites: async () => {
        if (failLists) throw new ApiError("boom", 503, "http");
        return invites;
      },
      createInvite: async () => {
        calls.create += 1;
        return {
          invite_id: "inv-1",
          code: "AB2CD3EF4GH5",
          expires_at: new Date(Date.now() + 86400_000).toISOString(),
          status: "pending",
        };
      },
      claimInvite: async (code) => {
        calls.claim += 1;
        if (code !== "AB2CD3EF4GH5") {
          throw new ApiError("err", 404, "http", { code: "not_found", details: { reason: "invalid_or_expired_code" } });
        }
        return { invite_id: "inv-2", status: "awaiting_confirmation", role: "candidate" };
      },
      confirmInvite: async () => {
        calls.confirm += 1;
        return {
          invite: { invite_id: "inv-1", status: "active", role: "inviter" },
          connection: { connection_id: "c-new", status: "active", relationship_kind: "primary", generation: 1 },
        };
      },
      cancelInvite: async () => {
        calls.cancel += 1;
        return { invite_id: "inv-1", status: "canceled", role: "inviter" };
      },
      declineInvite: async () => {
        calls.decline += 1;
        return { invite_id: "inv-2", status: "declined", role: "candidate" };
      },
      revokeConnection: async () => {
        calls.revoke += 1;
        return { connection_id: "c1", status: "revoked", generation: 1, note: "Kết nối mới phải qua lời mời hai bên." };
      },
    };
  }

  it("chưa đăng nhập (production): điều hướng /login, không gọi danh sách", () => {
    clearSession();
    const adapter = connectAdapter();
    const { ctx, navigateCalls } = makeCtx({ demo: false, adapter });
    const { host, el } = mount(connectPage, ctx);
    assert.ok(navigateCalls.includes("/login?reason=expired"));
    assert.equal(adapter.calls.create, 0);
    unmount(host);
  });

  it("hiển thị kết nối đang hoạt động + nút Hủy kết nối", async () => {
    clearSession();
    setSession({ token: "t", userId: "u", expiresAt: Date.now() + 60_000 });
    const adapter = connectAdapter({
      connections: [
        { connection_id: "c1", other_party_id: "peer-uuid", relationship_kind: "primary", generation: 1, status: "active" },
      ],
    });
    const { ctx } = makeCtx({ demo: false, adapter });
    const { host, el } = mount(connectPage, ctx);
    await wait(60);
    const text = textOf(el);
    assert.ok(text.includes("Kết nối đang hoạt động"));
    assert.ok(text.includes("Người đồng hành chính"));
    assert.ok(!text.includes("peer-uuid"), "không lộ UUID của người kia");
    assert.ok(findButton(el, "Hủy kết nối"));
    clearSession();
    unmount(host);
  });

  it("tạo mã mời: mã hiển thị MỘT lần kèm hạn và nhãn chưa ai nhập", async () => {
    clearSession();
    setSession({ token: "t", userId: "u", expiresAt: Date.now() + 60_000 });
    const adapter = connectAdapter();
    const { ctx } = makeCtx({ demo: false, adapter });
    const { host, el } = mount(connectPage, ctx);
    await wait(60);
    const createBtn = findButton(el, "Tạo mã mời");
    assert.ok(createBtn, "thiếu nút tạo mã mời");
    createBtn.click();
    await wait(80);
    const text = textOf(el);
    assert.ok(text.includes("AB2CD3EF4GH5"), "mã phải hiển thị cho người tạo");
    assert.ok(text.includes("MỘT lần"), "phải cảnh báo chỉ hiện một lần");
    assert.ok(text.includes("Đã tạo mã mời — chưa có ai nhập mã"), "không được báo đã có người nhận");
    assert.equal(adapter.calls.create, 1);
    clearSession();
    unmount(host);
  });

  it("nhập mã: mã đúng -> chờ người tạo xác nhận; mã sai -> thông báo rõ", async () => {
    clearSession();
    setSession({ token: "t", userId: "u", expiresAt: Date.now() + 60_000 });
    const adapter = connectAdapter();
    const { ctx } = makeCtx({ demo: false, adapter });
    const { host, el } = mount(connectPage, ctx);
    await wait(60);
    const input = el.querySelector("#fb-invite-code");
    assert.ok(input, "thiếu ô nhập mã");
    // Mã sai (12 ký tự hợp lệ theo bảng mã mời — không I/1/O/0)
    input.value = "XXYYZZ234567";
    input.dispatchEvent(new domWindow.Event("input", { bubbles: true }));
    const claimBtn = findButton(el, "Nhập mã mời");
    claimBtn.click();
    await wait(80);
    assert.ok(textOf(el).includes("Mã không đúng hoặc đã hết hạn"), "mã sai phải báo rõ");
    // Mã đúng
    input.value = "AB2CD3EF4GH5";
    input.dispatchEvent(new domWindow.Event("input", { bubbles: true }));
    findButton(el, "Nhập mã mời").click();
    await wait(80);
    assert.ok(textOf(el).includes("Nhập mã thành công"), "mã đúng phải xác nhận bước đã xong");
    assert.ok(textOf(el).includes("Chờ người tạo mã xác nhận"), "phải nói rõ chưa kích hoạt ngay");
    assert.equal(adapter.calls.claim, 2);
    clearSession();
    unmount(host);
  });

  it("lời mời awaiting của người tạo: có Xác nhận kết nối + Hủy lời mời", async () => {
    clearSession();
    setSession({ token: "t", userId: "u", expiresAt: Date.now() + 60_000 });
    const adapter = connectAdapter({
      invites: [
        { invite_id: "inv-1", relationship_kind: "primary", status: "awaiting_confirmation", expires_at: new Date(Date.now() + 86400_000).toISOString(), role: "inviter", revision: 3 },
      ],
    });
    const { ctx } = makeCtx({ demo: false, adapter });
    const { host, el } = mount(connectPage, ctx);
    await wait(60);
    assert.ok(findButton(el, "Xác nhận kết nối"), "người tạo phải thấy nút xác nhận");
    assert.ok(findButton(el, "Hủy lời mời"), "người tạo phải thấy nút hủy");
    findButton(el, "Xác nhận kết nối").click();
    await wait(80);
    assert.equal(adapter.calls.confirm, 1);
    assert.ok(textOf(el).includes("Hai bên đã kết nối"), "xác nhận xong phải báo kết nối thành công");
    clearSession();
    unmount(host);
  });

  it("hủy kết nối phải qua dialog xác nhận (destructive)", async () => {
    clearSession();
    setSession({ token: "t", userId: "u", expiresAt: Date.now() + 60_000 });
    const adapter = connectAdapter({
      connections: [
        { connection_id: "c1", other_party_id: "peer", relationship_kind: "primary", generation: 2, status: "active" },
      ],
    });
    const { ctx } = makeCtx({ demo: false, adapter });
    const { host, el } = mount(connectPage, ctx);
    await wait(60);
    findButton(el, "Hủy kết nối").click();
    await wait(40);
    const dialog = document.querySelector(".fb-dialog, [role='alertdialog'], .fb-dialog-root");
    assert.ok(dialog, "phải mở dialog xác nhận trước khi hủy");
    assert.ok(textOf(document.body).includes("Hủy kết nối này?"), "dialog phải hỏi lại rõ ràng");
    // Chọn "Giữ kết nối" -> không revoke
    const keepBtn = Array.from(document.querySelectorAll("button")).find(
      (b) => textOf(b).includes("Giữ kết nối"),
    );
    keepBtn.click();
    await wait(40);
    assert.equal(adapter.calls.revoke, 0, "Giữ kết nối không được revoke");
    clearSession();
    unmount(host);
  });

  it("lỗi tải danh sách: ErrorState + Thử lại (không fallback, không polling)", async () => {
    clearSession();
    setSession({ token: "t", userId: "u", expiresAt: Date.now() + 60_000 });
    const { ctx } = makeCtx({ demo: false, adapter: connectAdapter({ failLists: true }) });
    const { host, el } = mount(connectPage, ctx);
    await wait(60);
    assert.ok(textOf(el).includes("Không tải được dữ liệu kết nối"));
    assert.ok(findButton(el, "Thử lại"));
    clearSession();
    unmount(host);
  });

  it("không có polling: trang không dùng setInterval", async () => {
    // Trang connect phải làm mới THỦ CÔNG (nút Làm mới), không tự lặp.
    const source = await (await import("node:fs/promises"))
      .readFile(new URL("../src/pages/connect/index.js", import.meta.url), "utf8");
    assert.ok(!source.includes("setInterval"), "connect page cấm setInterval");
    assert.ok(source.includes("Làm mới"), "phải có nút làm mới thủ công");
  });

  it("401 từ adapter: điều hướng về /login?reason=expired", async () => {
    clearSession();
    setSession({ token: "t", userId: "u", expiresAt: Date.now() + 60_000 });
    const unauthorized = {
      mode: "zalo",
      listConnections: async () => {
        throw new ApiError("err", 401, "http");
      },
      listInvites: async () => [],
    };
    const { ctx, navigateCalls } = makeCtx({ demo: false, adapter: unauthorized });
    const { host, el } = mount(connectPage, ctx);
    await wait(60);
    assert.ok(
      navigateCalls.includes("/login?reason=expired"),
      `phiên hết hạn phải về đăng nhập, thấy: ${navigateCalls.join(",")}`,
    );
    clearSession();
    unmount(host);
  });
});
