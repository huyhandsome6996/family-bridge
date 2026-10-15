// tests/web-screens.test.mjs — Web Render Task 2 (milestone 3-b2 M3+M4).
// Phạm vi:
//  M3 — proposal (w05): checkbox khóa xác nhận; decline gửi reason
//       "wrong_pair"; banner awaiting; KHÔNG "Giám hộ"/"Ban Cố Vấn"/"Lớp 11A".
//  M3 — home: mood pill buộc MÃ CẢM XÚC THẬT của backend F07; thẻ chương
//       trình không gauge/không số bịa.
//  M4 — cards (w10): gửi phải qua preview + xác nhận; filter group truyền
//       đúng param; không "W10 •" nội bộ; không counter bịa.
//  M4 — signal (w16): KHÔNG time-picker; banned copy ["Bảo mật 100%",
//       "Mã hóa nội bộ", "HS-SYNC"]; luồng preview → xác nhận → key.
//  M4 — compose restyle (w11/w12): ring đếm pause có mặt khi paused;
//       copy AI mới; giữ chuỗi pinned cũ. (Phần này được thêm ở milestone M4.)
//
// Pattern happy-dom giống tests/pages.test.mjs: gắn globals TRƯỚC import động.
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
globalThis.KeyboardEvent = domWindow.KeyboardEvent;
globalThis.MouseEvent = domWindow.MouseEvent;
globalThis.location = domWindow.location;

const { describe, it } = await import("node:test");
const assert = (await import("node:assert/strict")).default;

const { initStore, setRole, resetState, getState } = await import("../src/app/store.js");
const { setSession, clearSession } = await import("../src/core/session.js");
const { ApiError } = await import("../src/core/api/client.mjs");
const { createMockAdapter } = await import("../src/core/adapter/mock-adapter.js");

const proposal = (await import("../src/pages/proposal/index.js")).page;
const home = (await import("../src/pages/home/index.js")).page;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Mã cảm xúc cho phép của backend F07 (packages/family_bridge_features/
// f07_mood/models.py — EMOTIONS). Test Home bắt buộc pill dùng đúng mã này.
const F07_EMOTIONS = ["vui", "binh_an", "met", "buon", "lo", "buc", "kho_noi"];

function textOf(el) {
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

function findButton(root, needle) {
  return Array.from(root.querySelectorAll("button")).find(
    (btn) => textOf(btn).includes(needle),
  );
}

function makeCtx({ demo = false, role = "student", adapter = null } = {}) {
  initStore({ demoMode: demo });
  resetState();
  if (role) setRole(role);
  const currentAdapter = adapter || createMockAdapter({ scenario: null });
  const navigateCalls = [];
  return {
    ctx: {
      store: { getState },
      adapter: currentAdapter,
      navigate: (path) => navigateCalls.push(path),
      setRole: (nextRole) => setRole(nextRole),
      rebuildAdapter: () => {},
      params: new URLSearchParams(""),
    },
    adapter: currentAdapter,
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
  document.body.querySelectorAll(".fb-sheet-root, .fb-dialog-root, .fb-overlay").forEach((el) => el.remove());
}

/** Adapter production-giả có phiên: nạp dữ liệu tuỳ scenario qua hooks. */
function fakeWebAdapter({ proposals = [], messages = [], connections = [], moodEntries = [], program = null, weeks = null, activities = [], behavior = {} } = {}) {
  return {
    mode: "zalo",
    listClassProposals: async () => {
      if (behavior.proposalsError) throw behavior.proposalsError;
      return { results: proposals, nextCursor: null };
    },
    confirmClassProposal: async (id) => {
      if (behavior.confirmError) throw behavior.confirmError;
      if (behavior.confirmResult) return behavior.confirmResult(id);
      return { proposal_id: id, status: "awaiting_confirmation", my_confirmed: true, connection: null };
    },
    declineClassProposal: async (id, { reason } = {}) => {
      behavior.declineCalls = behavior.declineCalls || [];
      behavior.declineCalls.push({ id, reason });
      if (behavior.declineError) throw behavior.declineError;
      return { proposal_id: id, status: "declined", reason };
    },
    listConnections: async () => ({ results: connections, nextCursor: null }),
    listMessages: async () => ({ results: messages, next: null }),
    getMessage: async (id) => ({ message_id: id, body: "Nội dung thư thật từ máy chủ." }),
    listMoodEntries: async () => ({ results: moodEntries, next: null }),
    createMoodEntry: async ({ emotion }) => {
      behavior.moodCalls = behavior.moodCalls || [];
      behavior.moodCalls.push(emotion);
      return { entry_id: "e1", entry_date: "2026-10-24", emotion, emotion_label: "Vui", revision: 1 };
    },
    programMy: async () => ({ results: program ? [program] : [] }),
    programWeeks: async (key) => weeks || { results: [], program_key: key },
    activitiesCatalog: async () => ({ results: activities }),
    listCards: async ({ group } = {}) => ({ results: [], truncated: false, maxWindow: 50 }),
    previewCard: async () => { throw new ApiError("not used in M3", 400, "http"); },
    sendCard: async () => { throw new ApiError("not used in M3", 400, "http"); },
    lookupOperation: async (key) => ({ status: "sent", key }),
    signalMeta: async () => ({ needs: [] }),
    signalPreview: async () => { throw new ApiError("not used in M3", 400, "http"); },
    signalSend: async () => { throw new ApiError("not used in M3", 400, "http"); },
    signalAck: async (id) => ({ acknowledged: true, message_id: id }),
  };
}

function withSession() {
  clearSession();
  setSession({ token: "t-web", userId: "u-web", expiresAt: Date.now() + 3600_000 });
}

const PROPOSAL_FIXTURE = {
  proposal_id: "pp-1",
  status: "proposed",
  my_role: "student",
  my_confirmed: false,
  counterpart_confirmed: false,
  counterpart: { display_name: "Người chăm sóc Minh", identity_basis: "self_declared" },
  created_at: "2026-10-24T00:00:00Z",
  updated_at: "2026-10-24T00:00:00Z",
};

/* ================================ M3: PROPOSAL ================================ */

describe("Web M3 — proposal (w05) contract + luồng xác nhận", () => {
  it("page contract: chrome 'app' + requiresAuth (router guard phiên)", () => {
    assert.equal(proposal.id, "proposal");
    assert.equal(proposal.chrome, "app");
    assert.equal(proposal.requiresAuth, true);
    assert.equal(typeof proposal.render, "function");
  });

  it("demo: một đề xuất → thẻ w05, checkbox KHÓA nút xác nhận đến khi tích", async () => {
    const { ctx } = makeCtx({ demo: true, role: "student" });
    const { host, el } = mount(proposal, ctx);
    await wait(400);
    const text = textOf(el);
    assert.ok(text.includes("Xác nhận người đồng hành của bạn"), `thấy: ${text.slice(0, 300)}`);
    assert.ok(text.includes("Người đồng hành (minh họa)") || text.includes("tên tự khai báo"));

    const confirmBtn = findButton(el, "Đúng người, tôi đồng ý kết nối");
    assert.ok(confirmBtn, "thiếu nút xác nhận");
    assert.equal(confirmBtn.disabled, true, "nút xác nhận phải bị khóa trước khi tích tự nguyện");

    const checkbox = el.querySelector("input[type=checkbox]");
    assert.ok(checkbox, "thiếu ô tự nguyện");
    checkbox.click();
    await wait(20);
    assert.equal(confirmBtn.disabled, false, "tích xong phải mở nút xác nhận");
    unmount(host);
  });

  it("demo: xác nhận → máy chủ trả connected → thẻ thành công hai phía", async () => {
    const { ctx } = makeCtx({ demo: true, role: "student" });
    const { host, el } = mount(proposal, ctx);
    await wait(400);
    const checkbox = el.querySelector("input[type=checkbox]");
    checkbox.click();
    const confirmBtn = findButton(el, "Đúng người, tôi đồng ý kết nối");
    confirmBtn.click();
    await wait(600); // mock latency ~150-450ms + re-load list
    const text = textOf(el);
    assert.ok(
      text.includes("Kết nối đã được xác nhận hai phía"),
      `phải hiện thành công hai phía: ${text.slice(0, 400)}`,
    );
    unmount(host);
  });

  it("production: decline 'Không đúng người' → adapter nhận reason 'wrong_pair'", async () => {
    withSession();
    const behavior = {};
    const adapter = fakeWebAdapter({ proposals: [PROPOSAL_FIXTURE], behavior });
    const { ctx } = makeCtx({ demo: false, role: "student", adapter });
    const { host, el } = mount(proposal, ctx);
    await wait(60);

    const declineBtn = findButton(el, "Không đúng người / Từ chối");
    assert.ok(declineBtn, "thiếu nút từ chối");
    declineBtn.click();
    await wait(40);
    const dialog = document.body.querySelector(".fb-dialog");
    assert.ok(dialog, "phải có dialog xác nhận từ chối (destructive)");
    const dialogConfirm = Array.from(dialog.querySelectorAll("button")).find(
      (btn) => textOf(btn).includes("Từ chối ghép đôi"),
    );
    assert.ok(dialogConfirm);
    dialogConfirm.click();
    await wait(60);
    assert.equal((behavior.declineCalls || []).length, 1, "decline phải được gọi đúng 1 lần");
    assert.equal(behavior.declineCalls[0].reason, "wrong_pair", "reason phải là wrong_pair theo hợp đồng backend");
    unmount(host);
  });

  it("production: trạng thái awaiting_confirmation → banner chờ, không đếm ngược", async () => {
    withSession();
    const adapter = fakeWebAdapter({
      proposals: [{ ...PROPOSAL_FIXTURE, status: "awaiting_confirmation" }],
    });
    const { ctx } = makeCtx({ demo: false, role: "student", adapter });
    const { host, el } = mount(proposal, ctx);
    await wait(60);
    const text = textOf(el);
    assert.ok(text.includes("Đang chờ phía kia xác nhận"), `thấy: ${text.slice(0, 300)}`);
    assert.ok(!/\d{2}:\d{2}/.test(text), "không được có countdown");
    unmount(host);
  });

  it("production: không có đề xuất → empty state + lối #/connect", async () => {
    withSession();
    const adapter = fakeWebAdapter({ proposals: [] });
    const { ctx, navigateCalls } = makeCtx({ demo: false, role: "student", adapter });
    const { host, el } = mount(proposal, ctx);
    await wait(60);
    const text = textOf(el);
    assert.ok(text.includes("Chưa có đề xuất kết nối nào từ lớp."), `thấy: ${text}`);
    const action = findButton(el, "Mở mục Người đồng hành");
    action.click();
    assert.ok(navigateCalls.includes("/connect"));
    unmount(host);
  });

  it("production: lỗi confirm proposal_blocked_by_open_invite → copy + lối #/connect", async () => {
    withSession();
    const adapter = fakeWebAdapter({
      proposals: [PROPOSAL_FIXTURE],
      behavior: {
        confirmError: new ApiError("blocked", 409, "http", { code: "proposal_blocked_by_open_invite" }),
      },
    });
    const { ctx } = makeCtx({ demo: false, role: "student", adapter });
    const { host, el } = mount(proposal, ctx);
    await wait(60);
    el.querySelector("input[type=checkbox]").click();
    const confirmBtn = findButton(el, "Đúng người, tôi đồng ý kết nối");
    confirmBtn.click();
    await wait(60);
    const text = textOf(el);
    assert.ok(text.includes("Bạn còn lời mời kết nối khác đang chờ"), `thấy: ${text.slice(0, 400)}`);
    assert.ok(el.querySelector("a[href='#/connect']"), "phải có lối #/connect");
    unmount(host);
  });

  it("production: lỗi confirm consent_required → copy + lối #/consent", async () => {
    withSession();
    const adapter = fakeWebAdapter({
      proposals: [PROPOSAL_FIXTURE],
      behavior: {
        confirmError: new ApiError("consent", 403, "http", { code: "consent_required" }),
      },
    });
    const { ctx } = makeCtx({ demo: false, role: "student", adapter });
    const { host, el } = mount(proposal, ctx);
    await wait(60);
    el.querySelector("input[type=checkbox]").click();
    findButton(el, "Đúng người, tôi đồng ý kết nối").click();
    await wait(60);
    const text = textOf(el);
    assert.ok(text.includes("đồng ý sử dụng"), `thấy: ${text.slice(0, 400)}`);
    assert.ok(el.querySelector("a[href='#/consent']"), "phải có lối #/consent");
    unmount(host);
  });

  it("BẢN DỊCH AN TOÀN: không chứa 'Giám hộ'/'Ban Cố Vấn'/'Lớp 11A' (identity bug Stitch)", async () => {
    const { ctx } = makeCtx({ demo: true, role: "student" });
    const { host, el } = mount(proposal, ctx);
    await wait(400);
    const text = textOf(el);
    for (const banned of ["Giám hộ", "Ban Cố Vấn", "Lớp 11A"]) {
      assert.ok(!text.includes(banned), `không được chứa "${banned}"`);
    }
    unmount(host);
  });
});

/* ================================ M3: HOME ================================ */

describe("Web M3 — home: mood pill + chương trình trung thực", () => {
  it("5 mood pill phải búng MÃ CẢM XÚC THẬT của backend F07", async () => {
    withSession();
    const adapter = fakeWebAdapter({
      connections: [
        { connection_id: "c1", other_party_id: "uuid-peer", relationship_kind: "primary", generation: 1, status: "active", counterpart: { display_name: "Người chăm sóc Minh" } },
      ],
    });
    const { ctx } = makeCtx({ demo: false, role: "student", adapter });
    const { host, el } = mount(home, ctx);
    await wait(80);
    const pills = Array.from(el.querySelectorAll("button[data-emotion]"));
    assert.equal(pills.length, 5, `phải có đúng 5 pill (thấy ${pills.length})`);
    for (const pill of pills) {
      assert.ok(
        F07_EMOTIONS.includes(pill.dataset.emotion),
        `pill "${pill.dataset.emotion}" không nằm trong EMOTIONS của backend f07`,
      );
    }
    unmount(host);
  });

  it("chọn mood pill → createMoodEntry nhận MÃ F07 thật, không emoji tự chế", async () => {
    withSession();
    const behavior = {};
    const adapter = fakeWebAdapter({
      connections: [
        { connection_id: "c1", other_party_id: "uuid-peer", relationship_kind: "primary", generation: 1, status: "active", counterpart: { display_name: "Người chăm sóc Minh" } },
      ],
      behavior,
    });
    const { ctx } = makeCtx({ demo: false, role: "student", adapter });
    const { host, el } = mount(home, ctx);
    await wait(80);
    const pill = el.querySelector("button[data-emotion='kho_noi']");
    assert.ok(pill, "phải có pill kho_noi (F07)");
    pill.click();
    await wait(60);
    assert.deepEqual(behavior.moodCalls, ["kho_noi"], "createMoodEntry phải nhận mã F07");
    assert.ok(textOf(el).includes("Khó nói thành lời") || textOf(el).includes("kho_noi"));
    unmount(host);
  });

  it("chương trình đã ghi danh: tuần + bước từ máy chủ, KHÔNG gauge/phần trăm", async () => {
    withSession();
    const adapter = fakeWebAdapter({
      connections: [
        { connection_id: "c1", other_party_id: "uuid-peer", relationship_kind: "primary", generation: 1, status: "active", counterpart: { display_name: "Người chăm sóc Minh" } },
      ],
      program: { enrollment_id: "en-1", program_key: "bridge_4w", program_revision: 1, active: true, joined_at: "2026-10-01T00:00:00Z" },
      weeks: {
        program_key: "bridge_4w",
        pinned_revision: 1,
        suggested_week: 1,
        weeks: [
          { week_no: 1, title: "Nhận diện cảm xúc & Tiếng lòng chưa nói", activities: [
            { activity_key: "w1_buoi_tro_chuyen", status: "none" },
            { activity_key: "w1_ghi_nhat_ky", status: "done" },
          ] },
        ],
      },
    });
    const { ctx } = makeCtx({ demo: false, role: "student", adapter });
    const { host, el } = mount(home, ctx);
    await wait(80);
    const text = textOf(el);
    assert.ok(text.includes("Nhận diện cảm xúc & Tiếng lòng chưa nói"), `tuần phải từ máy chủ: ${text.slice(0, 500)}`);
    assert.ok(text.includes("w1_ghi_nhat_ky"), "bước phải hiển thị từ dữ liệu weeks");
    assert.ok(!text.includes("%"), "không được có gauge phần trăm");
    assert.ok(!/\b1\/4\b/.test(text), "không được có số bước bịa kiểu 1/4");
    unmount(host);
  });

  it("hộp thư preview: chip 'Mới' chỉ cho received && !read; thư gửi ghi 'Gửi lúc'", async () => {
    withSession();
    const adapter = fakeWebAdapter({
      connections: [
        { connection_id: "c1", other_party_id: "uuid-peer", relationship_kind: "primary", generation: 1, status: "active", counterpart: { display_name: "Người chăm sóc Minh" } },
      ],
      messages: [
        { message_id: "m1", kind: "text", direction: "received", title: "Thư từ mẹ", created_at: "2026-10-24T10:00:00Z", read: false },
        { message_id: "m2", kind: "text", direction: "sent", title: "", created_at: "2026-10-23T09:00:00Z", read: true },
      ],
    });
    const { ctx } = makeCtx({ demo: false, role: "student", adapter });
    const { host, el } = mount(home, ctx);
    await wait(80);
    const text = textOf(el);
    assert.ok(text.includes("Thư từ mẹ"));
    assert.ok(text.includes("Mới"), "thư chưa đọc phải có chip Mới");
    assert.ok(text.includes("Gửi lúc"), "thư gửi đi phải ghi Gửi lúc");
    unmount(host);
  });
});
