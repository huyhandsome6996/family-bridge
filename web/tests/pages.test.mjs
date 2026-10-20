// tests/pages.test.mjs — port web (task 19-a + W2-b): kiểm tra page contract +
// render không throw cho 13 trang đã port + 8 trang W2-b (cards/signal/message/
// mailbox/compose/proposal/settings/privacy — W2-b thay stub bằng trang thật,
// meta giữ nguyên mini; smoke render ở trạng thái chưa đăng nhập). Chạy:
//   node --test tests/pages.test.mjs
// happy-dom globals PHẢI được gắn TRƯỚC khi import động pages.
//
// Assertion GIỮ NGUYÊN từ mini tests/pages.test.mjs cho các màn dùng chung,
// TRỪ 2 chỗ copy web trung thực (đã port có chủ ý, xem report task 19-a):
//  - welcome: CTA "Tiếp tục để đăng nhập" (web không có host Zalo).
//  - how-to-use: bước 1 là đăng nhập mã tài khoản (web).
// Khối "8 trang W2-b" thay khối stub của 19-a: meta giữ nguyên, phần render
// đổi sang smoke trang thật (copy gate đăng nhập per-page — KHÔNG giảm assertion).

// ---------------------------------------------------------------- globals
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

const { describe, it } = await import("node:test");
const assert = (await import("node:assert/strict")).default;

// --------------------------------------------------- app code (import sau globals)
const { initStore, setRole, getState, resetState } = await import("../src/app/store.js");
const { createMockAdapter, createWebAdapter } = await import("../src/adapter/web-adapter.js");
const { ApiError } = await import("../../packages/family_bridge_shared/src/api/client.mjs");
const {
  setSession, clearSession, hasLiveSession,
} = await import("../src/core/session.js");

const PAGE_LOADERS = {
  welcome: () => import("../src/pages/welcome/index.js"),
  howToUse: () => import("../src/pages/how-to-use/index.js"),
  roleSelect: () => import("../src/pages/role-select/index.js"),
  home: () => import("../src/pages/home/index.js"),
  login: () => import("../src/pages/login/index.js"),
  consent: () => import("../src/pages/consent/index.js"),
  connect: () => import("../src/pages/connect/index.js"),
  companion: () => import("../src/pages/companion/index.js"),
  diary: () => import("../src/pages/diary/index.js"),
  profile: () => import("../src/pages/profile/index.js"),
  connectionCheck: () => import("../src/pages/connection-check/index.js"),
  help: () => import("../src/pages/help/index.js"),
  notFound: () => import("../src/pages/not-found/index.js"),
};

const pages = {};
for (const [name, loader] of Object.entries(PAGE_LOADERS)) {
  pages[name] = (await loader()).page;
}
// 8 trang W2-b (đã thay stub bằng trang thật — port nguyên văn từ mini).
const W2B_PAGE_NAMES = ["cards", "signal", "message", "mailbox", "compose", "proposal", "settings", "privacy"];
const w2bPages = {};
for (const name of W2B_PAGE_NAMES) {
  w2bPages[name] = (await import(`../src/pages/${name}/index.js`)).page;
}

// ---------------------------------------------------------------- helpers
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Adapter giả lập hành vi production (boundary 501) — không import config. */
const productionLikeAdapter = {
  mode: "web",
  getBackendHealth: async () => {
    throw new ApiError("Chưa cấu hình địa chỉ máy chủ.", 0, "configuration");
  },
  getBackendReady: async () => {
    throw new ApiError("Chưa cấu hình địa chỉ máy chủ.", 0, "configuration");
  },
  getConnectionStatus: async () => {
    throw new ApiError("Tính năng kết nối chưa được triển khai ở bản nền tảng.", 501);
  },
  listConnections: async () => {
    throw new ApiError("Chưa cấu hình địa chỉ máy chủ.", 0, "configuration");
  },
  listInvites: async () => {
    throw new ApiError("Chưa cấu hình địa chỉ máy chủ.", 0, "configuration");
  },
};

/** Adapter trả danh sách kết nối thật (mô phỏng backend, dùng chung session). */
function backendConnectionsAdapter(rows, { failLists = false } = {}) {
  return {
    mode: "web",
    listConnections: async () => {
      if (failLists) throw new ApiError("Không thể hoàn tất yêu cầu.", 503, "http");
      return { results: rows, nextCursor: null };
    },
    listInvites: async () => ({ results: [], nextCursor: null }),
    getConnectionStatus: async () => {
      throw new ApiError("boundary cũ", 501);
    },
  };
}

/** Adapter ném lỗi timeout ngay lập tức (thay vì chờ 4.5s của mock). */
const timeoutAdapter = {
  mode: "web",
  getBackendHealth: async () => {
    throw new ApiError("Kết nối quá thời gian chờ. Vui lòng thử lại.", 0, "timeout");
  },
  getBackendReady: async () => "ok",
  getConnectionStatus: async () => {
    throw new ApiError("Tính năng kết nối chưa được triển khai ở bản nền tảng.", 501);
  },
};

function makeCtx({ demo = false, role = null, adapter } = {}) {
  initStore({ demoMode: demo });
  resetState();
  if (role) setRole(role);
  const navigateCalls = [];
  const currentAdapter = adapter || createMockAdapter({ scenario: null });
  return {
    ctx: {
      store: { getState }, // store thật từ src/app/store.js (state sống)
      adapter: currentAdapter,
      navigate: (path) => navigateCalls.push(path),
      setRole: (nextRole) => setRole(nextRole), // setRole thật
      rebuildAdapter: (scenario) => {
        // giống main.js: mutate adapter hiện có, giữ nguyên tham chiếu
        Object.assign(currentAdapter, createMockAdapter({ scenario }));
      },
      params: new URLSearchParams(""),
    },
    navigateCalls,
  };
}

function mount(pageModule, ctx) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const el = pageModule.render(ctx);
  assert.ok(el instanceof HTMLElement, "render phải trả về HTMLElement");
  host.appendChild(el);
  return { host, el };
}

function unmount(host) {
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

// ---------------------------------------------------------------- tests

describe("Page contract (shape) — 13 trang port", () => {
  const EXPECTED = [
    ["welcome", { id: "u01-welcome", title: "Family Bridge", requiresRole: false, showBottomNav: false }],
    ["howToUse", { id: "u02-how-to-use", title: "Cách dùng Family Bridge", requiresRole: false, showBottomNav: false }],
    ["roleSelect", { id: "u04-role-select", title: "Chọn vai trò xem trước", requiresRole: false, showBottomNav: false }],
    ["home", { id: "u08-home", title: "Trang chủ", requiresRole: true, showBottomNav: true }],
    ["login", { id: "f01-login", title: "Đăng nhập", requiresRole: false, showBottomNav: false }],
    ["consent", { id: "f01-consent", title: "Đồng ý & quyền riêng tư", requiresRole: false, showBottomNav: false }],
    ["connect", { id: "f01-connect", title: "Kết nối người đồng hành", requiresRole: false, showBottomNav: false }],
    ["companion", { id: "companion", title: "Đồng hành", requiresRole: true, showBottomNav: true, requiresAuth: true, chrome: "app" }],
    ["diary", { id: "diary", title: "Nhật ký", requiresRole: true, showBottomNav: true }],
    ["profile", { id: "profile", title: "Cá nhân", requiresRole: true, showBottomNav: true }],
    ["connectionCheck", { id: "connection-check", title: "Kiểm tra kết nối máy chủ", requiresRole: false, showBottomNav: false }],
    ["help", { id: "help", title: "Tìm trợ giúp", requiresRole: false, showBottomNav: false }],
    ["notFound", { id: "not-found", title: "Không tìm thấy trang", requiresRole: false, showBottomNav: false }],
  ];

  for (const [name, expected] of EXPECTED) {
    it(`${name} khớp contract`, () => {
      const page = pages[name];
      assert.equal(page.id, expected.id);
      assert.equal(page.title, expected.title);
      assert.equal(page.requiresRole, expected.requiresRole);
      assert.equal(page.showBottomNav, expected.showBottomNav);
      assert.equal(typeof page.render, "function");
    });
  }
});

describe("8 trang W2-b: meta khớp mini + render smoke trang thật (chưa đăng nhập)", () => {
  const W2B_META = {
    cards: { id: "cards", title: "Thư viện thẻ cảm xúc", requiresAuth: true, gate: "Cần đăng nhập để mở thư viện thẻ", action: "Đăng nhập" },
    signal: { id: "signal", title: "Tín hiệu lắng nghe", requiresAuth: true, gate: "Cần đăng nhập để phát tín hiệu", action: "Đăng nhập" },
    // message không có :id trong params của smoke này → rẽ nhánh "Không có thư được chọn" TRƯỚC gate phiên (giữ nguyên hành vi mini).
    message: { id: "message", title: "Chi tiết tin nhắn", requiresAuth: true, gate: "Không có thư được chọn", action: "Quay lại Hộp thư" },
    mailbox: { id: "mailbox", title: "Hộp thư", requiresAuth: true, gate: "Cần đăng nhập để mở hộp thư", action: "Đăng nhập" },
    // compose GIỮ NGUYÊN mini: requiresAuth=false — tự kiểm tra phiên trong render.
    compose: { id: "f06-compose", title: "Soạn Thư Cảm Xúc", requiresAuth: false, gate: "Cần đăng nhập để soạn thư", action: "Đăng nhập" },
    proposal: { id: "proposal", title: "Xác nhận ghép nối", requiresAuth: true, gate: "Cần đăng nhập để xem đề xuất ghép đôi", action: "Đăng nhập" },
    settings: { id: "settings", title: "Cài đặt", requiresAuth: true, gate: "Cần đăng nhập để mở cài đặt", action: "Đăng nhập" },
    privacy: { id: "privacy", title: "Riêng tư & đồng ý", requiresAuth: true, gate: "Cần đăng nhập để mở trang riêng tư", action: "Đăng nhập" },
  };

  for (const [name, meta] of Object.entries(W2B_META)) {
    it(`${name}: meta khớp mini + gate đăng nhập trung thực khi chưa có phiên`, () => {
      const page = w2bPages[name];
      assert.equal(page.id, meta.id);
      assert.equal(page.title, meta.title);
      // Boolean() theo semantics guard (compose thật của mini không khai báo
      // requiresAuth — undefined ≡ false với truthiness guard).
      assert.equal(Boolean(page.requiresAuth), meta.requiresAuth);
      const { ctx } = makeCtx({ demo: false, role: "student" });
      const { host, el } = mount(page, ctx);
      const text = textOf(el);
      assert.ok(
        text.includes(meta.gate),
        `${name} phải render gate thật: ${text.slice(0, 120)}`,
      );
      assert.ok(findButton(el, meta.action), `${name} phải có lối hành động "${meta.action}"`);
      // Không giả dữ liệu: không nhãn demo, không chip "Mới", không số liệu bịa.
      assert.ok(!text.includes("Dữ liệu minh họa"));
      assert.ok(!text.includes("Màn này đang được chuyển đổi sang web độc lập"),
        "stub W2-b đã được thay bằng trang thật");
      unmount(host);
    });
  }
});

describe("Render không throw + copy bắt buộc", () => {
  it("U01 welcome (Stitch): CTA đăng nhập + liên kết Trợ giúp luôn hiển thị", () => {
    const { ctx, navigateCalls } = makeCtx({});
    const { host, el } = mount(pages.welcome, ctx);
    const text = textOf(el);
    assert.ok(text.includes("Family Bridge"));
    assert.ok(text.includes("Mở lời nhẹ nhàng, gần nhau hơn"), "headline Stitch phải có");
    assert.ok(text.includes("Cam kết bảo mật & ranh giới"), "thẻ cam kết phải có");
    // Port web (task 19-a): CTA dẫn đúng luồng thật /login, copy web trung thực.
    const cta = findButton(el, "Tiếp tục để đăng nhập");
    assert.ok(cta, "CTA đăng nhập phải tồn tại");
    cta.click();
    assert.ok(navigateCalls.includes("/login"), "CTA phải dẫn sang /login");
    const helpLink = Array.from(el.querySelectorAll("a")).find((a) => a.getAttribute("href") === "#/help");
    assert.ok(helpLink, "liên kết #/help phải tồn tại");
    assert.ok(textOf(helpLink).includes("Tìm trợ giúp"));
    unmount(host);
  });

  it("U02 how-to-use: 4 bước + ghi chú demo + CTA 'Tiếp tục' về đăng nhập", () => {
    const { ctx, navigateCalls } = makeCtx({});
    const { host, el } = mount(pages.howToUse, ctx);
    const text = textOf(el);
    // Port web: bước 1 là đăng nhập mã tài khoản (không Zalo host).
    for (const step of ["Đăng nhập bằng mã tài khoản", "mã mời", "thẻ cảm xúc và hộp thư", "Đồng hành 4 tuần tự nguyện"]) {
      assert.ok(text.includes(step), `thiếu bước/copy: ${step}`);
    }
    assert.ok(text.includes("Cả hai bên đều phải đồng ý thì kết nối mới được tạo"));
    assert.ok(text.includes("Chế độ xem trước (?demo=1) dùng dữ liệu minh họa, không tạo phiên thật."));
    const cta = findButton(el, "Tiếp tục");
    assert.ok(cta, "thiếu CTA Tiếp tục");
    cta.click();
    assert.ok(navigateCalls.includes("/login"), "CTA phải dẫn sang /login");
    unmount(host);
  });

  it("U04 role-select: 2 vai trò + ghi chú không tạo tài khoản", () => {
    const { ctx } = makeCtx({});
    const { host, el } = mount(pages.roleSelect, ctx);
    const text = textOf(el);
    assert.ok(text.includes("Bạn muốn xem giao diện của ai?"));
    assert.ok(text.includes("Con (học sinh THPT)"));
    assert.ok(text.includes("Người chăm sóc"));
    assert.ok(text.includes("Đây là chế độ xem trước giao diện, chưa tạo tài khoản hay phiên đăng nhập."));
    unmount(host);
  });

  it("U04 role-select: bấm vai trò -> setRole thật + navigate('/home')", async () => {
    // Mount 1: student (page có chống bấm đôi — mỗi lần navigate là instance mới)
    const first = makeCtx({});
    const mounted = mount(pages.roleSelect, first.ctx);
    const studentBtn = findButton(mounted.el, "Xem giao diện của Con");
    assert.ok(studentBtn, "thiếu nút vai trò học sinh");
    studentBtn.click();
    await wait(20);
    assert.equal(getState().role, "student");
    assert.ok(first.navigateCalls.includes("/home"));
    unmount(mounted.host);

    // Mount 2: caregiver
    const second = makeCtx({});
    const mounted2 = mount(pages.roleSelect, second.ctx);
    const caregiverBtn = findButton(mounted2.el, "Xem giao diện của Người chăm sóc");
    assert.ok(caregiverBtn, "thiếu nút vai trò người chăm sóc");
    caregiverBtn.click();
    await wait(20);
    assert.equal(getState().role, "caregiver");
    assert.ok(second.navigateCalls.includes("/home"));

    resetState();
    unmount(mounted2.host);
  });

  it("Home student (demo): greeting fixture + DemoBanner + dữ liệu thật qua mock (w08)", () => {
    const { ctx } = makeCtx({ demo: true, role: "student" });
    const { host, el } = mount(pages.home, ctx);
    return wait(1000).then(() => {
      const text = textOf(el);
      // Greeting Stitch dùng displayName fixture thật, không hardcode tên mẫu.
      assert.ok(text.includes("Chào Học sinh Bảo Nam (minh họa), hôm nay bạn cảm thấy thế nào?"), `greeting fixture: ${text}`);
      assert.ok(text.includes("Dữ liệu minh họa"));
      assert.ok(text.includes("Đang đồng hành với: Người đồng hành (minh họa)"));
      assert.ok(text.includes("Cảm xúc lúc này"), "mood card Stitch phải có");
      assert.ok(el.querySelector("a[href='#/cards']"), "tile thẻ cảm xúc phải dẫn #/cards");
      assert.ok(text.includes("Thư viện thẻ cảm xúc"), "tile thẻ cảm xúc phải có");
      assert.ok(text.includes("Con cần được lắng nghe"), "tile tín hiệu phải có");
      assert.ok(text.includes("Chưa tham gia chương trình 4 tuần"), "chương trình trung thực khi chưa ghi danh");
      assert.ok(text.includes("Hộp thư trao đổi gần đây"), "mailbox preview phải có");
      assert.ok(text.includes("Mới"), "thư chưa đọc phải có chip Mới");
      unmount(host);
    });
  });

  it("Home caregiver (demo): tự chăm sóc + thẻ lời nhắn + bài học trung thực (w09)", () => {
    const { ctx } = makeCtx({ demo: true, role: "caregiver" });
    const { host, el } = mount(pages.home, ctx);
    return wait(1000).then(() => {
      const text = textOf(el);
      assert.ok(text.includes("Chào Phụ huynh Minh Tâm (minh họa),"));
      assert.ok(text.includes("Tự chăm sóc bản thân"), "mood card người chăm sóc phải có");
      assert.ok(text.includes("Lời nhắn gửi đến anh/chị"), "thẻ lời nhắn phải có");
      assert.ok(text.includes("Đây là nội dung con chủ động gửi cho anh/chị"), "callout an toàn bắt buộc");
      assert.ok(text.includes("Bài học 60 giây"));
      assert.ok(text.includes("Chưa có bài học ngắn nào được phát hành"), "không bịa bài học khi catalog rỗng");
      assert.ok(text.includes("Mở hộp thư"), "nút mở hộp thư phải có");
      assert.ok(text.includes("Tôn trọng không gian riêng của con"), "thẻ cam kết phải có");
      unmount(host);
    });
  });

  it("Home production chưa đăng nhập: trạng thái mời đăng nhập, không gọi adapter", () => {
    clearSession();
    const { ctx } = makeCtx({ demo: false, role: "student", adapter: productionLikeAdapter });
    const { host, el } = mount(pages.home, ctx);
    return wait(60).then(() => {
      const text = textOf(el);
      assert.ok(text.includes("Chưa đăng nhập"), `nhưng thấy: ${text}`);
      assert.ok(findButton(el, "Đăng nhập"));
      assert.ok(!text.includes("Dữ liệu minh họa"), "production không được hiện nhãn demo");
      unmount(host);
    });
  });

  it("Home production đã đăng nhập + chưa có kết nối: mời sang /connect", () => {
    clearSession();
    setSession({ token: "t-production", userId: "u-1", expiresAt: Date.now() + 3600_000 });
    const { ctx, navigateCalls } = makeCtx({
      demo: false,
      role: "student",
      adapter: backendConnectionsAdapter([]),
    });
    const { host, el } = mount(pages.home, ctx);
    return wait(80).then(() => {
      const text = textOf(el);
      assert.ok(text.includes("Chưa kết nối với người đồng hành"), `nhưng thấy: ${text}`);
      const connectBtn = findButton(el, "Kết nối với người đồng hành");
      assert.ok(connectBtn, "phải có CTA kết nối thật");
      connectBtn.click();
      assert.ok(navigateCalls.includes("/connect"), "CTA phải dẫn sang /connect");
      assert.ok(!text.includes("Dữ liệu minh họa"), "production không được hiện nhãn demo");
      clearSession();
      unmount(host);
    });
  });

  it("Home production đã đăng nhập + có kết nối: 'Đang đồng hành' không lộ danh tính", () => {
    clearSession();
    setSession({ token: "t-production", userId: "u-1", expiresAt: Date.now() + 3600_000 });
    const { ctx } = makeCtx({
      demo: false,
      role: "student",
      adapter: backendConnectionsAdapter([
        { connection_id: "c1", other_party_id: "uuid-nguoi-kia", relationship_kind: "primary", generation: 1, status: "active" },
      ]),
    });
    const { host, el } = mount(pages.home, ctx);
    return wait(80).then(() => {
      const text = textOf(el);
      assert.ok(text.includes("kết nối đang hoạt động"), `nhưng thấy: ${text}`);
      assert.ok(text.includes("Người đồng hành chính"));
      assert.ok(!text.includes("uuid-nguoi-kia"), "không được hiện UUID của người kia");
      assert.ok(text.includes("Quản lý kết nối"));
      assert.ok(text.includes("Thư viện thẻ cảm xúc"), "home student giữ các lối tắt mở lời (w08)");
      clearSession();
      unmount(host);
    });
  });

  it("Home production lỗi máy chủ: ErrorState + Thử lại, không fallback mock", () => {
    clearSession();
    setSession({ token: "t-production", userId: "u-1", expiresAt: Date.now() + 3600_000 });
    const { ctx } = makeCtx({
      demo: false,
      role: "student",
      adapter: backendConnectionsAdapter([], { failLists: true }),
    });
    const { host, el } = mount(pages.home, ctx);
    return wait(80).then(() => {
      const text = textOf(el);
      assert.ok(text.includes("Không tải được trang chủ"), `nhưng thấy: ${text}`);
      assert.ok(findButton(el, "Thử lại"));
      assert.ok(!text.includes("Dữ liệu minh họa"), "không được tự chuyển sang dữ liệu minh họa khi API lỗi");
      clearSession();
      unmount(host);
    });
  });

  it("Home thiếu vai trò: hướng về chọn vai trò, không gọi adapter", () => {
    const { ctx } = makeCtx({ demo: false, role: null });
    const { host, el } = mount(pages.home, ctx);
    assert.ok(textOf(el).includes("Chưa chọn vai trò xem trước"));
    unmount(host);
  });

  it("Home destroy: huỷ cập nhật async đang chờ", () => {
    const { ctx } = makeCtx({ demo: true, role: "student" });
    const { host, el } = mount(pages.home, ctx);
    pages.home.destroy();
    return wait(900).then(() => {
      assert.ok(textOf(el).includes("Đang tải trang chủ…"), "không được render nội dung sau destroy");
      assert.ok(!textOf(el).includes("Xin chào"));
      unmount(host);
    });
  });

  it("Hub Đồng hành (F02 web thật — QA 19/10 R07): chưa đăng nhập → gate trung thực, không placeholder tĩnh", () => {
    const { ctx } = makeCtx({ demo: false, role: "student" });
    const { host, el } = mount(pages.companion, ctx);
    const text = textOf(el);
    assert.ok(text.includes("Cần đăng nhập để xem chương trình"),
      "trang thật yêu cầu phiên; không còn WEEKS hardcode");
    assert.ok(!text.includes("Sắp có"), "không còn badge 'Sắp có' giả");
    assert.ok(!text.includes("Tiếng lòng chưa nói"),
      "không còn copy tĩnh của placeholder cũ");
    unmount(host);
  });

  it("Hub Nhật ký: cổng đăng nhập + nhấn mạnh chia sẻ từng trang do người dùng chọn", () => {
    const { ctx } = makeCtx({ demo: false, role: "student" });
    const { host, el } = mount(pages.diary, ctx);
    const text = textOf(el);
    assert.ok(text.includes("Cần đăng nhập để mở nhật ký"));
    assert.ok(text.includes("bạn chọn chia sẻ trang đó"));
    unmount(host);
  });

  it("Hub Cá nhân: đổi vai trò + dẫn tới Cài đặt/Riêng tư thật + phiên bản US-003", () => {
    const { ctx, navigateCalls } = makeCtx({ demo: false, role: "caregiver" });
    const { host, el } = mount(pages.profile, ctx);
    const text = textOf(el);
    assert.ok(text.includes("Người chăm sóc"));
    assert.ok(text.includes("Riêng tư & đồng ý"));
    assert.ok(!text.includes("Sắp có"));
    assert.ok(text.includes("Phiên bản xem trước US-003"));

    const switchBtn = findButton(el, "Đổi vai trò xem trước");
    assert.ok(switchBtn);
    switchBtn.click();
    return wait(20).then(() => {
      assert.equal(getState().role, null);
      assert.ok(navigateCalls.includes("/role-select"));
      const settingsBtn = findButton(el, "Mở Cài đặt (đổi mật khẩu / mã đăng nhập / tên hiển thị)");
      assert.ok(settingsBtn, "phải có nút dẫn tới Cài đặt");
      unmount(host);
    });
  });

  it("Help: 2 đầu mối 'Thông tin đang được xác minh', không số điện thoại, có khối nhà phát triển", () => {
    const { ctx } = makeCtx({});
    const { host, el } = mount(pages.help, ctx);
    const text = textOf(el);
    const verifiedCount = (text.match(/Thông tin đang được xác minh\./g) || []).length;
    assert.ok(verifiedCount >= 2, `phải có >= 2 mục đang xác minh (thấy ${verifiedCount})`);
    assert.ok(text.includes("Thông tin nhà phát triển"));
    assert.ok(text.includes("Family Bridge"));
    assert.ok(text.includes("0.3.0 (US-003)"));
    assert.ok(text.includes("Kênh hỗ trợ/khiếu nại: Thông tin đang được cập nhật."));
    assert.ok(!/\b0\d{8,9}\b/.test(text.replace("0.3.0 (US-003)", "")), "không được chứa số điện thoại");
    assert.ok(!text.includes("24/7"));
    unmount(host);
  });

  it("Not-found: EmptyState + lối về màn hình đầu", () => {
    const { ctx, navigateCalls } = makeCtx({});
    const { host, el } = mount(pages.notFound, ctx);
    assert.ok(textOf(el).includes("Không tìm thấy trang bạn cần"));
    findButton(el, "Về màn hình đầu").click();
    assert.ok(navigateCalls.includes("/welcome"));
    unmount(host);
  });
});

describe("Login web (f01): form mã tài khoản + mật khẩu", () => {
  function jsonResponse(data, { status = 200 } = {}) {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => data,
    };
  }

  function stubFetch(impl) {
    const previous = globalThis.fetch;
    globalThis.fetch = impl;
    return () => { globalThis.fetch = previous; };
  }

  it("chưa đăng nhập: hiện form credential (mã + mật khẩu), không có nút Zalo", () => {
    clearSession();
    const { ctx } = makeCtx({ demo: false });
    const { host, el } = mount(pages.login, ctx);
    const text = textOf(el);
    assert.ok(text.includes("Đăng nhập Family Bridge"), `thấy: ${text.slice(0, 160)}`);
    assert.ok(el.querySelector("#fb-cred-code"), "phải có ô mã tài khoản");
    assert.ok(el.querySelector("#fb-cred-password"), "phải có ô mật khẩu");
    assert.ok(findButton(el, "Đăng nhập vào không gian"), "nút submit phải có");
    assert.ok(!text.includes("Đăng nhập bằng Zalo"), "web không có đường Zalo");
    unmount(host);
  });

  it("thiếu thông tin: bấm submit khi rỗng -> lỗi inline, không gọi mạng", () => {
    clearSession();
    let fetchCalled = false;
    const restore = stubFetch(() => { fetchCalled = true; return Promise.resolve(jsonResponse({})); });
    try {
      const { ctx } = makeCtx({ demo: false });
      const { host, el } = mount(pages.login, ctx);
      findButton(el, "Đăng nhập vào không gian").click();
      return wait(20).then(() => {
        const errorLine = el.querySelector(".fb-cred__error");
        assert.ok(errorLine, "phải có dòng lỗi inline");
        assert.ok(
          (errorLine.textContent || "").includes("Vui lòng nhập đủ mã tài khoản và mật khẩu."),
          `lỗi: ${errorLine.textContent}`,
        );
        assert.equal(fetchCalled, false, "thiếu input phải chặn TRƯỚC mạng");
        unmount(host);
      });
    } finally {
      restore();
    }
  });

  it("sai thông tin (401): thông báo GENERIC 'Mã tài khoản hoặc mật khẩu chưa đúng.' — anti-enumeration", () => {
    clearSession();
    const adapter = createWebAdapter({ baseUrl: "https://api.example.com" });
    const restore = stubFetch(() => Promise.resolve(
      jsonResponse({ error: { code: "not_authenticated", details: { reason: "invalid_credentials" } } }, { status: 401 }),
    ));
    try {
      const { ctx } = makeCtx({ demo: false, adapter });
      const { host, el } = mount(pages.login, ctx);
      el.querySelector("#fb-cred-code").value = "HS001";
      el.querySelector("#fb-cred-password").value = "sai-mat-khau";
      findButton(el, "Đăng nhập vào không gian").click();
      return wait(60).then(() => {
        const errorLine = el.querySelector(".fb-cred__error");
        assert.ok(errorLine, "phải có dòng lỗi inline");
        assert.equal(
          errorLine.textContent, "Mã tài khoản hoặc mật khẩu chưa đúng.",
          "401 phải generic (không tiết lộ mã tồn tại hay không)",
        );
        assert.equal(hasLiveSession(), false, "đăng nhập thất bại không được cài phiên");
        unmount(host);
      });
    } finally {
      restore();
      clearSession();
    }
  });
});

describe("Connection-check", () => {
  it("loading hiển thị text đúng", () => {
    const { ctx } = makeCtx({ demo: true });
    const { host, el } = mount(pages.connectionCheck, ctx);
    assert.ok(textOf(el).includes("Đang kiểm tra kết nối với máy chủ…"));
    pages.connectionCheck.destroy();
    unmount(host);
  });

  it("demo thành công: badge 'Đã kết nối tới máy chủ' + có nút giả lập", () => {
    const { ctx } = makeCtx({ demo: true, adapter: createMockAdapter({ scenario: null }) });
    const { host, el } = mount(pages.connectionCheck, ctx);
    return wait(1600).then(() => {
      const text = textOf(el);
      assert.ok(text.includes("Đã kết nối tới máy chủ"));
      assert.ok(findButton(el, "Giả lập: thành công"));
      assert.ok(findButton(el, "Giả lập: lỗi"));
      assert.ok(findButton(el, "Giả lập: timeout"));
      unmount(host);
    });
  });

  it("demo kịch bản lỗi: ErrorState + nút 'Thử lại'", () => {
    const { ctx } = makeCtx({ demo: true, adapter: createMockAdapter({ scenario: "error" }) });
    const { host, el } = mount(pages.connectionCheck, ctx);
    return wait(1100).then(() => {
      assert.ok(textOf(el).includes("Không kiểm tra được kết nối"));
      const retry = findButton(el, "Thử lại");
      assert.ok(retry, "phải có nút Thử lại");
      unmount(host);
    });
  });

  it("demo: bấm 'Giả lập: lỗi' (rebuildAdapter) chạy lại kiểm tra và ra lỗi", () => {
    const { ctx } = makeCtx({ demo: true, adapter: createMockAdapter({ scenario: null }) });
    const { host, el } = mount(pages.connectionCheck, ctx);
    return wait(1600).then(() => {
      const failBtn = findButton(el, "Giả lập: lỗi");
      assert.ok(failBtn);
      failBtn.click();
      return wait(1100).then(() => {
        assert.ok(textOf(el).includes("Không kiểm tra được kết nối"));
        assert.ok(findButton(el, "Thử lại"));
        unmount(host);
      });
    });
  });

  it("timeout: ErrorState riêng 'Kết nối quá thời gian chờ' + nút 'Thử lại'", () => {
    const { ctx } = makeCtx({ demo: false, adapter: timeoutAdapter });
    const { host, el } = mount(pages.connectionCheck, ctx);
    return wait(80).then(() => {
      const text = textOf(el);
      assert.ok(text.includes("Kết nối quá thời gian chờ"));
      assert.ok(findButton(el, "Thử lại"));
      assert.ok(!text.includes("Giả lập:"), "production không có nút giả lập");
      unmount(host);
    });
  });

  it("destroy: huỷ kiểm tra đang chạy, không cập nhật sau khi rời trang", () => {
    const { ctx } = makeCtx({ demo: true, adapter: createMockAdapter({ scenario: "error" }) });
    const { host, el } = mount(pages.connectionCheck, ctx);
    pages.connectionCheck.destroy();
    return wait(1100).then(() => {
      const text = textOf(el);
      assert.ok(!text.includes("Không kiểm tra được kết nối"), "destroy phải chặn cập nhật");
      unmount(host);
    });
  });
});
