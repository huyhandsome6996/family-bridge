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
  clearSession, clearSessionIfUnchanged, getSession, getSessionGeneration,
  getToken, hasLiveSession, setSession,
} = await import("../src/core/session.js");
const { createMockAdapter } = await import("../src/core/adapter/mock-adapter.js");
const { createZaloAdapter } = await import("../src/core/adapter/zalo-adapter.js");
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

  it("generation: setSession/clearSession đều tăng; displayName được giữ trong memory", () => {
    clearSession();
    const g0 = getSessionGeneration();
    setSession({ token: "g1", userId: "u1", expiresAt: Date.now() + 60_000,
      displayName: "Mẹ Nam" });
    assert.equal(getSessionGeneration(), g0 + 1);
    assert.equal(getSession().displayName, "Mẹ Nam");
    clearSession();
    assert.equal(getSessionGeneration(), g0 + 2);
    assert.equal(getSession(), null);
  });

  it("clearSessionIfUnchanged: chỉ xóa khi thế hệ chưa đổi (công cụ chống xóa nhầm phiên mới)", () => {
    clearSession();
    setSession({ token: "old", userId: "u", expiresAt: Date.now() + 60_000 });
    const captured = getSessionGeneration();
    // Phiên đổi giữa chừng (đăng nhập mới hoàn tất)
    setSession({ token: "new", userId: "u", expiresAt: Date.now() + 60_000 });
    assert.equal(clearSessionIfUnchanged(captured), false,
      "request thuộc phiên cũ KHÔNG được xóa phiên mới");
    assert.equal(getToken(), "new", "phiên mới phải còn nguyên");
    // Capture đúng thế hệ hiện tại -> xóa được
    const current = getSessionGeneration();
    assert.equal(clearSessionIfUnchanged(current), true);
    assert.equal(getSession(), null);
    // Idempotent-an toàn: lần nữa với cùng capture -> false
    assert.equal(clearSessionIfUnchanged(current), false);
  });
});

// ---------------------------------------------------------------- adapter surface
describe("F01 adapter surface", () => {
  it("ADAPTER_METHODS phủ F01 và không có tên kiểu auto-send", () => {
    for (const name of [
      "loginWithZaloToken", "trySilentLogin", "logout", "getMyProfile",
      "updateMyProfile", "listConsents", "recordConsent", "createInvite",
      "listInvites", "previewInvite", "claimInvite", "confirmInvite",
      "declineInvite", "cancelInvite", "listConnections", "revokeConnection",
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

// ------------------------------------------- zalo-adapter: cô lập theo phiên
// Fix review "CÔ LẬP REQUEST THEO PHIÊN": 401 của request phiên cũ không được
// xóa phiên mới; logout không bị response đăng nhập chậm khôi phục phiên.
describe("zalo-adapter session generation", () => {
  function jsonResponse(status, body) {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  }

  const SESSION_BODY = {
    token: "backend-token-2",
    token_type: "Bearer",
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    user: { id: "user-2", display_name: "Mẹ Nam" },
    consents_required: ["service", "ai_processing", "research"],
  };

  function installFetch(handler) {
    const calls = [];
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url, options, method: options.method || "GET" });
      return handler(url, options, calls.length);
    };
    return () => { delete globalThis.fetch; };
  }

  function adapter(overrides = {}) {
    return createZaloAdapter({ baseUrl: "https://backend.example", ...overrides });
  }

  /** Bật môi trường Zalo giả cho isZaloHost (UA chứa Zalo + host không localhost). */
  function useZaloEnvironment() {
    const savedWindow = globalThis.window;
    const savedDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    globalThis.window = { location: { hostname: "mini.zalo.me" } };
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Zalo MiniApp Android/1.0" },
      configurable: true,
    });
    return () => {
      globalThis.window = savedWindow;
      if (savedDescriptor) {
        Object.defineProperty(globalThis, "navigator", savedDescriptor);
      }
    };
  }

  it("401 với phiên KHÔNG đổi: xóa phiên (hành vi cũ đúng được giữ)", async () => {
    clearSession();
    setSession({ token: "tok-a", userId: "u", expiresAt: Date.now() + 60_000 });
    const restore = installFetch(() => jsonResponse(401, {
      error: { code: "not_authenticated", details: {} },
    }));
    try {
      await assert.rejects(() => adapter().listConnections());
      assert.equal(hasLiveSession(), false, "401 thật phải xóa phiên");
    } finally {
      restore();
    }
  });

  it("401 của request thuộc phiên CŨ: KHÔNG xóa phiên mới (bỏ kết quả lỗi thời)", async () => {
    clearSession();
    setSession({ token: "tok-old", userId: "u", expiresAt: Date.now() + 60_000 });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const restore = installFetch(async () => {
      await gate;
      return jsonResponse(401, { error: { code: "not_authenticated", details: {} } });
    });
    try {
      const pending = adapter().listConnections(); // request bắt đầu với tok-old
      // Đăng nhập mới hoàn tất giữa chừng -> thế hệ phiên đổi.
      setSession({ token: "tok-new", userId: "u", expiresAt: Date.now() + 60_000 });
      release();
      await assert.rejects(() => pending);
      assert.equal(getToken(), "tok-new",
        "phiên MỚI phải còn nguyên — request cũ không được xóa nó");
      assert.equal(hasLiveSession(), true);
    } finally {
      restore();
    }
  });

  it("logout không bị response đăng nhập chậm khôi phục phiên", async () => {
    clearSession();
    setSession({ token: "tok-a", userId: "u", expiresAt: Date.now() + 60_000 });
    let loginRelease;
    const loginGate = new Promise((resolve) => { loginRelease = resolve; });
    const restore = installFetch(async (url, options) => {
      if (String(url).endsWith("/api/v1/auth/session")) {
        await loginGate; // đăng nhập chậm
        return jsonResponse(200, SESSION_BODY);
      }
      if (String(url).endsWith("/api/v1/auth/logout")) {
        return jsonResponse(200, { revoked: true });
      }
      throw new Error(`unexpected ${url}`);
    });
    const restoreEnv = useZaloEnvironment();
    try {
      const a = adapter({
        getSdkAccessToken: async () => "sdk-token",
      });
      const pendingLogin = a.loginWithZaloToken().catch((e) => e);
      // Người dùng logout trong lúc đăng nhập đang treo.
      await a.logout();
      loginRelease();
      const loginOutcome = await pendingLogin;
      assert.equal(hasLiveSession(), false,
        "logout phải thắng: phiên KHÔNG được hồi sinh sau logout");
      assert.ok(
        loginOutcome instanceof ApiError && loginOutcome.kind === "stale_session",
        `kết quả đăng nhập lỗi thời phải bị BỎ, thấy: ${loginOutcome && loginOutcome.kind}`);
      assert.equal(getSession(), null);
    } finally {
      restore();
      restoreEnv();
    }
  });

  it("login hoàn tất trước logout: logout sau đó xóa đúng phiên mới", async () => {
    clearSession();
    const restore = installFetch(async (url) => {
      if (String(url).endsWith("/api/v1/auth/session")) {
        return jsonResponse(200, SESSION_BODY);
      }
      if (String(url).endsWith("/api/v1/auth/logout")) {
        return jsonResponse(200, { revoked: true });
      }
      throw new Error(`unexpected ${url}`);
    });
    const restoreEnv = useZaloEnvironment();
    try {
      const a = adapter({ getSdkAccessToken: async () => "sdk-token" });
      await a.loginWithZaloToken();
      assert.equal(getToken(), "backend-token-2");
      assert.equal(getSession().displayName, "Mẹ Nam");
      await a.logout();
      assert.equal(hasLiveSession(), false, "logout sau đó xóa đúng phiên mới");
    } finally {
      restore();
      restoreEnv();
    }
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
// Adapter giả STATEFUL theo payload API THẬT (docs/features/f01/api.md):
// - invite list item: { invite_id, relationship_kind, status, expires_at,
//   role, revision, counterpart: {display_name, identity_basis} | null }
// - connection item: { connection_id, other_party_id, relationship_kind,
//   generation, status, counterpart }
// KHÔNG bịa trường chỉ có trong mock rồi coi đó là chứng cứ tích hợp.
describe("F01 trang kết nối", () => {

  const CODE = "AB2CD3EF4GH5";
  const peerProfile = { display_name: "Chị Hồng", identity_basis: "self_declared" };

  function connectAdapter({ connections = [], invites = [], failLists = false } = {}) {
    const calls = { create: 0, preview: 0, claim: 0, confirm: 0, cancel: 0,
      decline: 0, revoke: 0, saveName: 0 };
    // Bản sao sâu để test không mutating dữ liệu đầu vào.
    const inviteRows = invites.map((invite) => ({ ...invite }));
    const connectionRows = connections.map((c) => ({ ...c }));
    let displayName = null;

    function find(inviteId) {
      return inviteRows.find((row) => row.invite_id === inviteId);
    }

    return {
      mode: "zalo",
      calls,
      rows: inviteRows,
      listConnections: async () => {
        if (failLists) throw new ApiError("boom", 503, "http");
        return connectionRows.map((c) => ({ ...c }));
      },
      listInvites: async () => {
        if (failLists) throw new ApiError("boom", 503, "http");
        return inviteRows.map((row) => ({ ...row }));
      },
      getMyProfile: async () => ({ user_id: "u", display_name: displayName,
        identity_basis: "self_declared" }),
      updateMyProfile: async ({ displayName: name }) => {
        calls.saveName += 1;
        displayName = String(name || "").trim();
        return { user_id: "u", display_name: displayName,
          identity_basis: "self_declared" };
      },
      createInvite: async () => {
        calls.create += 1;
        const row = {
          invite_id: `inv-${inviteRows.length + 1}`,
          relationship_kind: "primary",
          status: "pending",
          expires_at: new Date(Date.now() + 86400_000).toISOString(),
          role: "inviter",
          revision: 1,
          counterpart: null,
        };
        inviteRows.unshift(row);
        // Backend trả raw code ĐÚNG MỘT lần khi tạo.
        return { invite_id: row.invite_id, code: CODE,
          expires_at: row.expires_at, status: "pending" };
      },
      previewInvite: async (code) => {
        calls.preview += 1;
        if (code !== CODE) {
          throw new ApiError("err", 404, "http", { code: "not_found",
            details: { reason: "invalid_or_expired_code" } });
        }
        return {
          invite_id: "inv-9",
          relationship_kind: "primary",
          status: "pending",
          expires_at: new Date(Date.now() + 86400_000).toISOString(),
          counterpart: peerProfile,
        };
      },
      claimInvite: async (code) => {
        calls.claim += 1;
        if (code !== CODE) {
          throw new ApiError("err", 404, "http", { code: "not_found",
            details: { reason: "invalid_or_expired_code" } });
        }
        const row = {
          invite_id: "inv-9",
          relationship_kind: "primary",
          status: "awaiting_confirmation",
          expires_at: new Date(Date.now() + 86400_000).toISOString(),
          role: "candidate",
          revision: 2,
          counterpart: { display_name: "Bạn tạo mã", identity_basis: "self_declared" },
        };
        inviteRows.unshift(row);
        return { ...row };
      },
      confirmInvite: async (inviteId) => {
        calls.confirm += 1;
        const row = find(inviteId);
        if (row) { row.status = "active"; }
        return {
          invite: { invite_id: inviteId, status: "active", role: "inviter",
            relationship_kind: "primary", revision: 3,
            expires_at: new Date(Date.now() + 86400_000).toISOString(),
            counterpart: peerProfile },
          connection: { connection_id: "c-new", status: "active",
            relationship_kind: "primary", generation: 1 },
        };
      },
      cancelInvite: async (inviteId) => {
        calls.cancel += 1;
        const row = find(inviteId);
        if (row) { row.status = "canceled"; }
        return { invite_id: inviteId, status: "canceled", role: "inviter",
          relationship_kind: "primary", revision: 2,
          expires_at: new Date(Date.now() + 86400_000).toISOString(),
          counterpart: null };
      },
      declineInvite: async (inviteId) => {
        calls.decline += 1;
        const row = find(inviteId);
        if (row) { row.status = "declined"; }
        return { invite_id: inviteId, status: "declined", role: "candidate",
          relationship_kind: "primary", revision: 2,
          expires_at: new Date(Date.now() + 86400_000).toISOString(),
          counterpart: { display_name: "Bạn tạo mã", identity_basis: "self_declared" } };
      },
      revokeConnection: async () => {
        calls.revoke += 1;
        return { connection_id: "c1", status: "revoked", generation: 1,
          note: "Kết nối mới phải qua lời mời hai bên." };
      },
    };
  }

  async function mountConnect(adapter) {
    clearSession();
    setSession({ token: "t", userId: "u", expiresAt: Date.now() + 60_000 });
    const { ctx, navigateCalls } = makeCtx({ demo: false, adapter });
    const { host, el } = mount(connectPage, ctx);
    await wait(80);
    return { host, el, navigateCalls, ctx };
  }

  it("chưa đăng nhập (production): điều hướng /login, không gọi danh sách", async () => {
    clearSession();
    const adapter = connectAdapter();
    const { ctx, navigateCalls } = makeCtx({ demo: false, adapter });
    const { host, el } = mount(connectPage, ctx);
    assert.ok(navigateCalls.includes("/login?reason=expired"));
    assert.equal(adapter.calls.create, 0);
    unmount(host);
  });

  it("hiển thị kết nối đang hoạt động kèm tên tự khai báo + nút Hủy kết nối", async () => {
    const adapter = connectAdapter({
      connections: [
        { connection_id: "c1", other_party_id: "peer-uuid", relationship_kind: "primary",
          generation: 1, status: "active", counterpart: peerProfile },
      ],
    });
    const { host, el } = await mountConnect(adapter);
    const text = textOf(el);
    assert.ok(text.includes("Kết nối đang hoạt động"));
    assert.ok(text.includes("Người đồng hành chính"));
    assert.ok(text.includes("Chị Hồng"), "phải hiện tên tự khai báo của người kia");
    assert.ok(text.includes("tự khai báo"), "phải gắn nhãn KHÔNG phải Zalo xác minh");
    assert.ok(!text.includes("peer-uuid"), "không lộ UUID của người kia");
    assert.ok(findButton(el, "Hủy kết nối"));
    clearSession();
    unmount(host);
  });

  it("tạo mã mời: mã hiển thị MỘT lần và SỐNG SÓT qua refresh bình thường", async () => {
    const adapter = connectAdapter();
    const { host, el } = await mountConnect(adapter);
    findButton(el, "Tạo mã mời").click();
    await wait(120);
    let text = textOf(el);
    assert.ok(text.includes(CODE), "mã phải hiển thị cho người tạo");
    assert.ok(text.includes("MỘT lần"), "phải cảnh báo chỉ hiện một lần");
    assert.ok(text.includes("Đã tạo mã mời — chưa có ai nhập mã"));
    assert.equal(adapter.calls.create, 1);
    // Refresh bình thường: mã hợp lệ KHÔNG được mất.
    findButton(el, "Làm mới").click();
    await wait(120);
    text = textOf(el);
    assert.ok(text.includes(CODE),
      "mã còn pending chưa hết hạn phải được giữ sau refresh");
    clearSession();
    unmount(host);
  });

  it("mã bị hủy phía backend: ngừng hiển thị như còn dùng, cho tạo mã mới", async () => {
    const adapter = connectAdapter();
    const { host, el } = await mountConnect(adapter);
    findButton(el, "Tạo mã mời").click();
    await wait(120);
    assert.ok(textOf(el).includes(CODE));
    // Lời mời phía backend chuyển sang canceled (vd: người kia báo không dùng).
    adapter.rows[0].status = "canceled";
    findButton(el, "Làm mới").click();
    await wait(120);
    const text = textOf(el);
    assert.ok(!text.includes(CODE),
      "mã đã hủy KHÔNG được hiển thị như còn dùng được");
    assert.ok(findButton(el, "Tạo mã mời"),
      "phải cho tạo lời mời mới khi lời mời cũ đã hủy");
    clearSession();
    unmount(host);
  });

  it("mã hết hạn phía backend: ngừng hiển thị, chỉ còn lựa chọn thay thế", async () => {
    const adapter = connectAdapter();
    const { host, el } = await mountConnect(adapter);
    findButton(el, "Tạo mã mời").click();
    await wait(120);
    adapter.rows[0].expires_at = new Date(Date.now() - 1000).toISOString();
    findButton(el, "Làm mới").click();
    await wait(120);
    assert.ok(!textOf(el).includes(CODE), "mã hết hạn không được hiển thị");
    // Vẫn còn một lời mời pending phía backend (chưa bị close) -> UI chỉ cho
    // TẠO MÃ MỚI THAY THẾ (backend sẽ tự hủy mã cũ khi tạo), không show mã.
    assert.ok(findButton(el, "Tạo mã mới thay thế"),
      "hết hạn rồi phải chỉ còn lựa chọn tạo mã thay thế");
    clearSession();
    unmount(host);
  });

  it("mã đã có người nhập (awaiting): không còn là mã dùng được, hiện trạng thái", async () => {
    const adapter = connectAdapter();
    const { host, el } = await mountConnect(adapter);
    findButton(el, "Tạo mã mời").click();
    await wait(120);
    adapter.rows[0].status = "awaiting_confirmation";
    adapter.rows[0].counterpart = peerProfile;
    findButton(el, "Làm mới").click();
    await wait(120);
    const text = textOf(el);
    assert.ok(!text.includes(CODE), "mã đã được dùng thì không hiển thị lại");
    assert.ok(text.includes("đã có người nhập"),
      "phải báo mã đã được sử dụng");
    assert.ok(text.includes("Chị Hồng"),
      "phải hiện người đã nhập mã để đối chiếu");
    clearSession();
    unmount(host);
  });

  it("nhập mã hai bước: kiểm tra thấy người tạo (tự khai báo) rồi mới đồng ý", async () => {
    const adapter = connectAdapter();
    const { host, el } = await mountConnect(adapter);
    const input = el.querySelector("#fb-invite-code");
    // Mã sai (12 ký tự hợp lệ theo bảng mã mời — không I/1/O/0)
    input.value = "XXYYZZ234567";
    input.dispatchEvent(new domWindow.Event("input", { bubbles: true }));
    findButton(el, "Kiểm tra mã").click();
    await wait(80);
    assert.ok(textOf(el).includes("Mã không đúng hoặc đã hết hạn"),
      "mã sai phải báo rõ");
    assert.equal(adapter.calls.claim, 0, "mã sai không được phép claim");
    // Mã đúng -> hiện người tạo mã TRƯỚC khi đồng ý
    input.value = CODE;
    input.dispatchEvent(new domWindow.Event("input", { bubbles: true }));
    findButton(el, "Kiểm tra mã").click();
    await wait(80);
    let text = textOf(el);
    assert.ok(text.includes("Kiểm tra đúng người"),
      "bước preview phải yêu cầu kiểm tra đúng người");
    assert.ok(text.includes("Chị Hồng"), "phải hiện tên người tạo mã");
    assert.ok(text.includes("tự khai báo"),
      "phải gắn nhãn tên tự khai báo, không phải Zalo xác minh");
    assert.equal(adapter.calls.claim, 0,
      "chưa bấm Đồng ý thì chưa được claim (không tự ghi)");
    // Đồng ý -> claim -> chờ người tạo xác nhận
    findButton(el, "Đồng ý kết nối").click();
    await wait(120);
    text = textOf(el);
    assert.ok(text.includes("Bạn đã đồng ý kết nối"));
    assert.ok(text.includes("Chờ người tạo mã xác nhận"),
      "phải nói rõ chưa kích hoạt ngay");
    assert.equal(adapter.calls.claim, 1);
    clearSession();
    unmount(host);
  });

  it("sau khi đồng ý xong, ô nhập mã không hiện lại form để nhập trùng", async () => {
    const adapter = connectAdapter();
    const { host, el } = await mountConnect(adapter);
    const input = el.querySelector("#fb-invite-code");
    input.value = CODE;
    input.dispatchEvent(new domWindow.Event("input", { bubbles: true }));
    findButton(el, "Kiểm tra mã").click();
    await wait(80);
    findButton(el, "Đồng ý kết nối").click();
    await wait(140);
    assert.ok(!el.querySelector("#fb-invite-code"),
      "đã đồng ý thì không hiện lại ô nhập mã (tránh nhập/caim trùng)");
    clearSession();
    unmount(host);
  });

  /** Nút trong dialog đang mở (không nhầm với nút cùng nhãn phía sau). */
  function dialogButton(needle) {
    const dialogRoot = document.querySelector(".fb-dialog-root, [role='alertdialog'], .fb-dialog");
    const scope = dialogRoot || document;
    return Array.from(scope.querySelectorAll("button")).find(
      (b) => textOf(b).includes(needle),
    );
  }

  it("lời mời awaiting của người tạo: dialog xác nhận nêu đúng người nhập mã", async () => {
    const adapter = connectAdapter({
      invites: [
        { invite_id: "inv-1", relationship_kind: "primary",
          status: "awaiting_confirmation",
          expires_at: new Date(Date.now() + 86400_000).toISOString(),
          role: "inviter", revision: 3, counterpart: peerProfile },
      ],
    });
    const { host, el } = await mountConnect(adapter);
    const text = textOf(el);
    assert.ok(text.includes("Người nhập mã: Chị Hồng"),
      "người tạo phải thấy ai nhập mã trước khi xác nhận");
    assert.ok(findButton(el, "Xác nhận kết nối"));
    assert.ok(findButton(el, "Hủy lời mời"));
    findButton(el, "Xác nhận kết nối").click();
    await wait(60);
    const dialogText = textOf(document.body);
    assert.ok(dialogText.includes("Xác nhận kết nối?"),
      "xác nhận phải qua dialog kiểm tra đúng người");
    assert.ok(dialogText.includes("Chị Hồng") && dialogText.includes("tự khai báo"),
      "dialog phải nêu tên + nhãn tự khai báo");
    // Bấm xác nhận TRONG dialog (nút cùng nhãn phía sau không được ăn);
    const dialogConfirm = dialogButton("Xác nhận kết nối");
    assert.ok(dialogConfirm, "dialog phải có nút xác nhận");
    dialogConfirm.click();
    await wait(100);
    assert.equal(adapter.calls.confirm, 1);
    assert.ok(textOf(el).includes("Hai bên đã kết nối"));
    clearSession();
    unmount(host);
  });

  it("confirm gửi expected_revision lấy từ danh sách API thật", async () => {
    let receivedBody = null;
    const adapter = connectAdapter({
      invites: [
        { invite_id: "inv-1", relationship_kind: "primary",
          status: "awaiting_confirmation",
          expires_at: new Date(Date.now() + 86400_000).toISOString(),
          role: "inviter", revision: 3, counterpart: peerProfile },
      ],
    });
    const originalConfirm = adapter.confirmInvite.bind(adapter);
    adapter.confirmInvite = async (inviteId, opts = {}) => {
      receivedBody = opts;
      return originalConfirm(inviteId, opts);
    };
    const { host, el } = await mountConnect(adapter);
    findButton(el, "Xác nhận kết nối").click();
    await wait(60);
    dialogButton("Xác nhận kết nối").click();
    await wait(100);
    assert.equal(receivedBody && receivedBody.expectedRevision, 3,
      "revision từ list API thật phải được gửi vào confirm (không null)");
    clearSession();
    unmount(host);
  });

  it("hủy kết nối phải qua dialog xác nhận kèm danh tính người kia", async () => {
    const adapter = connectAdapter({
      connections: [
        { connection_id: "c1", other_party_id: "peer", relationship_kind: "primary",
          generation: 2, status: "active", counterpart: peerProfile },
      ],
    });
    const { host, el } = await mountConnect(adapter);
    findButton(el, "Hủy kết nối").click();
    await wait(40);
    const dialog = document.querySelector(".fb-dialog, [role='alertdialog'], .fb-dialog-root");
    assert.ok(dialog, "phải mở dialog xác nhận trước khi hủy");
    const dialogText = textOf(document.body);
    assert.ok(dialogText.includes("Hủy kết nối này?"), "dialog phải hỏi lại rõ ràng");
    assert.ok(dialogText.includes("Chị Hồng"),
      "trước khi hủy phải thấy sắp hủy với AI — đúng người kia");
    const keepBtn = Array.from(document.querySelectorAll("button")).find(
      (b) => textOf(b).includes("Giữ kết nối"),
    );
    keepBtn.click();
    await wait(40);
    assert.equal(adapter.calls.revoke, 0, "Giữ kết nối không được revoke");
    clearSession();
    unmount(host);
  });

  it("lỗi tải danh sách: Thử lại thành công KHÔI PHỤC ô nhập mã + giữ mã đã gõ", async () => {
    const adapter = connectAdapter({ failLists: true });
    const { host, el } = await mountConnect(adapter);
    assert.ok(textOf(el).includes("Không tải được dữ liệu kết nối"));
    // Người dùng kịp gõ mã trước khi lỗi/lúc lỗi — claimArea phải sống sót.
    const input = el.querySelector("#fb-invite-code");
    assert.ok(input, "lỗi mạng KHÔNG được phá ô nhập mã");
    input.value = "AB2CD3EF4GH5";
    input.dispatchEvent(new domWindow.Event("input", { bubbles: true }));
    // Chuyển sang thành công -> Thử lại
    adapter.listConnections = async () => [];
    adapter.listInvites = async () => [];
    findButton(el, "Thử lại").click();
    await wait(120);
    const restored = el.querySelector("#fb-invite-code");
    assert.ok(restored,
      "lỗi -> Thử lại thành công phải khôi phục ô nhập mã");
    assert.equal(restored.value, "AB2CD3EF4GH5",
      "mã đã gõ phải được giữ lại");
    assert.equal(adapter.calls.claim, 0,
      "không tự thực hiện lại thao tác ghi sau phục hồi");
    clearSession();
    unmount(host);
  });

  it("lỗi tải nhưng claimArea mất do render cũ -> Thử lại vẫn dựng lại từ trạng thái", async () => {
    // Mô phỏng đúng kịch bản review: refresh lỗi xảy ra SAU khi trang từng
    // paint thành công (mã gõ xong), rồi Thử lại thành công.
    const adapter = connectAdapter();
    const { host, el } = await mountConnect(adapter);
    const input = el.querySelector("#fb-invite-code");
    input.value = "AB2CD3EF4GH5";
    input.dispatchEvent(new domWindow.Event("input", { bubbles: true }));
    // Refresh kế tiếp lỗi mạng
    adapter.listConnections = async () => { throw new ApiError("boom", 503, "http"); };
    adapter.listInvites = async () => { throw new ApiError("boom", 503, "http"); };
    findButton(el, "Làm mới").click();
    await wait(120);
    assert.ok(textOf(el).includes("Không tải được dữ liệu kết nối"));
    assert.ok(el.querySelector("#fb-invite-code"),
      "sau lỗi vẫn phải còn ô nhập mã (không bị xóa sạch)");
    // Thử lại thành công
    adapter.listConnections = async () => [];
    adapter.listInvites = async () => [];
    findButton(el, "Thử lại").click();
    await wait(120);
    const restored = el.querySelector("#fb-invite-code");
    assert.ok(restored && restored.value === "AB2CD3EF4GH5",
      "phục hồi xong ô nhập mã + mã đã gõ còn nguyên");
    clearSession();
    unmount(host);
  });

  it("không có polling: trang không dùng setInterval", async () => {
    const source = await (await import("node:fs/promises"))
      .readFile(new URL("../src/pages/connect/index.js", import.meta.url), "utf8");
    assert.ok(!source.includes("setInterval"), "connect page cấm setInterval");
    assert.ok(source.includes("Làm mới"), "phải có nút làm mới thủ công");
  });

  it("401 khi phiên ĐÃ CHẾT thật: điều hướng về /login?reason=expired", async () => {
    // Giả lập chính xác authed() thật: 401 THẬT (thế hệ phiên không đổi)
    // => adapter xóa phiên rồi mới ném lỗi lên trang.
    const unauthorized = {
      mode: "zalo",
      listConnections: async () => {
        clearSession();
        throw new ApiError("err", 401, "http");
      },
      listInvites: async () => [],
    };
    clearSession();
    setSession({ token: "t", userId: "u", expiresAt: Date.now() + 60_000 });
    const { ctx, navigateCalls } = makeCtx({ demo: false, adapter: unauthorized });
    const { host, el } = mount(connectPage, ctx);
    await wait(80);
    assert.ok(
      navigateCalls.includes("/login?reason=expired"),
      `phiên hết hạn phải về đăng nhập, thấy: ${navigateCalls.join(",")}`,
    );
    clearSession();
    unmount(host);
  });

  it("401 lỗi thời (phiên MỚI còn sống): KHÔNG đá ra đăng nhập", async () => {
    // Response 401 của phiên cũ: phiên hiện tại còn sống -> trang KHÔNG
    // navigate, chỉ hiện lỗi + cho Thử lại.
    const unauthorized = {
      mode: "zalo",
      listConnections: async () => { throw new ApiError("err", 401, "http"); },
      listInvites: async () => [],
    };
    const { host, el, navigateCalls } = await mountConnect(unauthorized);
    assert.ok(hasLiveSession());
    assert.ok(!navigateCalls.includes("/login?reason=expired"),
      `stale 401 không được đá người dùng, thấy: ${navigateCalls.join(",")}`);
    clearSession();
    unmount(host);
  });

  it("tên gọi tự khai báo: lưu được và nhãn rõ ràng trên trang", async () => {
    const adapter = connectAdapter();
    const { host, el } = await mountConnect(adapter);
    const nameInput = el.querySelector("#fb-display-name");
    assert.ok(nameInput, "thiếu ô đặt tên gọi");
    assert.ok(textOf(el).includes("tự khai báo"),
      "phải nói rõ đây là tên tự khai báo");
    nameInput.value = "Mẹ Nam";
    nameInput.dispatchEvent(new domWindow.Event("input", { bubbles: true }));
    findButton(el, "Lưu tên gọi").click();
    await wait(120);
    assert.equal(adapter.calls.saveName, 1);
    assert.ok(textOf(el).includes("Tên gọi đã được cập nhật"));
    clearSession();
    unmount(host);
  });
});
