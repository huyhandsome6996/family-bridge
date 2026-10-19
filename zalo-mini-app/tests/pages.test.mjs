// tests/pages.test.mjs — kiểm tra page contract + render không throw cho
// toàn bộ pages của Task 3-b. Chạy: node --test tests/pages.test.mjs
// Yêu cầu: src/components/index.js (barrel của agent design 3-a) đã tồn tại.
// happy-dom globals PHẢI được gắn TRƯỚC khi import động pages.

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
const { createMockAdapter } = await import("../src/core/adapter/mock-adapter.js");
const { ApiError } = await import("../src/core/api/client.mjs");
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
  mailbox: () => import("../src/pages/mailbox/index.js"),
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

// ---------------------------------------------------------------- helpers
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Adapter giả lập hành vi production (boundary 501) — không import config. */
const productionLikeAdapter = {
  mode: "zalo",
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
    mode: "zalo",
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
  mode: "zalo",
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

describe("Page contract (shape)", () => {
  const EXPECTED = [
    ["welcome", { id: "u01-welcome", title: "Family Bridge", requiresRole: false, showBottomNav: false }],
    ["howToUse", { id: "u02-how-to-use", title: "Cách dùng Family Bridge", requiresRole: false, showBottomNav: false }],
    ["roleSelect", { id: "u04-role-select", title: "Chọn vai trò xem trước", requiresRole: false, showBottomNav: false }],
    ["home", { id: "u08-home", title: "Trang chủ", requiresRole: true, showBottomNav: true }],
    ["login", { id: "f01-login", title: "Đăng nhập", requiresRole: false, showBottomNav: false }],
    ["consent", { id: "f01-consent", title: "Đồng ý & quyền riêng tư", requiresRole: false, showBottomNav: false }],
    ["connect", { id: "f01-connect", title: "Kết nối người đồng hành", requiresRole: false, showBottomNav: false }],
    ["companion", { id: "companion", title: "Đồng hành", requiresRole: true, showBottomNav: true }],
    ["mailbox", { id: "mailbox", title: "Hộp thư", requiresRole: true, showBottomNav: true }],
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

describe("Render không throw + copy bắt buộc", () => {
  it("U01 welcome (Stitch): CTA 'Tiếp tục để đăng nhập' + liên kết Trợ giúp luôn hiển thị", () => {
    const { ctx, navigateCalls } = makeCtx({});
    const { host, el } = mount(pages.welcome, ctx);
    const text = textOf(el);
    assert.ok(text.includes("Family Bridge"));
    assert.ok(text.includes("Mở lời nhẹ nhàng, gần nhau hơn"), "headline Stitch phải có");
    assert.ok(text.includes("Cam kết bảo mật & ranh giới"), "thẻ cam kết phải có");
    // CTA chính dẫn đúng luồng thật: /login (đăng nhập ở đó, không tự dựng)
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

  it("Home student (demo): greeting fixture + DemoBanner + dữ liệu thật qua mock (w08)", async () => {
    // PIN UPDATE (task 3-b2, M3): home w08 nối API thật qua adapter. Mock
    // programMy() rỗng → thẻ chương trình trung thực "Chưa tham gia";
    // tile thẻ cảm xúc bật thật (F03) → #/cards; tín hiệu → trang #/signal.
    // Quy tắc không-tự-gửi không đổi (xem qa-no-auto-send).
    const { ctx } = makeCtx({ demo: true, role: "student" });
    const { host, el } = mount(pages.home, ctx);
    await wait(1000);
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

  it("Home caregiver (demo): tự chăm sóc + thẻ lời nhắn + bài học trung thực (w09)", async () => {
    // PIN UPDATE (task 3-b2, M3): caregiver home w09 — thẻ lời nhắn mới nhất
    // qua listMessages + getMessage (mock), callout an toàn bắt buộc; bài
    // học 60 giây đọc catalog F09 thật (mock rỗng → nói rỗng, không bịa).
    const { ctx } = makeCtx({ demo: true, role: "caregiver" });
    const { host, el } = mount(pages.home, ctx);
    await wait(1000);
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

  it("Home student (demo): CTA 'Con cần được lắng nghe' chỉ điều hướng #/signal, không gửi", async () => {
    // PIN UPDATE (task 3-b2, M3): tín hiệu đã có trang riêng #/signal với
    // preview máy chủ + xác nhận cuối; home chỉ dẫn đường — không mở sheet
    // và không gửi gì từ home (bất biến không-tự-gửi giữ nguyên).
    const { ctx } = makeCtx({ demo: true, role: "student" });
    const { host, el } = mount(pages.home, ctx);
    await wait(1000);
    const signalLink = el.querySelector("a[href='#/signal']");
    assert.ok(signalLink, "phải có lối sang #/signal");
    assert.ok(textOf(signalLink).includes("Con cần được lắng nghe"));
    signalLink.click();
    assert.ok(!el.querySelector(".fb-sheet"), "home không được mở sheet gửi tín hiệu");
    assert.doesNotMatch(textOf(el), /đã gửi/i, "không được báo đã gửi");
    const activeSendButtons = Array.from(el.querySelectorAll("button"))
      .filter((btn) => !btn.disabled && textOf(btn).includes("Gửi"));
    assert.equal(activeSendButtons.length, 0, "không được có nút Gửi đang bật trên home");
    unmount(host);
  });

  it("Home production chưa đăng nhập: trạng thái mời đăng nhập, không gọi adapter", async () => {
    clearSession();
    const { ctx } = makeCtx({ demo: false, role: "student", adapter: productionLikeAdapter });
    const { host, el } = mount(pages.home, ctx);
    await wait(60);
    const text = textOf(el);
    assert.ok(text.includes("Chưa đăng nhập"), `nhưng thấy: ${text}`);
    assert.ok(findButton(el, "Đăng nhập"));
    assert.ok(!text.includes("Dữ liệu minh họa"), "production không được hiện nhãn demo");
    unmount(host);
  });

  it("Home production đã đăng nhập + chưa có kết nối: mời sang /connect", async () => {
    clearSession();
    setSession({ token: "t-production", userId: "u-1", expiresAt: Date.now() + 3600_000 });
    const { ctx, navigateCalls } = makeCtx({
      demo: false,
      role: "student",
      adapter: backendConnectionsAdapter([]),
    });
    const { host, el } = mount(pages.home, ctx);
    await wait(80);
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

  it("Home production đã đăng nhập + có kết nối: 'Đang đồng hành' không lộ danh tính", async () => {
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
    await wait(80);
    const text = textOf(el);
    assert.ok(text.includes("kết nối đang hoạt động"), `nhưng thấy: ${text}`);
    assert.ok(text.includes("Người đồng hành chính"));
    assert.ok(!text.includes("uuid-nguoi-kia"), "không được hiện UUID của người kia");
    assert.ok(text.includes("Quản lý kết nối"));
    assert.ok(text.includes("Thư viện thẻ cảm xúc"), "home student giữ các lối tắt mở lời (w08)");
    clearSession();
    unmount(host);
  });

  it("Home production lỗi máy chủ: ErrorState + Thử lại, không fallback mock", async () => {
    clearSession();
    setSession({ token: "t-production", userId: "u-1", expiresAt: Date.now() + 3600_000 });
    const { ctx } = makeCtx({
      demo: false,
      role: "student",
      adapter: backendConnectionsAdapter([], { failLists: true }),
    });
    const { host, el } = mount(pages.home, ctx);
    await wait(80);
    const text = textOf(el);
    assert.ok(text.includes("Không tải được trang chủ"), `nhưng thấy: ${text}`);
    assert.ok(findButton(el, "Thử lại"));
    assert.ok(!text.includes("Dữ liệu minh họa"), "không được tự chuyển sang dữ liệu minh họa khi API lỗi");
    clearSession();
    unmount(host);
  });

  it("Home thiếu vai trò: hướng về chọn vai trò, không gọi adapter", () => {
    const { ctx } = makeCtx({ demo: false, role: null });
    const { host, el } = mount(pages.home, ctx);
    assert.ok(textOf(el).includes("Chưa chọn vai trò xem trước"));
    unmount(host);
  });

  it("Home destroy: huỷ cập nhật async đang chờ", async () => {
    const { ctx } = makeCtx({ demo: true, role: "student" });
    const { host, el } = mount(pages.home, ctx);
    pages.home.destroy();
    await wait(900);
    assert.ok(textOf(el).includes("Đang tải trang chủ…"), "không được render nội dung sau destroy");
    assert.ok(!textOf(el).includes("Xin chào"));
    unmount(host);
  });

  it("Hub Đồng hành (F02 thật): không còn WEEKS hardcode/'Sắp có'; catalog fixture rỗng → empty state trung thực", async () => {
    // PIN UPDATE (F02 task 2026-10-16): trang /companion đọc programMy/
    // programCatalog qua adapter. Mock fixture trả catalog rỗng → trang phải
    // nói trung thực "chưa có chương trình nào được phát hành" và TUYỆT ĐỐI
    // không quay lại copy hardcode "Sắp có" theo tiến độ người dùng.
    setSession({ token: "t-pages", userId: "u-pages", expiresAt: Date.now() + 3600_000 });
    const { ctx } = makeCtx({ demo: false, role: "student" });
    const { host, el } = mount(pages.companion, ctx);
    await wait(400); // mock fixtures chờ ~100ms mỗi call
    const text = textOf(el);
    assert.ok(text.includes("Chưa có chương trình nào được phát hành"),
      `thấy: ${text.slice(0, 220)}`);
    assert.ok(!text.includes("Sắp có"),
      "cấm hồi quy 'Sắp có' hardcode theo tiến độ");
    assert.ok(!text.includes("Xem trước chủ đề"),
      "cấm hồi quy sheet xem trước tĩnh");
    assert.ok(text.includes("sổ giấy"), "ghi chú sổ giấy không ép app");
    unmount(host);
    clearSession();
  });

  it("Hub Hộp thư (w14, PIN UPDATE task 3-b4): danh sách dữ liệu thật từ F05", async () => {
    // PIN UPDATE (task 3-b4, M5a): mailbox w14 nối listMessages/listConnections
    // thật qua adapter (mock trả 1 thư minh họa received-unread) → trang hiện
    // danh sách + chip "Mới", không còn EmptyState tĩnh. Copy trống cũ được
    // GIỮ NGUYÊN ở trạng thái rỗng thật — pin riêng ở test dưới với adapter
    // trả rỗng. Trang giờ là chrome "app" + requiresAuth → test đặt phiên.
    setSession({ token: "t-pages", userId: "u-pages", expiresAt: Date.now() + 3600_000 });
    const { ctx } = makeCtx({ demo: false, role: "student" });
    const { host, el } = mount(pages.mailbox, ctx);
    await wait(400); // mock listMessages chờ ~150ms
    const text = textOf(el);
    assert.ok(text.includes("Hộp thư trao đổi thấu cảm"), `thấy: ${text.slice(0, 200)}`);
    assert.ok(text.includes("Không áp lực trả lời ngay"));
    assert.ok(text.includes("Lời nhắn từ người đồng hành (minh họa)"), "tiêu đề thật từ máy chủ");
    assert.ok(text.includes("Mới"), "thư received-unread phải có chip Mới");
    assert.ok(el.querySelector("a[data-message-id]"), "hàng phải là liên kết sang chi tiết");
    unmount(host);
    clearSession();
  });

  it("Hub Hộp thư rỗng (PIN UPDATE task 3-b4): giữ pin copy cũ + kiểm tra kết nối", async () => {
    // PIN UPDATE (task 3-b4, M5a): trạng thái rỗng THẬT (máy chủ trả rỗng)
    // giữ nguyên copy pin cũ của hub — "Chưa có tin nhắn nào" + mô tả + nút
    // "Kiểm tra kết nối máy chủ".
    setSession({ token: "t-pages", userId: "u-pages", expiresAt: Date.now() + 3600_000 });
    const emptyAdapter = {
      mode: "zalo",
      listMessages: async () => ({ results: [], nextCursor: null }),
      listConnections: async () => ({ results: [], nextCursor: null }),
    };
    const { ctx } = makeCtx({ demo: false, role: "student", adapter: emptyAdapter });
    const { host, el } = mount(pages.mailbox, ctx);
    await wait(50);
    const text = textOf(el);
    assert.ok(text.includes("Chưa có tin nhắn nào"));
    assert.ok(text.includes("Khi hai bên đã kết nối, lời nhắn và phản hồi nhanh sẽ xuất hiện ở đây."));
    assert.ok(findButton(el, "Kiểm tra kết nối máy chủ"));
    unmount(host);
    clearSession();
  });

  it("Hub Nhật ký: chưa mở + nhấn mạnh chia sẻ từng trang do người dùng chọn", () => {
    const { ctx } = makeCtx({ demo: false, role: "student" });
    const { host, el } = mount(pages.diary, ctx);
    const text = textOf(el);
    assert.ok(text.includes("Nhật ký sẽ mở ở bản đầy đủ"));
    assert.ok(text.includes("bạn chọn chia sẻ trang đó"));
    unmount(host);
  });

  it("Hub Cá nhân: đổi vai trò + dẫn tới Cài đặt/Riêng tư thật + phiên bản US-003", () => {
    const { ctx, navigateCalls } = makeCtx({ demo: false, role: "caregiver" });
    const { host, el } = mount(pages.profile, ctx);
    const text = textOf(el);
    assert.ok(text.includes("Người chăm sóc"));
    // M5b (main): Riêng tư & đồng ý đã là trang thật → hàng "Sắp có" bị thay
    // bằng dẫn đường thật tới #/settings và #/privacy (không còn disabled mù).
    // F15 (union): nút phải khả dụng và click phải điều hướng tới /privacy.
    assert.ok(text.includes("Riêng tư & đồng ý"));
    assert.ok(!text.includes("Sắp có"));
    const privacyBtn = findButton(el, "Riêng tư & đồng ý");
    assert.ok(privacyBtn, "phải có nút dẫn tới trang quyền riêng tư");
    assert.ok(!privacyBtn.disabled, "nút phải khả dụng (route đã nối)");
    privacyBtn.click();
    assert.ok(navigateCalls.includes("/privacy"),
      "nhấn nút phải điều hướng tới /privacy");
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

describe("Connection-check", () => {
  it("loading hiển thị text đúng", () => {
    const { ctx } = makeCtx({ demo: true });
    const { host, el } = mount(pages.connectionCheck, ctx);
    assert.ok(textOf(el).includes("Đang kiểm tra kết nối với máy chủ…"));
    pages.connectionCheck.destroy();
    unmount(host);
  });

  it("demo thành công: badge 'Đã kết nối tới máy chủ' + có nút giả lập", async () => {
    const { ctx } = makeCtx({ demo: true, adapter: createMockAdapter({ scenario: null }) });
    const { host, el } = mount(pages.connectionCheck, ctx);
    await wait(1600);
    const text = textOf(el);
    assert.ok(text.includes("Đã kết nối tới máy chủ"));
    assert.ok(findButton(el, "Giả lập: thành công"));
    assert.ok(findButton(el, "Giả lập: lỗi"));
    assert.ok(findButton(el, "Giả lập: timeout"));
    unmount(host);
  });

  it("demo kịch bản lỗi: ErrorState + nút 'Thử lại'", async () => {
    const { ctx } = makeCtx({ demo: true, adapter: createMockAdapter({ scenario: "error" }) });
    const { host, el } = mount(pages.connectionCheck, ctx);
    await wait(1100);
    assert.ok(textOf(el).includes("Không kiểm tra được kết nối"));
    const retry = findButton(el, "Thử lại");
    assert.ok(retry, "phải có nút Thử lại");
    unmount(host);
  });

  it("demo: bấm 'Giả lập: lỗi' (rebuildAdapter) chạy lại kiểm tra và ra lỗi", async () => {
    const { ctx } = makeCtx({ demo: true, adapter: createMockAdapter({ scenario: null }) });
    const { host, el } = mount(pages.connectionCheck, ctx);
    await wait(1600);
    const failBtn = findButton(el, "Giả lập: lỗi");
    assert.ok(failBtn);
    failBtn.click();
    await wait(1100);
    assert.ok(textOf(el).includes("Không kiểm tra được kết nối"));
    assert.ok(findButton(el, "Thử lại"));
    unmount(host);
  });

  it("timeout: ErrorState riêng 'Kết nối quá thời gian chờ' + nút 'Thử lại'", async () => {
    const { ctx } = makeCtx({ demo: false, adapter: timeoutAdapter });
    const { host, el } = mount(pages.connectionCheck, ctx);
    await wait(80);
    const text = textOf(el);
    assert.ok(text.includes("Kết nối quá thời gian chờ"));
    assert.ok(findButton(el, "Thử lại"));
    assert.ok(!text.includes("Giả lập:"), "production không có nút giả lập");
    unmount(host);
  });

  it("destroy: huỷ kiểm tra đang chạy, không cập nhật sau khi rời trang", async () => {
    const { ctx } = makeCtx({ demo: true, adapter: createMockAdapter({ scenario: "error" }) });
    const { host, el } = mount(pages.connectionCheck, ctx);
    pages.connectionCheck.destroy();
    await wait(1100);
    const text = textOf(el);
    assert.ok(!text.includes("Không kiểm tra được kết nối"), "destroy phải chặn cập nhật");
    unmount(host);
  });
});
