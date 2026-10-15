// tests/web-screens.test.mjs — Web Render Task 2 (milestone 3-b2 M3 + 3-b3 M4).
// Phạm vi:
//  M3 — proposal (w05): checkbox khóa xác nhận; decline gửi reason
//       "wrong_pair"; banner awaiting; KHÔNG "Giám hộ"/"Ban Cố Vấn"/"Lớp 11A".
//  M3 — home: mood pill buộc MÃ CẢM XÚC THẬT của backend F07; thẻ chương
//       trình không gauge/không số bịa.
//  M4 — cards (w10): gửi phải qua preview + xác nhận; filter group truyền
//       đúng param; không "W10 •"; không counter bịa; lỗi -> KẾT QUẢ CHƯA XÁC
//       ĐỊNH + tra cứu /operations/{key}.
//  M4 — signal (w16): KHÔNG time-picker; banned copy ["Bảo mật 100%",
//       "Mã hóa nội bộ", "HS-SYNC-2025"]; luồng preview -> xác nhận -> key;
//       caregiver ack; 3 nhu cầu từ meta.
//  M4 — compose restyle (w11/w12): ring đếm pause có mặt khi paused;
//       layout 2 cột (.fb-compose-grid); AI refine thật (aiRefine -> aiAccept
//       chỉ điền textarea); KHÔNG setInterval (giữ nguyên bất biến QA).
//  M5a — mailbox (w14): danh sách title-only từ F05 (KHÔNG body/snippet),
//       nhóm lọc kind+reply_to, tìm kiếm trong cửa sổ đã tải, phân trang
//       cursor thật, "Mới"/"Gửi lúc"/"Nhận lúc" — không xác nhận xem 2 chiều.
//  M5a — message (w15): markRead CHỈ received-unread; quickReplies rỗng
//       (library_not_configured) → ẩn chip; gửi reply = kind "text" +
//       reply_to + key; lỗi -> KẾT QUẢ CHƯA XÁC ĐỊNH + lookupOperation.
//
// Pattern happy-dom giống tests/pages.test.mjs: gắn globals TRƯỚC import động.
import { register } from "node:module";
await register(new URL("./asset-hook.mjs", import.meta.url));
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
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
const cards = (await import("../src/pages/cards/index.js")).page;
const signal = (await import("../src/pages/signal/index.js")).page;
const compose = (await import("../src/pages/compose/index.js")).page;
const mailbox = (await import("../src/pages/mailbox/index.js")).page;
const messagePage = (await import("../src/pages/message/index.js")).page;
const settings = (await import("../src/pages/settings/index.js")).page;
const privacyPage = (await import("../src/pages/privacy/index.js")).page;

const ROOT = resolve(import.meta.dirname, "..");
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

function makeCtx({ demo = false, role = "student", adapter = null, params = "" } = {}) {
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
      params: new URLSearchParams(params),
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
function fakeWebAdapter({
  proposals = [], messages = [], connections = [], moodEntries = [],
  program = null, weeks = null, activities = [], cards = [], needs = [],
  behavior = {},
} = {}) {
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
    // ---- M4: F03 thẻ cảm xúc (ghi lại mọi call để pin hợp đồng) ----
    listCards: async (args = {}) => {
      behavior.listCardsCalls = behavior.listCardsCalls || [];
      behavior.listCardsCalls.push({ group: args.group || null, limit: args.limit });
      const rows = args.group ? cards.filter((c) => c.group_code === args.group) : cards;
      return { results: rows, truncated: false, maxWindow: 50 };
    },
    previewCard: async (args = {}) => {
      behavior.previewCalls = behavior.previewCalls || [];
      behavior.previewCalls.push(args);
      if (behavior.previewError) throw behavior.previewError;
      return { preview_id: "pv-1", card_id: args.cardId, version: args.version, recipient_id: args.recipientId };
    },
    sendCard: async (args = {}) => {
      behavior.sendCardCalls = behavior.sendCardCalls || [];
      behavior.sendCardCalls.push(args);
      if (behavior.sendCardError) throw behavior.sendCardError;
      return { message_id: "msg-card-1", state: "sent", card: { card_id: args.cardId } };
    },
    lookupOperation: async (key) => {
      behavior.lookupCalls = behavior.lookupCalls || [];
      behavior.lookupCalls.push(key);
      return behavior.lookupResult || { status: "sent", key };
    },
    // ---- M4: F10 tín hiệu + F04 AI ----
    signalMeta: async () => ({ needs }),
    signalPreview: async (args = {}) => {
      behavior.signalPreviewCalls = behavior.signalPreviewCalls || [];
      behavior.signalPreviewCalls.push(args);
      if (behavior.signalPreviewError) throw behavior.signalPreviewError;
      const row = needs.find((n) => n.need === args.need);
      return {
        need: args.need,
        label: row ? row.label : args.need,
        body: `Con cần được lắng nghe — ${row ? row.label : args.need}.`,
        recipient_id: args.recipientId,
      };
    },
    signalSend: async (args = {}) => {
      behavior.signalSendCalls = behavior.signalSendCalls || [];
      behavior.signalSendCalls.push(args);
      if (behavior.signalSendError) throw behavior.signalSendError;
      return { message_id: "msg-signal-1", need: args.need, state: "sent" };
    },
    signalAck: async (id) => {
      behavior.signalAckCalls = behavior.signalAckCalls || [];
      behavior.signalAckCalls.push(id);
      return { acknowledged: true, message_id: id };
    },
    aiStatus: async () => behavior.aiStatusResult || { ai_enabled: false },
    aiRefine: async () => { throw new ApiError("not used", 400, "http"); },
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

/* ================================ M4: CARDS ================================ */

const PEER_CONNECTION = {
  connection_id: "c1",
  other_party_id: "uuid-peer",
  relationship_kind: "primary",
  generation: 1,
  status: "active",
  counterpart: { display_name: "Người chăm sóc Minh" },
};

const CARD_FIXTURE = [
  { card_id: "card-1", version: 1, group_code: "ap_luc", title: "Khi thấy áp lực điểm số", body: "Con cảm thấy hơi ngợp vì một số dự định tuần này...", audience: "student", status: "published" },
  { card_id: "card-2", version: 2, group_code: "ranh_gioi", title: "Cần khoảng lặng riêng", body: "Hôm nay năng lượng của con hơi thấp...", audience: "student", status: "published" },
  { card_id: "card-3", version: 1, group_code: "mong_thau_hieu", title: "Mong được lắng nghe", body: "Có một chuyện con muốn tâm sự với bố mẹ...", audience: "student", status: "published" },
];

const NEEDS_FIXTURE = [
  { need: "muon_tro_chuyen", label: "Một buổi trò chuyện yên tĩnh (máy chủ)" },
  { need: "muon_duoc_o_ben", label: "Cần có người ở bên cạnh (máy chủ)" },
  { need: "muon_hen_gio", label: "Hẹn thời điểm trong tuần (máy chủ)" },
];

describe("Web M4 — cards (w10): preview + xác nhận chốt gửi, filter group thật", () => {
  it("page contract: chrome 'app' + requiresAuth", () => {
    assert.equal(cards.id, "cards");
    assert.equal(cards.chrome, "app");
    assert.equal(cards.requiresAuth, true);
    assert.equal(typeof cards.render, "function");
  });

  it("select thẻ -> sheet: gửi bị CHẶN đến khi preview + xác nhận; key gắn ở nút xác nhận", async () => {
    withSession();
    const behavior = {};
    const adapter = fakeWebAdapter({ connections: [PEER_CONNECTION], cards: CARD_FIXTURE, behavior });
    const { ctx } = makeCtx({ demo: false, role: "student", adapter });
    const { host, el } = mount(cards, ctx);
    await wait(80);

    // Header không lộ mã nội bộ "W10 •".
    assert.ok(!textOf(el).includes("W10 •"), "không được có copy nội bộ 'W10 •'");

    const tile = el.querySelector(".fb-cards-tile[data-card-id='card-1']");
    assert.ok(tile, "phải có tile thẻ card-1");
    tile.click();
    await wait(20);
    const sheet = document.body.querySelector(".fb-sheet");
    assert.ok(sheet, "chọn thẻ phải mở sheet role=dialog");
    assert.equal(sheet.getAttribute("role"), "dialog");

    // Gửi CHƯA được gọi khi chưa preview + chưa chọn người nhận.
    assert.equal((behavior.previewCalls || []).length, 0);
    assert.equal((behavior.sendCardCalls || []).length, 0);

    const previewBtn = Array.from(sheet.querySelectorAll("button")).find(
      (btn) => textOf(btn).includes("Xem trước"),
    );
    assert.ok(previewBtn, "sheet phải có nút Xem trước");
    assert.equal(previewBtn.disabled, true, "Xem trước phải chặn khi chưa chọn người nhận");

    // Chọn người nhận (kết nối active thật từ listConnections).
    const select = sheet.querySelector("select");
    assert.ok(select, "sheet phải có select người nhận");
    select.value = "uuid-peer";
    select.dispatchEvent(new domWindow.Event("change", { bubbles: true }));
    await wait(10);
    assert.equal(previewBtn.disabled, false, "chọn người nhận xong phải mở nút Xem trước");

    previewBtn.click();
    await wait(60);
    assert.equal((behavior.previewCalls || []).length, 1, "previewCard phải được gọi đúng 1 lần");
    assert.equal((behavior.sendCardCalls || []).length, 0, "sendCard KHÔNG được gọi khi mới preview");
    assert.ok(textOf(sheet).includes("Gửi tới Người chăm sóc Minh?"), "phải có section xác nhận 'Gửi tới {name}?'");

    const sendBtn = Array.from(sheet.querySelectorAll("button")).find(
      (btn) => textOf(btn) === "Gửi thẻ",
    );
    assert.ok(sendBtn, "phải có nút 'Gửi thẻ' trong section xác nhận");
    sendBtn.click();
    await wait(60);

    assert.equal((behavior.sendCardCalls || []).length, 1, "sendCard chỉ chạy sau xác nhận");
    const sendArgs = behavior.sendCardCalls[0];
    assert.equal(sendArgs.cardId, "card-1");
    assert.equal(sendArgs.version, 1);
    assert.equal(sendArgs.recipientId, "uuid-peer");
    assert.ok(sendArgs.key, "sendCard PHẢI nhận key idempotency (crypto.randomUUID)");

    assert.ok(textOf(sheet).includes("Thẻ đã được gửi qua xác nhận của bạn"), "phải có copy thành công");
    assert.ok(sheet.querySelector("a[href='#/mailbox']"), "phải có link #/mailbox sau khi gửi");
    unmount(host);
  });

  it("filter pill -> listCards nhận param group thật; 'Tất cả' bỏ lọc; counter từ cửa sổ đã tải", async () => {
    withSession();
    const behavior = {};
    const adapter = fakeWebAdapter({ connections: [PEER_CONNECTION], cards: CARD_FIXTURE, behavior });
    const { ctx } = makeCtx({ demo: false, role: "student", adapter });
    const { host, el } = mount(cards, ctx);
    await wait(80);

    assert.equal(behavior.listCardsCalls[0].group, null, "lần đầu phải tải tất cả (group null)");
    assert.ok(textOf(el).includes("3 thẻ"), `counter phải theo cửa sổ đã tải: ${textOf(el).slice(0, 200)}`);
    assert.equal(el.querySelectorAll(".fb-cards-tile").length, 3);

    const pill = el.querySelector(".fb-cards-pill[data-group='ap_luc']");
    assert.ok(pill, "phải có pill nhóm ap_luc (mã nhóm thật trong dữ liệu)");
    assert.ok(textOf(pill).includes("Áp lực học tập & kỳ vọng"), "pill phải mang nhãn tiếng Việt");
    pill.click();
    await wait(80);

    assert.equal(
      behavior.listCardsCalls[behavior.listCardsCalls.length - 1].group,
      "ap_luc",
      "pill nhóm phải truyền đúng param group cho listCards",
    );
    assert.equal(el.querySelectorAll(".fb-cards-tile").length, 1);

    const allPill = Array.from(el.querySelectorAll(".fb-cards-pill")).find(
      (node) => textOf(node) === "Tất cả",
    );
    allPill.click();
    await wait(80);
    assert.equal(
      behavior.listCardsCalls[behavior.listCardsCalls.length - 1].group,
      null,
      "'Tất cả' phải bỏ lọc",
    );
    unmount(host);
  });

  it("nhóm rỗng -> empty state trung thực theo nhóm; catalog rỗng -> honest empty", async () => {
    withSession();
    const behavior = {};
    const adapter = fakeWebAdapter({ connections: [PEER_CONNECTION], cards: [], behavior });
    const { ctx } = makeCtx({ demo: false, role: "student", adapter });
    const { host, el } = mount(cards, ctx);
    await wait(80);
    assert.ok(
      textOf(el).includes("Thư viện chưa có thẻ nào được xuất bản"),
      `catalog rỗng phải nói thật: ${textOf(el).slice(0, 200)}`,
    );
    unmount(host);
  });

  it("gửi lỗi -> KẾT QUẢ CHƯA XÁC ĐỊNH + 'Kiểm tra trạng thái gửi' -> lookupOperation(key)", async () => {
    withSession();
    const behavior = {
      sendCardError: new ApiError("mất kết nối", 0, "timeout"),
    };
    const adapter = fakeWebAdapter({ connections: [PEER_CONNECTION], cards: CARD_FIXTURE, behavior });
    const { ctx } = makeCtx({ demo: false, role: "student", adapter });
    const { host, el } = mount(cards, ctx);
    await wait(80);

    el.querySelector(".fb-cards-tile[data-card-id='card-1']").click();
    await wait(20);
    const sheet = document.body.querySelector(".fb-sheet");
    const select = sheet.querySelector("select");
    select.value = "uuid-peer";
    select.dispatchEvent(new domWindow.Event("change", { bubbles: true }));
    await wait(10);
    const previewBtn = Array.from(sheet.querySelectorAll("button")).find(
      (btn) => textOf(btn).includes("Xem trước"),
    );
    previewBtn.click();
    await wait(60);
    const sendBtn = Array.from(sheet.querySelectorAll("button")).find(
      (btn) => textOf(btn) === "Gửi thẻ",
    );
    sendBtn.click();
    await wait(60);

    const sheetText = textOf(sheet);
    assert.ok(sheetText.includes("KẾT QUẢ CHƯA XÁC ĐỊNH"), `phải dùng copy unknown-outcome: ${sheetText.slice(0, 300)}`);
    assert.ok(sheetText.includes("không gửi lại ngay"), "phải cảnh báo không gửi lại ngay");

    const lookupBtn = Array.from(sheet.querySelectorAll("button")).find(
      (btn) => textOf(btn).includes("Kiểm tra trạng thái gửi"),
    );
    assert.ok(lookupBtn, "phải có nút tra cứu trạng thái");
    lookupBtn.click();
    await wait(60);
    assert.equal((behavior.lookupCalls || []).length, 1, "lookupOperation phải được gọi đúng 1 lần");
    assert.equal(
      behavior.lookupCalls[0],
      behavior.sendCardCalls[0].key,
      "tra cứu phải dùng đúng key của lượt gửi",
    );
    assert.ok(textOf(sheet).includes("ĐÃ thành công"), "trạng thái sent phải được báo thật");
    unmount(host);
  });
});

/* ================================ M4: SIGNAL ================================ */

describe("Web M4 — signal (w16): 3 nhu cầu từ meta, preview -> phát, caregiver ack", () => {
  it("page contract: chrome 'app' + requiresAuth", () => {
    assert.equal(signal.id, "signal");
    assert.equal(signal.chrome, "app");
    assert.equal(signal.requiresAuth, true);
    assert.equal(typeof signal.render, "function");
  });

  it("student: 3 nhu cầu render từ signalMeta (nhãn máy chủ ưu tiên), KHÔNG time-picker", async () => {
    withSession();
    const adapter = fakeWebAdapter({ connections: [PEER_CONNECTION], needs: NEEDS_FIXTURE });
    const { ctx } = makeCtx({ demo: false, role: "student", adapter });
    const { host, el } = mount(signal, ctx);
    await wait(80);

    const needButtons = el.querySelectorAll("button[data-need]");
    assert.equal(needButtons.length, 3, "phải có đúng 3 nhu cầu từ meta");
    const codes = Array.from(needButtons).map((btn) => btn.dataset.need);
    assert.deepEqual(codes, ["muon_tro_chuyen", "muon_duoc_o_ben", "muon_hen_gio"]);
    for (const btn of needButtons) {
      const row = NEEDS_FIXTURE.find((n) => n.need === btn.dataset.need);
      assert.ok(textOf(btn).includes(row.label), "nhãn phải lấy từ meta của máy chủ");
    }
    const text = textOf(el);
    assert.ok(!text.includes("Tối nay sau"), "KHÔNG được có time-picker (API không có trường thời gian)");
    assert.ok(el.querySelector("a[href='#/help']"), "lưu ý an toàn phải dẫn #/help");
    unmount(host);
  });

  it("student: meta thiếu -> fallback nhãn tiếng Việt 3 nhu cầu", async () => {
    withSession();
    const adapter = fakeWebAdapter({ connections: [PEER_CONNECTION], needs: [] });
    const { ctx } = makeCtx({ demo: false, role: "student", adapter });
    const { host, el } = mount(signal, ctx);
    await wait(80);
    const text = textOf(el);
    assert.ok(text.includes("Một buổi trò chuyện yên tĩnh"), "fallback muon_tro_chuyen");
    assert.ok(text.includes("Cần có người ở bên cạnh"), "fallback muon_duoc_o_ben");
    assert.ok(text.includes("Hẹn thời điểm trong tuần"), "fallback muon_hen_gio");
    unmount(host);
  });

  it("student: preview TRƯỚC khi gửi; send disabled đến khi có preview; body/headers đúng hợp đồng", async () => {
    withSession();
    const behavior = {};
    const adapter = fakeWebAdapter({ connections: [PEER_CONNECTION], needs: NEEDS_FIXTURE, behavior });
    const { ctx } = makeCtx({ demo: false, role: "student", adapter });
    const { host, el } = mount(signal, ctx);
    await wait(80);

    const needBtn = el.querySelector("button[data-need='muon_tro_chuyen']");
    const previewBtn = el.querySelector(".fb-signal-preview-btn");
    const sendBtn = el.querySelector(".fb-signal-send-btn");
    assert.equal(sendBtn.disabled, true, "chưa chọn nhu cầu -> nút phát phải disabled");

    needBtn.click();
    await wait(20);
    assert.equal(previewBtn.disabled, false, "chọn nhu cầu -> mở Xem trước");
    assert.equal(sendBtn.disabled, true, "chưa preview -> KHÔNG được phát");
    assert.equal((behavior.signalPreviewCalls || []).length, 0);

    previewBtn.click();
    await wait(60);
    assert.equal((behavior.signalPreviewCalls || []).length, 1);
    assert.deepEqual(behavior.signalPreviewCalls[0], {
      need: "muon_tro_chuyen",
      recipientId: "uuid-peer",
    }, "preview phải gửi đúng DTO (need, recipientId) — server render text");
    assert.ok(textOf(el).includes("Con cần được lắng nghe"), "preview phải hiện văn bản máy chủ");
    assert.equal(sendBtn.disabled, false, "sau preview -> nút phát mở (vẫn là nút xác nhận cuối)");

    sendBtn.click();
    await wait(60);
    assert.equal((behavior.signalSendCalls || []).length, 1);
    const sent = behavior.signalSendCalls[0];
    assert.equal(sent.need, "muon_tro_chuyen", "body need đúng");
    assert.equal(sent.recipientId, "uuid-peer", "body recipientId đúng");
    assert.ok(sent.key, "header idempotency key phải do client tạo (crypto.randomUUID)");
    assert.ok(textOf(el).includes("Tín hiệu đã được phát qua xác nhận của bạn"), "copy thành công");
    assert.ok(textOf(el).includes("Người chăm sóc sẽ thấy tín hiệu trong Hộp thư."), "copy hộp thư");
    assert.ok(el.querySelector("a[href='#/mailbox']"), "phải có link #/mailbox");
    unmount(host);
  });

  it("student: banned copy vắng mặt (Bảo mật 100% / Mã hóa nội bộ / HS-SYNC-2025)", async () => {
    withSession();
    const adapter = fakeWebAdapter({ connections: [PEER_CONNECTION], needs: NEEDS_FIXTURE });
    const { ctx } = makeCtx({ demo: false, role: "student", adapter });
    const { host, el } = mount(signal, ctx);
    await wait(80);
    const text = textOf(el);
    for (const banned of ["Bảo mật 100%", "Mã hóa nội bộ", "HS-SYNC-2025"]) {
      assert.ok(!text.includes(banned), `không được chứa "${banned}"`);
    }
    assert.ok(text.includes("Riêng tư theo thiết kế • Chỉ hai người trong kết nối"), "banner trung thực");
    assert.ok(text.includes("Không hứa trực 24/7"), "footer phải giữ 'Không hứa trực 24/7'");
    unmount(host);
  });

  it("student: gửi lỗi -> KẾT QUẢ CHƯA XÁC ĐỊNH + tra cứu lookupOperation(key)", async () => {
    withSession();
    const behavior = { signalSendError: new ApiError("mất kết nối", 0, "timeout") };
    const adapter = fakeWebAdapter({ connections: [PEER_CONNECTION], needs: NEEDS_FIXTURE, behavior });
    const { ctx } = makeCtx({ demo: false, role: "student", adapter });
    const { host, el } = mount(signal, ctx);
    await wait(80);

    el.querySelector("button[data-need='muon_duoc_o_ben']").click();
    await wait(20);
    el.querySelector(".fb-signal-preview-btn").click();
    await wait(60);
    el.querySelector(".fb-signal-send-btn").click();
    await wait(60);

    const text = textOf(el);
    assert.ok(text.includes("KẾT QUẢ CHƯA XÁC ĐỊNH"), `unknown-outcome: ${text.slice(0, 300)}`);
    assert.ok(text.includes("không gửi lại ngay"));
    const lookupBtn = findButton(el, "Kiểm tra trạng thái gửi");
    assert.ok(lookupBtn, "phải có nút tra cứu");
    lookupBtn.click();
    await wait(60);
    assert.equal((behavior.lookupCalls || []).length, 1);
    assert.equal(behavior.lookupCalls[0], behavior.signalSendCalls[0].key);
    unmount(host);
  });

  it("student: không có kết nối active -> empty 'Kết nối với người đồng hành trước' + #/connect", async () => {
    withSession();
    const adapter = fakeWebAdapter({ connections: [], needs: NEEDS_FIXTURE });
    const { ctx, navigateCalls } = makeCtx({ demo: false, role: "student", adapter });
    const { host, el } = mount(signal, ctx);
    await wait(80);
    assert.ok(textOf(el).includes("Kết nối với người đồng hành trước"));
    findButton(el, "Đến trang Kết nối").click();
    assert.ok(navigateCalls.includes("/connect"));
    unmount(host);
  });

  it("caregiver: hàng listening_signal từ listMessages -> signalAck(id) + link #/messages/{id}", async () => {
    withSession();
    const behavior = {};
    const adapter = fakeWebAdapter({
      messages: [
        { message_id: "sg-1", kind: "listening_signal", direction: "received", title: "Tín hiệu lắng nghe", created_at: "2026-10-24T09:00:00Z", read: false },
        { message_id: "m-text", kind: "text", direction: "received", title: "Th thường", created_at: "2026-10-24T09:00:00Z", read: true },
      ],
      behavior,
    });
    const { ctx } = makeCtx({ demo: false, role: "caregiver", adapter });
    const { host, el } = mount(signal, ctx);
    await wait(80);

    const rows = el.querySelectorAll(".fb-signal-row");
    assert.equal(rows.length, 1, "chỉ hiện kind listening_signal (không phải thư text)");
    assert.ok(el.querySelector("a[href='#/messages/sg-1']"), "phải có link #/messages/{id}");

    const ackBtn = findButton(el, "Đã nhận tín hiệu");
    assert.ok(ackBtn, "phải có nút 'Đã nhận tín hiệu'");
    ackBtn.click();
    await wait(60);
    assert.deepEqual(behavior.signalAckCalls, ["sg-1"], "signalAck phải nhận đúng message_id");
    unmount(host);
  });

  it("caregiver: không có tín hiệu -> empty 'Chưa có tín hiệu nào'", async () => {
    withSession();
    const adapter = fakeWebAdapter({ messages: [] });
    const { ctx } = makeCtx({ demo: false, role: "caregiver", adapter });
    const { host, el } = mount(signal, ctx);
    await wait(80);
    assert.ok(textOf(el).includes("Chưa có tín hiệu nào"), `thấy: ${textOf(el).slice(0, 200)}`);
    unmount(host);
  });
});

/* ============================ M4: COMPOSE RESTYLE ============================ */

const COMPOSE_SOURCE = () => readFileSync(join(ROOT, "src/pages/compose/index.js"), "utf8");

describe("Web M4 — compose restyle (w11/w12): 2 cột, vòng đếm, niêm phong, AI thật", () => {
  it("markup có lớp 2 cột .fb-compose-grid + shell.css có rule desktop >=1024px", () => {
    const css = readFileSync(join(ROOT, "src/styles/shell.css"), "utf8");
    assert.ok(css.includes(".fb-compose-grid"), "shell.css phải định nghĩa .fb-compose-grid");
    const gridRule = css.slice(css.indexOf(".fb-compose-grid"));
    assert.ok(
      /@media \(min-width: 1024px\)[\s\S]*\.fb-compose-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) 340px/.test(css),
      "2 cột chỉ áp dụng @media (min-width: 1024px)",
    );
  });

  it("demo: lưu nháp -> pause -> vòng đếm SVG + textarea niêm phong + preview vẫn chặn", async () => {
    const { ctx } = makeCtx({ demo: true, role: "student" });
    const { host, el } = mount(compose, ctx);
    await wait(1500);

    assert.ok(el.querySelector(".fb-compose-grid"), "markup phải chứa .fb-compose-grid");
    assert.ok(el.querySelector(".fb-compose__ring svg"), "vòng đếm SVG phải có mặt từ đầu (trạng thái chưa pause)");

    const textarea = el.querySelector("#fb-compose-body");
    textarea.value = "Mẹ ơi, hôm nay con có chuyện ở trường hơi căng thẳng.";
    textarea.dispatchEvent(new domWindow.Event("input", { bubbles: true }));

    findButton(el, "Lưu nháp riêng").click();
    await wait(900);
    findButton(el, "Bắt đầu 5 phút nghỉ").click();
    await wait(900);

    const ringProgress = el.querySelector(".fb-compose__ring-progress");
    assert.ok(ringProgress, "khi paused phải có vòng progress");
    const offset = Number(ringProgress.style.strokeDashoffset);
    assert.ok(Number.isFinite(offset) && offset >= 0 && offset < 2 * Math.PI * 28,
      `stroke-dashoffset phải chạy theo remaining máy chủ (nhận: ${ringProgress.style.strokeDashoffset})`);
    assert.ok(ringProgress.style.stroke.includes("--fb-accent"), "stroke phải là --fb-accent khi còn giờ");

    assert.ok(
      el.querySelector("#fb-compose-body").classList.contains("fb-compose__textarea--sealed"),
      "body nháp phải bị niêm phong (làm mờ) khi paused",
    );
    const sealedNote = el.querySelector(".fb-compose__sealed-note");
    assert.ok(sealedNote && sealedNote.hidden === false, "ghi chú niêm phong phải hiện khi paused");
    assert.ok(
      textOf(el).includes("chỉ bạn và người nhận (sau khi gửi) xem được"),
      "copy niêm phong phải trung thực (không 'mã hóa')",
    );

    const previewBtn = el.querySelector(".fb-btn-hero");
    assert.equal(previewBtn.disabled, true, "preview vẫn chặn khi còn khoảng dừng");
    assert.ok(textOf(el).match(/Còn \d{2}:\d{2} theo máy chủ/), "chuỗi pinned thời gian máy chủ");
    unmount(host);
    resetState();
  });

  it("AI thật: aiRefine với key -> thẻ gợi ý; 'Dùng gợi ý' -> aiAccept + chỉ điền textarea", async () => {
    const { ctx, adapter } = makeCtx({ demo: true, role: "student" });
    const aiCalls = [];
    const accepted = [];
    const discarded = [];
    adapter.aiRefine = async ({ text, key }) => {
      aiCalls.push({ text, key });
      return { suggestion_id: "sg-1", refined_text: `Bản êm hơn: ${text}`, status: "pending" };
    };
    adapter.aiAccept = async (id) => { accepted.push(id); return { suggestion_id: id, status: "accepted" }; };
    adapter.aiDiscard = async (id) => { discarded.push(id); return { suggestion_id: id, status: "discarded" }; };
    const { host, el } = mount(compose, ctx);
    await wait(1500);

    const textarea = el.querySelector("#fb-compose-body");
    textarea.value = "Con tức quá hôm nay.";
    textarea.dispatchEvent(new domWindow.Event("input", { bubbles: true }));

    const aiPill = el.querySelector(".fb-compose__ai-btn");
    assert.ok(aiPill, "phải có nút AI");
    assert.equal(aiPill.disabled, false, "mock báo ai_enabled -> nút phải bật");
    aiPill.click();
    await wait(400);

    assert.equal(aiCalls.length, 1, "aiRefine phải được gọi 1 lần");
    assert.ok(aiCalls[0].key, "aiRefine PHẢI có key idempotency (X-Idempotency-Key)");
    assert.equal(aiCalls[0].text, "Con tức quá hôm nay.");

    const suggestionCard = el.querySelector(".fb-compose__ai-suggestion");
    assert.ok(suggestionCard && suggestionCard.hidden === false, "thẻ gợi ý phải hiện");
    assert.ok(textOf(suggestionCard).includes("Bản êm hơn: Con tức quá hôm nay."));

    const useBtn = Array.from(suggestionCard.querySelectorAll("button")).find(
      (btn) => textOf(btn) === "Dùng gợi ý",
    );
    useBtn.click();
    await wait(200);
    assert.deepEqual(accepted, ["sg-1"], "aiAccept phải được gọi");
    assert.equal(textarea.value, "Bản êm hơn: Con tức quá hôm nay.", "gợi ý chỉ được điền vào TEXTAREA");
    assert.ok(
      textOf(el).includes(`${textarea.value.length} ký tự`),
      "counter phải cập nhật theo nội dung mới",
    );
    assert.equal(suggestionCard.hidden, true, "thẻ gợi ý phải ẩn sau khi dùng");
    assert.ok(
      textOf(el).includes("chưa lưu nháp và chưa gửi"),
      "copy phải nói rõ chưa lưu nháp và chưa gửi",
    );
    unmount(host);
    resetState();
  });

  it("AI: 'Bỏ' -> aiDiscard, textarea giữ nguyên; aiStatus tắt -> nút disabled trung thực", async () => {
    const { ctx, adapter } = makeCtx({ demo: true, role: "student" });
    const discarded = [];
    adapter.aiRefine = async ({ text, key }) => ({ suggestion_id: "sg-2", refined_text: `Gợi ý ${text}`, status: "pending" });
    adapter.aiDiscard = async (id) => { discarded.push(id); return { suggestion_id: id, status: "discarded" }; };
    const { host, el } = mount(compose, ctx);
    await wait(1500);

    const textarea = el.querySelector("#fb-compose-body");
    textarea.value = "Bản gốc giữ nguyên.";
    textarea.dispatchEvent(new domWindow.Event("input", { bubbles: true }));
    el.querySelector(".fb-compose__ai-btn").click();
    await wait(400);
    const suggestionCard = el.querySelector(".fb-compose__ai-suggestion");
    const dropBtn = Array.from(suggestionCard.querySelectorAll("button")).find(
      (btn) => textOf(btn) === "Bỏ",
    );
    dropBtn.click();
    await wait(200);
    assert.deepEqual(discarded, ["sg-2"], "aiDiscard phải được gọi");
    assert.equal(textarea.value, "Bản gốc giữ nguyên.", "bỏ gợi ý KHÔNG được đụng textarea");
    assert.equal(suggestionCard.hidden, true);
    unmount(host);

    // aiStatus tắt: nút disabled + giải thích trung thực.
    const behavior = { aiStatusResult: { ai_enabled: false } };
    const adapter2 = fakeWebAdapter({ behavior });
    const ctx2 = makeCtx({ demo: false, role: "student", adapter: adapter2 }).ctx;
    const host2 = document.createElement("div");
    document.body.appendChild(host2);
    const el2 = compose.render(ctx2);
    host2.appendChild(el2);
    await wait(60);
    const aiPill2 = el2.querySelector(".fb-compose__ai-btn");
    assert.ok(aiPill2.disabled, "ai_enabled=false -> nút phải disabled");
    assert.ok(
      textOf(el2).includes("chưa được bật"),
      "phải giải thích trung thực khi AI tắt",
    );
    host2.remove();
    unmount(host);
    resetState();
  });

  it("không thêm setInterval vào compose (DSA-10) — bất biến QA giữ nguyên", () => {
    assert.ok(!COMPOSE_SOURCE().includes("setInterval"), "compose không được dùng setInterval");
    assert.ok(!/autoSend|auto-submit/i.test(COMPOSE_SOURCE()), "không auto-send");
  });
});

/* ======================== M5a: MAILBOX (w14) + MESSAGE (w15) ======================== */

const MAIL_MESSAGES = [
  {
    message_id: "m-1", kind: "text", direction: "received",
    counterparty_id: "u-care-1", title: "Lời nhắn từ bố",
    created_at: "2026-10-24T03:30:00Z", read: false, reply_to: null,
  },
  {
    message_id: "m-2", kind: "emotion_card", direction: "sent",
    counterparty_id: "u-care-1", title: "Thẻ cảm xúc: Khi thấy áp lực điểm số",
    created_at: "2026-10-23T09:00:00Z", read: true, reply_to: null,
  },
  {
    message_id: "m-3", kind: "listening_signal", direction: "received",
    counterparty_id: "u-care-1", title: "Tín hiệu: Cần có người ở bên cạnh",
    created_at: "2026-10-24T02:00:00Z", read: true, reply_to: null,
  },
  {
    message_id: "m-4", kind: "quick_reply", direction: "sent",
    counterparty_id: "u-care-1", title: "Lời hồi âm",
    created_at: "2026-10-24T04:00:00Z", read: true, reply_to: "m-1",
  },
  {
    message_id: "m-5", kind: "text", direction: "received",
    counterparty_id: "u-unknown", title: "Lời nhắn chưa có tên trong kết nối",
    created_at: "2026-10-22T08:00:00Z", read: true, reply_to: null,
  },
];

const MAIL_CONNECTION = {
  connection_id: "c-1",
  status: "active",
  relationship_kind: "primary",
  generation: 1,
  other_party_id: "u-care-1",
  counterpart: { display_name: "Người chăm sóc Minh", identity_basis: "self_declared" },
};

/** Adapter F05 giả cho mailbox/message — ghi lại mọi call để pin hợp đồng. */
function mailAdapter({ rows = MAIL_MESSAGES, connections = [MAIL_CONNECTION], behavior = {} } = {}) {
  return {
    mode: "zalo",
    listMessages: async (args = {}) => {
      behavior.listMessagesCalls = behavior.listMessagesCalls || [];
      behavior.listMessagesCalls.push(args);
      if (behavior.listError) throw behavior.listError;
      if (behavior.listPages && behavior.listPages.length) {
        const pageData = behavior.listPages.shift();
        return { results: pageData.results, nextCursor: pageData.nextCursor };
      }
      return { results: rows, nextCursor: behavior.nextCursor || null };
    },
    listConnections: async () => ({ results: connections, nextCursor: null }),
    getMessage: async (id) => {
      behavior.getMessageCalls = behavior.getMessageCalls || [];
      behavior.getMessageCalls.push(id);
      if (behavior.getMessageError) throw behavior.getMessageError;
      const row = rows.find((r) => r.message_id === id) || MAIL_MESSAGES[0];
      return { ...row, message_id: id, body: "Nội dung thư thật từ máy chủ — chỉ hiện khi mở thư." };
    },
    markMessageRead: async (id) => {
      behavior.markReadCalls = behavior.markReadCalls || [];
      behavior.markReadCalls.push(id);
      if (behavior.markReadError) throw behavior.markReadError;
      return { read: true };
    },
    sendMessage: async (args = {}) => {
      behavior.sendCalls = behavior.sendCalls || [];
      behavior.sendCalls.push(args);
      if (behavior.sendError) throw behavior.sendError;
      return { message_id: "m-reply-1", created_at: "2026-10-24T05:00:00Z", state: "sent" };
    },
    quickReplies: async (args = {}) => {
      behavior.quickRepliesArgs = args;
      if (behavior.quickRepliesError) throw behavior.quickRepliesError;
      return behavior.quickRepliesResult || { results: [], note: "library_not_configured" };
    },
    lookupOperation: async (key) => {
      behavior.lookupCalls = behavior.lookupCalls || [];
      behavior.lookupCalls.push(key);
      return behavior.lookupResult || { status: "sent", key };
    },
    aiStatus: async () => behavior.aiStatusResult || { enabled: false },
    aiRefine: async (args = {}) => {
      behavior.aiRefineCalls = behavior.aiRefineCalls || [];
      behavior.aiRefineCalls.push(args);
      if (behavior.aiRefineError) throw behavior.aiRefineError;
      return behavior.aiRefineResult
        || { suggestion_id: "s-1", refined_text: "Bản diễn đạt êm hơn do máy chủ đề xuất." };
    },
    aiAccept: async (id) => {
      behavior.aiAcceptCalls = behavior.aiAcceptCalls || [];
      behavior.aiAcceptCalls.push(id);
      return { accepted: true };
    },
    aiDiscard: async (id) => {
      behavior.aiDiscardCalls = behavior.aiDiscardCalls || [];
      behavior.aiDiscardCalls.push(id);
      return { discarded: true };
    },
  };
}

const MAIL_BANNED = ["Đã xem", "đã đọc", "Đã gửi", "Người nhận đã mở"];

function assertNoBanned(text, label) {
  for (const phrase of MAIL_BANNED) {
    assert.ok(!text.includes(phrase), `${label} không được chứa "${phrase}"`);
  }
}

function pillByLabel(root, needle) {
  return Array.from(root.querySelectorAll(".fb-cards-pill")).find(
    (pill) => textOf(pill).includes(needle),
  );
}

describe("Web M5a — mailbox (w14): danh sách title-only dữ liệu thật, không bịa", () => {
  it("page contract: chrome 'app' + requiresAuth + requiresRole + bottom-nav", () => {
    assert.equal(mailbox.id, "mailbox");
    assert.equal(mailbox.title, "Hộp thư");
    assert.equal(mailbox.chrome, "app");
    assert.equal(mailbox.requiresAuth, true);
    assert.equal(mailbox.requiresRole, true);
    assert.equal(mailbox.showBottomNav, true);
  });

  it("heading + sub; tên người đối diện từ listConnections; fallback trung thực khi không resolve", async () => {
    withSession();
    const { ctx } = makeCtx({ demo: false, role: "student", adapter: mailAdapter() });
    const { host, el } = mount(mailbox, ctx);
    await wait(60);
    const text = textOf(el);
    assert.ok(text.includes("Hộp thư trao đổi thấu cảm"), `thấy: ${text.slice(0, 200)}`);
    assert.ok(text.includes("Không áp lực trả lời ngay • Chỉ người nhận được cấp quyền mới thấy nội dung"));
    assert.ok(text.includes("Người chăm sóc Minh"), "tên thật từ listConnections phải hiện");
    assert.ok(text.includes("Thành viên Family Bridge"), "fallback tên trung thực cho counterparty lạ");
    assertNoBanned(text, "mailbox");
    unmount(host);
  });

  it("'Mới' chỉ cho received-unread; 'Gửi lúc' cho sent; 'Nhận lúc' cho received đã tải", async () => {
    withSession();
    const { ctx } = makeCtx({ demo: false, role: "student", adapter: mailAdapter() });
    const { host, el } = mount(mailbox, ctx);
    await wait(60);
    const row1 = el.querySelector('[data-message-id="m-1"]');
    assert.ok(row1, "hàng m-1 phải render");
    assert.ok(textOf(row1).includes("Mới"), "received-unread phải có chip Mới");
    const row2 = el.querySelector('[data-message-id="m-2"]');
    assert.ok(/Gửi lúc/.test(textOf(row2)), "thư gửi phải có 'Gửi lúc'");
    const row3 = el.querySelector('[data-message-id="m-3"]');
    assert.ok(/Nhận lúc/.test(textOf(row3)), "received đã đọc phải có 'Nhận lúc'");
    unmount(host);
  });

  it("nhóm lọc map đúng (kind + reply_to) trên cửa sổ đã tải; không gọi lại listMessages", async () => {
    withSession();
    const behavior = {};
    const { ctx } = makeCtx({ demo: false, role: "student", adapter: mailAdapter({ behavior }) });
    const { host, el } = mount(mailbox, ctx);
    await wait(60);
    assert.equal(behavior.listMessagesCalls.length, 1, "chỉ tải 1 lần ban đầu");

    pillByLabel(el, "Tín hiệu kết nối").click();
    assert.ok(el.querySelector('[data-message-id="m-3"]'), "nhóm tín hiệu phải có m-3");
    assert.equal(el.querySelector('[data-message-id="m-1"]'), null, "nhóm tín hiệu không có m-1");

    pillByLabel(el, "Lời hồi âm").click();
    assert.ok(el.querySelector('[data-message-id="m-4"]'), "reply_to != null phải vào nhóm hồi âm");
    assert.equal(el.querySelector('[data-message-id="m-3"]'), null);

    pillByLabel(el, "Lời nhắn & Thẻ cảm xúc").click();
    assert.ok(el.querySelector('[data-message-id="m-1"]'), "nhóm lời nhắn phải có m-1");
    assert.ok(el.querySelector('[data-message-id="m-2"]'), "nhóm lời nhắn phải có m-2 (emotion_card)");
    assert.equal(el.querySelector('[data-message-id="m-4"]'), null);

    pillByLabel(el, "Tất cả").click();
    assert.ok(el.querySelector('[data-message-id="m-5"]'), "'Tất cả' bỏ lọc");
    assert.equal(behavior.listMessagesCalls.length, 1, "bộ lọc chạy client-side, không tải lại");
    unmount(host);
  });

  it("tìm kiếm lọc trong cửa sổ đã tải + caption trung thực", async () => {
    withSession();
    const { ctx } = makeCtx({ demo: false, role: "student", adapter: mailAdapter() });
    const { host, el } = mount(mailbox, ctx);
    await wait(60);
    const input = el.querySelector("input[type='search']");
    assert.ok(input, "phải có ô tìm kiếm");
    assert.ok(textOf(el).includes("trong số thư đã tải"), "caption phải nói rõ phạm vi đã tải");
    input.value = "bố";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    assert.ok(el.querySelector('[data-message-id="m-1"]'), "khớp 'Lời nhắn từ bố'");
    assert.equal(el.querySelector('[data-message-id="m-2"]'), null, "không khớp phải ẩn đi");
    input.value = "zzzz-khong-co";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    assert.ok(
      textOf(el).includes("Không có thư nào khớp bộ lọc trong số thư đã tải"),
      "rỗng do lọc phải trung thực về phạm vi",
    );
    unmount(host);
  });

  it("phân trang: 'Tải thêm' truyền cursor thật; hết cursor -> ẩn nút", async () => {
    withSession();
    const behavior = {
      listPages: [
        { results: MAIL_MESSAGES.slice(0, 2), nextCursor: "c2" },
        { results: [MAIL_MESSAGES[2]], nextCursor: null },
      ],
    };
    const { ctx } = makeCtx({ demo: false, role: "student", adapter: mailAdapter({ behavior }) });
    const { host, el } = mount(mailbox, ctx);
    await wait(60);
    assert.ok(el.querySelector('[data-message-id="m-1"]'));
    assert.equal(el.querySelector('[data-message-id="m-3"]'), null, "chưa tải trang 2");
    const loadMore = findButton(el, "Tải thêm");
    assert.ok(loadMore && !loadMore.hidden, "có cursor -> hiện nút Tải thêm");
    loadMore.click();
    await wait(30);
    assert.ok(el.querySelector('[data-message-id="m-3"]'), "trang 2 phải được nối vào danh sách");
    assert.equal(behavior.listMessagesCalls[1].cursor, "c2", "cursor f05 phải truyền đúng");
    const loadMoreAfter = findButton(el, "Tải thêm");
    assert.ok(!loadMoreAfter || loadMoreAfter.hidden, "hết cursor -> ẩn nút");
    unmount(host);
  });

  it("desktop ≥1024px: click hàng -> #/mailbox?sel=<id>; pane chi tiết meta + liên kết mở thư", async () => {
    withSession();
    const originalMatchMedia = domWindow.matchMedia;
    domWindow.matchMedia = (query) => ({
      matches: query.includes("min-width: 1024"),
      media: query,
    });
    try {
      const { ctx, navigateCalls } = makeCtx({ demo: false, role: "student", adapter: mailAdapter() });
      const { host, el } = mount(mailbox, ctx);
      await wait(60);
      el.querySelector('[data-message-id="m-1"]').click();
      assert.ok(
        navigateCalls.includes("/mailbox?sel=m-1"),
        `desktop phải chọn qua sel param; calls: ${navigateCalls.join(", ")}`,
      );

      // Re-render với sel=m-1 (như router sau hashchange)
      const ctx2 = makeCtx({
        demo: false, role: "student", adapter: mailAdapter(), params: "sel=m-1",
      }).ctx;
      const host2 = document.createElement("div");
      document.body.appendChild(host2);
      const el2 = mailbox.render(ctx2);
      host2.appendChild(el2);
      await wait(60);
      const detail = el2.querySelector(".fb-mx-detail");
      assert.ok(detail, "desktop phải có pane chi tiết");
      assert.ok(textOf(detail).includes("Lời nhắn từ bố"), "pane hiện tiêu đề thư đã chọn");
      const openLink = detail.querySelector("a[href='#/messages/m-1']");
      assert.ok(openLink, "pane phải có liên kết mở thư thật");
      assert.ok(textOf(openLink).includes("Mở thư để đọc nội dung"));
      assert.ok(
        textOf(el2).includes("Danh sách chỉ chứa tiêu đề"),
        "ghi rõ danh sách không chứa nội dung thư",
      );
      assert.ok(el2.querySelector('[data-message-id="m-1"].fb-mx-row--active'), "hàng đang chọn highlight");
      host2.remove();
      unmount(host);
    } finally {
      domWindow.matchMedia = originalMatchMedia;
    }
  });

  it("mobile: hàng là liên kết sang #/messages/{id} (không pane chi tiết)", async () => {
    withSession();
    const { ctx } = makeCtx({ demo: false, role: "student", adapter: mailAdapter() });
    const { host, el } = mount(mailbox, ctx);
    await wait(60);
    const row = el.querySelector('a[data-message-id="m-1"]');
    assert.ok(row, "hàng phải là <a>");
    assert.equal(row.getAttribute("href"), "#/messages/m-1", "mobile: điều hướng sang trang chi tiết");
    unmount(host);
  });

  it("rỗng thật từ máy chủ: giữ pin copy cũ + nút kiểm tra kết nối", async () => {
    withSession();
    const { ctx } = makeCtx({ demo: false, role: "student", adapter: mailAdapter({ rows: [] }) });
    const { host, el } = mount(mailbox, ctx);
    await wait(60);
    const text = textOf(el);
    assert.ok(text.includes("Chưa có tin nhắn nào"), "pin copy cũ phải giữ nguyên");
    assert.ok(text.includes("Khi hai bên đã kết nối, lời nhắn và phản hồi nhanh sẽ xuất hiện ở đây."));
    assert.ok(findButton(el, "Kiểm tra kết nối máy chủ"));
    unmount(host);
  });

  it("lỗi tải: trung thực cold-start + Thử lại; không hiện số bịa", async () => {
    withSession();
    const behavior = { listError: new ApiError("Máy chủ chưa phản hồi.", 0, "timeout") };
    const { ctx } = makeCtx({ demo: false, role: "student", adapter: mailAdapter({ behavior }) });
    const { host, el } = mount(mailbox, ctx);
    await wait(60);
    const text = textOf(el);
    assert.ok(text.includes("Không tải được hộp thư"), `thấy: ${text.slice(0, 200)}`);
    assert.ok(text.includes("lần khởi động đầu có thể mất tới một phút"), "cold-start phải được nói thật");
    assert.ok(findButton(el, "Thử lại"));
    assert.equal(el.querySelector('[data-message-id]'), null, "không render hàng khi lỗi");
    unmount(host);
  });
});

describe("Web M5a — message (w15): chi tiết + phản hồi qua API thật", () => {
  it("thread render body thật; bong bóng theo direction; markRead CHỈ received-unread", async () => {
    withSession();
    const behavior = {};
    const { ctx } = makeCtx({
      demo: false, role: "student", adapter: mailAdapter({ behavior }), params: "id=m-1",
    });
    const { host, el } = mount(messagePage, ctx);
    await wait(60);
    const text = textOf(el);
    assert.ok(text.includes("Lời nhắn từ bố"), "tiêu đề từ getMessage phải hiện");
    assert.ok(text.includes("Nội dung thư thật từ máy chủ — chỉ hiện khi mở thư."), "body thật phải hiện");
    assert.ok(el.querySelector(".fb-msg-bubble--received"), "thư nhận -> bong bóng received");
    assert.ok(text.includes("← Quay lại Hộp thư"), "phải có lối về hộp thư");
    assertNoBanned(text, "message received");
    await wait(30);
    assert.deepEqual(behavior.markReadCalls, ["m-1"], "markRead đúng 1 lần cho received-unread");
    unmount(host);
  });

  it("thư gửi đi (sent + đã đọc): KHÔNG gọi markMessageRead; bong bóng --sent", async () => {
    withSession();
    const behavior = {};
    const { ctx } = makeCtx({
      demo: false, role: "student", adapter: mailAdapter({ behavior }), params: "id=m-2",
    });
    const { host, el } = mount(messagePage, ctx);
    await wait(90);
    assert.ok(el.querySelector(".fb-msg-bubble--sent"), "thư gửi -> bong bóng sent");
    assert.deepEqual(behavior.markReadCalls || [], [], "sent: tuyệt đối không markRead");
    unmount(host);
  });

  it("quickReplies library_not_configured -> ẩn chip trung thực; audience theo vai trò", async () => {
    withSession();
    const behavior = {};
    const { ctx } = makeCtx({
      demo: false, role: "caregiver", adapter: mailAdapter({ behavior }), params: "id=m-1",
    });
    const { host, el } = mount(messagePage, ctx);
    await wait(60);
    const chips = el.querySelector(".fb-msg-chips");
    assert.ok(chips, "khung chip phải tồn tại (để ẩn đúng cách)");
    assert.equal(chips.children.length, 0, "library_not_configured -> KHÔNG chip");
    assert.ok(
      textOf(el).includes("chưa được cấu hình"),
      "ghi chú trung thực khi thư viện chưa cấu hình",
    );
    assert.equal(behavior.quickRepliesArgs.audience, "caregiver", "audience truyền theo vai trò");
    unmount(host);
  });

  it("quickReplies có kết quả -> chip điền VÀO TEXTAREA (người dùng vẫn tự bấm gửi)", async () => {
    withSession();
    const behavior = {
      quickRepliesResult: { results: [{ text: "Cảm ơn anh/chị đã nhắn cho con." }], note: null },
    };
    const { ctx } = makeCtx({
      demo: false, role: "student", adapter: mailAdapter({ behavior }), params: "id=m-1",
    });
    const { host, el } = mount(messagePage, ctx);
    await wait(60);
    const chip = el.querySelector(".fb-msg-chips .fb-cards-pill");
    assert.ok(chip, "chip gợi ý phải hiện khi máy chủ trả kết quả");
    chip.click();
    const textarea = el.querySelector("textarea");
    assert.equal(
      textarea.value,
      "Cảm ơn anh/chị đã nhắn cho con.",
      "chip chỉ điền textarea",
    );
    unmount(host);
  });

  it("gửi phản hồi: body có kind text + recipientId + reply_to + key; xong -> về #/mailbox", async () => {
    withSession();
    const behavior = {};
    const { ctx, navigateCalls } = makeCtx({
      demo: false, role: "student", adapter: mailAdapter({ behavior }), params: "id=m-1",
    });
    const { host, el } = mount(messagePage, ctx);
    await wait(60);
    const textarea = el.querySelector("textarea");
    textarea.value = "Con cảm ơn bố, tối nay con sẽ gọi cho bố.";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    const sendBtn = findButton(el, "Gửi phản hồi");
    assert.ok(sendBtn && !sendBtn.disabled, "có nội dung -> nút gửi bật");
    sendBtn.click();
    await wait(30);
    assert.equal(behavior.sendCalls.length, 1, "đúng 1 lượt gửi");
    const call = behavior.sendCalls[0];
    assert.equal(call.kind, "text", "f05 không có kind 'reply' -> gửi bằng text");
    assert.equal(call.recipientId, "u-care-1", "recipient là counterparty của thư");
    assert.equal(call.replyTo, "m-1", "reply_to trỏ về thư đang mở");
    assert.ok(call.key, "phải có idempotency key tạo tại nút bấm");
    assert.equal(call.body, "Con cảm ơn bố, tối nay con sẽ gọi cho bố.");
    assert.ok(navigateCalls.includes("/mailbox"), "201 -> về #/mailbox");
    unmount(host);
  });

  it("gửi lỗi -> KẾT QUẢ CHƯA XÁC ĐỊNH + 'Kiểm tra trạng thái gửi' -> lookupOperation(key)", async () => {
    withSession();
    const behavior = { sendError: new ApiError("Mạng không ổn định.", 0, "timeout") };
    const { ctx } = makeCtx({
      demo: false, role: "student", adapter: mailAdapter({ behavior }), params: "id=m-1",
    });
    const { host, el } = mount(messagePage, ctx);
    await wait(60);
    const textarea = el.querySelector("textarea");
    textarea.value = "Con đã nhận được lời nhắn của bố.";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    findButton(el, "Gửi phản hồi").click();
    await wait(30);
    const text = textOf(el);
    assert.ok(text.includes("KẾT QUẢ CHƯA XÁC ĐỊNH"), "báo trung thực khi không rõ kết quả");
    assert.ok(!text.includes("Đã gửi"), "không được tuyên bố thành công");
    const lookupBtn = findButton(el, "Kiểm tra trạng thái gửi");
    assert.ok(lookupBtn, "phải có lối tra cứu");
    lookupBtn.click();
    await wait(30);
    assert.equal(behavior.lookupCalls.length, 1, "lookup đúng 1 lần");
    assert.equal(behavior.lookupCalls[0], behavior.sendCalls[0].key, "lookup đúng key lượt gửi");
    unmount(host);
  });

  it("AI chỉ khi aiStatus bật; 'Dùng gợi ý' -> aiAccept + chỉ điền textarea; 'Bỏ' giữ nguyên", async () => {
    withSession();
    const behavior = {
      aiStatusResult: { enabled: true },
      quickRepliesResult: { results: [], note: "library_not_configured" },
    };
    const { ctx } = makeCtx({
      demo: false, role: "student", adapter: mailAdapter({ behavior }), params: "id=m-1",
    });
    const { host, el } = mount(messagePage, ctx);
    await wait(60);
    const aiPill = findButton(el, "AI gợi ý cách diễn đạt êm ái hơn");
    assert.ok(aiPill, "aiStatus bật -> nút AI phải có");
    const textarea = el.querySelector("textarea");
    textarea.value = "Lời chưa êm của con.";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    aiPill.click();
    await wait(30);
    const suggestionCard = el.querySelector(".fb-compose__ai-suggestion");
    assert.ok(suggestionCard && !suggestionCard.hidden, "gợi ý phải hiện trong thẻ");
    assert.ok(
      textOf(suggestionCard).includes("Bản diễn đạt êm hơn do máy chủ đề xuất."),
      "nội dung gợi ý từ máy chủ",
    );
    const before = textarea.value;
    findButton(suggestionCard, "Dùng gợi ý").click();
    await wait(30);
    assert.deepEqual(behavior.aiAcceptCalls, ["s-1"], "aiAccept được gọi với suggestion_id");
    assert.equal(textarea.value, "Bản diễn đạt êm hơn do máy chủ đề xuất.", "chỉ điền textarea");
    assert.ok(behavior.sendCalls === undefined, "AI không tự gửi");
    findButton(el, "AI gợi ý cách diễn đạt êm ái hơn").click();
    await wait(30);
    findButton(el.querySelector(".fb-compose__ai-suggestion"), "Bỏ").click();
    await wait(30);
    assert.deepEqual(behavior.aiDiscardCalls, ["s-1"]);
    assert.equal(textarea.value, "Bản diễn đạt êm hơn do máy chủ đề xuất.", "Bỏ -> textarea giữ nguyên");
    assert.ok(before !== "", "sanity");
    unmount(host);
  });

  it("AI tắt (mặc định) -> KHÔNG nút AI trung thực", async () => {
    withSession();
    const { ctx } = makeCtx({
      demo: false, role: "student", adapter: mailAdapter(), params: "id=m-1",
    });
    const { host, el } = mount(messagePage, ctx);
    await wait(60);
    assert.ok(!findButton(el, "AI gợi ý cách diễn đạt êm ái hơn"), "không cổng -> không nút");
    unmount(host);
  });

  it("getMessage lỗi -> trạng thái lỗi + Thử lại, không bịa nội dung", async () => {
    withSession();
    const behavior = { getMessageError: new ApiError("Máy chủ chưa phản hồi.", 0, "timeout") };
    const { ctx } = makeCtx({
      demo: false, role: "student", adapter: mailAdapter({ behavior }), params: "id=m-1",
    });
    const { host, el } = mount(messagePage, ctx);
    await wait(60);
    const text = textOf(el);
    assert.ok(text.includes("Không tải được thư"), `thấy: ${text.slice(0, 200)}`);
    assert.ok(findButton(el, "Thử lại"));
    assert.equal(el.querySelector(".fb-msg-bubble"), null, "không render bong bóng khi lỗi");
    unmount(host);
  });
});

/* ============================ M5b: SETTINGS (w-settings) ============================ */

function settingsAdapter({ behavior = {}, profile = null, capabilities = {} } = {}) {
  return {
    mode: "zalo",
    getMyProfile: async () => {
      if (behavior.profileError) throw behavior.profileError;
      return profile || { user_id: "u-1", display_name: "Lan (HS)", identity_basis: "self_declared" };
    },
    getCapabilities: async () => capabilities,
    updateMyProfile: async (args) => {
      behavior.updateCalls = behavior.updateCalls || [];
      behavior.updateCalls.push(args);
      if (behavior.updateError) throw behavior.updateError;
      return { user_id: "u-1", display_name: args.displayName, identity_basis: "self_declared" };
    },
    changeClassPassword: async (args) => {
      behavior.pwCalls = behavior.pwCalls || [];
      behavior.pwCalls.push(args);
      if (behavior.pwError) throw behavior.pwError;
      return behavior.pwResult || { changed: true, sessions_revoked_other: 0 };
    },
    changeClassCode: async (args) => {
      behavior.codeCalls = behavior.codeCalls || [];
      behavior.codeCalls.push(args);
      if (behavior.codeError) throw behavior.codeError;
      return behavior.codeResult || { login_code: args.newCode, changed: true };
    },
    logout: async () => {
      behavior.logoutCalls = behavior.logoutCalls || [];
      behavior.logoutCalls.push(true);
      return true;
    },
  };
}

function clickDialogAction(label) {
  const dialogRoot = document.body.querySelector(".fb-dialog-root");
  assert.ok(dialogRoot, "confirm dialog phải mở");
  const action = Array.from(dialogRoot.querySelectorAll("button"))
    .find((btn) => textOf(btn) === label);
  assert.ok(action, `dialog phải có nút ${label}`);
  action.click();
  return dialogRoot;
}

describe("Web M5b — settings: đổi mật khẩu / mã đăng nhập / tên hiển thị (trung thực)", () => {
  it("page contract: chrome 'app' + requiresAuth", () => {
    assert.equal(settings.id, "settings");
    assert.equal(settings.chrome, "app");
    assert.equal(settings.requiresAuth, true);
    assert.equal(settings.requiresRole, true);
  });

  it("đổi mật khẩu gửi đúng {currentPassword,newPassword} + success đếm phiên từ máy chủ", async () => {
    withSession();
    const behavior = {};
    const { ctx } = makeCtx({
      demo: false, role: "student",
      adapter: settingsAdapter({ behavior, capabilities: { settings: { change_password: true } } }),
    });
    const { host, el } = mount(settings, ctx);
    await wait(40);
    const pwCard = Array.from(el.querySelectorAll(".fb-card"))
      .find((card) => textOf(card).includes("Đổi mật khẩu"));
    assert.ok(pwCard, "thẻ Đổi mật khẩu phải có");
    const inputs = pwCard.querySelectorAll("input[type='password']");
    assert.equal(inputs.length, 3, "3 ô: hiện tại / mới / nhập lại");
    inputs[0].value = "mk-cu-123";
    inputs[1].value = "mk-moi-456";
    inputs[2].value = "mk-moi-456";
    // Thẻ tên hiển thị cũng có 1 input text — password inputs ở trên đã tách riêng.
    findButton(pwCard, "Đổi mật khẩu").click();
    await wait(40);
    assert.deepEqual(behavior.pwCalls, [{ currentPassword: "mk-cu-123", newPassword: "mk-moi-456" }],
      "trang phải truyền đúng tham số adapter (adapter map sang snake_case)");
    assert.ok(textOf(pwCard).includes("Đã đổi mật khẩu."),
      `copy success: ${textOf(pwCard)}`);
    unmount(host);
  });

  it("success hiển thị SỐ PHIÊN MÁY CHỦ báo (sessions_revoked_other=2)", async () => {
    withSession();
    const behavior = { pwResult: { changed: true, sessions_revoked_other: 2 } };
    const { ctx } = makeCtx({
      demo: false, role: "student", adapter: settingsAdapter({ behavior }),
    });
    const { host, el } = mount(settings, ctx);
    await wait(40);
    const pwCard = Array.from(el.querySelectorAll(".fb-card"))
      .find((card) => textOf(card).includes("Đổi mật khẩu"));
    const inputs = pwCard.querySelectorAll("input[type='password']");
    inputs[0].value = "mk-cu"; inputs[1].value = "mk-moi-dai"; inputs[2].value = "mk-moi-dai";
    findButton(pwCard, "Đổi mật khẩu").click();
    await wait(40);
    assert.ok(textOf(pwCard).includes("2 phiên khác đã được đăng xuất"),
      `phải dùng số máy chủ trả: ${textOf(pwCard)}`);
    unmount(host);
  });

  it("403 reauth_failed → 'Mật khẩu hiện tại chưa đúng.' (không fake success)", async () => {
    withSession();
    const behavior = {
      pwError: new ApiError("nope", 403, "http",
        { code: "not_authorized", details: { reason: "reauth_failed" } }),
    };
    const { ctx } = makeCtx({
      demo: false, role: "student", adapter: settingsAdapter({ behavior }),
    });
    const { host, el } = mount(settings, ctx);
    await wait(40);
    const pwCard = Array.from(el.querySelectorAll(".fb-card"))
      .find((card) => textOf(card).includes("Đổi mật khẩu"));
    const inputs = pwCard.querySelectorAll("input[type='password']");
    inputs[0].value = "sai"; inputs[1].value = "mk-moi-dai-9"; inputs[2].value = "mk-moi-dai-9";
    findButton(pwCard, "Đổi mật khẩu").click();
    await wait(40);
    assert.ok(textOf(pwCard).includes("Mật khẩu hiện tại chưa đúng."));
    assert.ok(!textOf(pwCard).includes("Đã đổi mật khẩu."), "không được báo thành công");
    unmount(host);
  });

  it("weak_password → render danh sách details.messages của máy chủ", async () => {
    withSession();
    const behavior = {
      pwError: new ApiError("weak", 400, "http", {
        code: "input_invalid",
        details: { reason: "weak_password", messages: ["Mật khẩu cần ít nhất 8 ký tự.", "Cần ít nhất một chữ số."] },
      }),
    };
    const { ctx } = makeCtx({
      demo: false, role: "student", adapter: settingsAdapter({ behavior }),
    });
    const { host, el } = mount(settings, ctx);
    await wait(40);
    const pwCard = Array.from(el.querySelectorAll(".fb-card"))
      .find((card) => textOf(card).includes("Đổi mật khẩu"));
    const inputs = pwCard.querySelectorAll("input[type='password']");
    inputs[0].value = "mk-cu"; inputs[1].value = "ngan"; inputs[2].value = "ngan";
    findButton(pwCard, "Đổi mật khẩu").click();
    await wait(40);
    const list = pwCard.querySelector("ul");
    assert.ok(list, "danh sách messages phải render");
    assert.ok(textOf(list).includes("Mật khẩu cần ít nhất 8 ký tự."));
    assert.ok(textOf(list).includes("Cần ít nhất một chữ số."));
    unmount(host);
  });

  it("new != confirm → lỗi client-side, KHÔNG gọi máy chủ", async () => {
    withSession();
    const behavior = {};
    const { ctx } = makeCtx({
      demo: false, role: "student", adapter: settingsAdapter({ behavior }),
    });
    const { host, el } = mount(settings, ctx);
    await wait(40);
    const pwCard = Array.from(el.querySelectorAll(".fb-card"))
      .find((card) => textOf(card).includes("Đổi mật khẩu"));
    const inputs = pwCard.querySelectorAll("input[type='password']");
    inputs[0].value = "mk-cu"; inputs[1].value = "mk-moi-dai-9"; inputs[2].value = "khac-lam";
    findButton(pwCard, "Đổi mật khẩu").click();
    await wait(20);
    assert.ok(textOf(pwCard).includes("Mật khẩu nhập lại chưa khớp."));
    assert.ok(behavior.pwCalls === undefined, "không được gọi adapter khi validate fail");
    unmount(host);
  });

  it("backend 404 → thẻ DISABLED 'chưa được bật trên máy chủ', KHÔNG fake success", async () => {
    withSession();
    const behavior = { pwError: new ApiError("nf", 404, "http", { code: "not_found" }) };
    const { ctx } = makeCtx({
      demo: false, role: "student", adapter: settingsAdapter({ behavior }),
    });
    const { host, el } = mount(settings, ctx);
    await wait(40);
    const pwCard = Array.from(el.querySelectorAll(".fb-card"))
      .find((card) => textOf(card).includes("Đổi mật khẩu"));
    const inputs = pwCard.querySelectorAll("input[type='password']");
    inputs[0].value = "mk-cu"; inputs[1].value = "mk-moi-dai-9"; inputs[2].value = "mk-moi-dai-9";
    findButton(pwCard, "Đổi mật khẩu").click();
    await wait(40);
    assert.ok(textOf(pwCard).includes("Đổi mật khẩu chưa được bật trên máy chủ."));
    assert.ok(!textOf(pwCard).includes("Đã đổi mật khẩu."), "không fake success");
    const formInputs = pwCard.querySelectorAll("input[type='password']");
    assert.equal(formInputs.length, 0, "form phải biến mất khỏi thẻ disabled");
    unmount(host);
  });

  it("capabilities.settings.change_password=false → thẻ disabled từ đầu", async () => {
    withSession();
    const { ctx } = makeCtx({
      demo: false, role: "student",
      adapter: settingsAdapter({ capabilities: { settings: { change_password: false } } }),
    });
    const { host, el } = mount(settings, ctx);
    await wait(40);
    const pwCard = Array.from(el.querySelectorAll(".fb-card"))
      .find((card) => textOf(card).includes("Đổi mật khẩu"));
    assert.ok(textOf(pwCard).includes("Đổi mật khẩu chưa được bật trên máy chủ."));
    assert.equal(pwCard.querySelectorAll("input[type='password']").length, 0);
    unmount(host);
  });

  it("đổi mã đăng nhập thành công → 'Đã đổi mã đăng nhập thành {code}.' từ login_code máy chủ", async () => {
    withSession();
    const behavior = { codeResult: { login_code: "HS2026", changed: true } };
    const { ctx } = makeCtx({
      demo: false, role: "student", adapter: settingsAdapter({ behavior }),
    });
    const { host, el } = mount(settings, ctx);
    await wait(40);
    const codeCard = Array.from(el.querySelectorAll(".fb-card"))
      .find((card) => textOf(card).includes("Mã đăng nhập"));
    assert.ok(codeCard, "thẻ Mã đăng nhập phải có");
    // Session KHÔNG chứa mã → phải hiện đã che + ghi chú trung thực.
    assert.ok(textOf(codeCard).includes("••••••"));
    assert.ok(textOf(codeCard).includes("liên hệ giáo viên nếu mất mã"));
    const textInput = codeCard.querySelector("input[type='text']");
    const pwInput = codeCard.querySelector("input[type='password']");
    textInput.value = "HS2026";
    pwInput.value = "mk-cu";
    findButton(codeCard, "Đổi mã đăng nhập").click();
    await wait(40);
    assert.deepEqual(behavior.codeCalls, [{ currentPassword: "mk-cu", newCode: "HS2026" }]);
    assert.ok(textOf(codeCard).includes("Đã đổi mã đăng nhập thành HS2026."),
      `copy: ${textOf(codeCard)}`);
    unmount(host);
  });

  it("mã sai định dạng → lỗi client-side không gọi máy chủ; duplicate_code → copy máy chủ", async () => {
    withSession();
    const behavior = {};
    const { ctx } = makeCtx({
      demo: false, role: "student", adapter: settingsAdapter({ behavior }),
    });
    const { host, el } = mount(settings, ctx);
    await wait(40);
    let codeCard = Array.from(el.querySelectorAll(".fb-card"))
      .find((card) => textOf(card).includes("Mã đăng nhập"));
    const textInput = codeCard.querySelector("input[type='text']");
    const pwInput = codeCard.querySelector("input[type='password']");
    textInput.value = "co dau !";
    pwInput.value = "mk-cu";
    findButton(codeCard, "Đổi mã đăng nhập").click();
    await wait(20);
    assert.ok(textOf(codeCard).includes("chưa đúng định dạng"));
    assert.ok(behavior.codeCalls === undefined, "validate client chặn trước khi gọi");

    behavior.codeError = new ApiError("dup", 400, "http",
      { code: "input_invalid", details: { reason: "duplicate_code" } });
    textInput.value = "HS2026";
    findButton(codeCard, "Đổi mã đăng nhập").click();
    await wait(30);
    codeCard = Array.from(el.querySelectorAll(".fb-card"))
      .find((card) => textOf(card).includes("Mã đăng nhập"));
    assert.ok(textOf(codeCard).includes("đã được tài khoản lớp khác dùng"),
      `copy duplicate_code: ${textOf(codeCard)}`);
    unmount(host);
  });

  it("đổi tên hiển thị KHÔNG cần mật khẩu → updateMyProfile + copy thành công", async () => {
    withSession();
    const behavior = {};
    const { ctx } = makeCtx({
      demo: false, role: "student", adapter: settingsAdapter({ behavior }),
    });
    const { host, el } = mount(settings, ctx);
    await wait(40);
    const nameCard = Array.from(el.querySelectorAll(".fb-card"))
      .find((card) => textOf(card).includes("Tên hiển thị"));
    assert.ok(nameCard, "thẻ Tên hiển thị phải có");
    const nameInput = nameCard.querySelector("input[type='text']");
    assert.equal(nameInput.value, "Lan (HS)", "tên hiện tại từ /auth/me");
    nameInput.value = "Lan (HS) đã đổi";
    findButton(nameCard, "Lưu tên hiển thị").click();
    await wait(40);
    assert.deepEqual(behavior.updateCalls, [{ displayName: "Lan (HS) đã đổi" }]);
    assert.ok(textOf(nameCard).includes("Đã cập nhật tên hiển thị."));
    assert.ok(!textOf(nameCard).includes("Mật khẩu"), "không yêu cầu mật khẩu cho PUT /auth/me");
    unmount(host);
  });

  it("đổi tên lỗi 401 → redirect login?reason=expired (không có thông báo giả)", async () => {
    withSession();
    const behavior = { updateError: new ApiError("expired", 401, "http") };
    const { ctx, navigateCalls } = makeCtx({
      demo: false, role: "student", adapter: settingsAdapter({ behavior }),
    });
    const { host, el } = mount(settings, ctx);
    await wait(40);
    const nameCard = Array.from(el.querySelectorAll(".fb-card"))
      .find((card) => textOf(card).includes("Tên hiển thị"));
    nameCard.querySelector("input[type='text']").value = "Ten moi";
    findButton(nameCard, "Lưu tên hiển thị").click();
    await wait(30);
    assert.ok(navigateCalls.includes("/login?reason=expired"));
    unmount(host);
  });

  it("riêng tư + đăng xuất: hàng dẫn #/privacy; logout qua dialog xóa phiên", async () => {
    withSession();
    const behavior = {};
    const { ctx, navigateCalls } = makeCtx({
      demo: false, role: "student", adapter: settingsAdapter({ behavior }),
    });
    const { host, el } = mount(settings, ctx);
    await wait(40);
    const privacyLink = Array.from(el.querySelectorAll("a"))
      .find((a) => (a.getAttribute("href") || "").includes("/privacy"));
    assert.ok(privacyLink, "phải có hàng dẫn tới #/privacy");
    findButton(el, "Đăng xuất").click();
    clickDialogAction("Đăng xuất");
    await wait(30);
    assert.deepEqual(behavior.logoutCalls, [true]);
    assert.ok(navigateCalls.includes("/login?reason=logged-out"));
    unmount(host);
  });
});

/* ============================= M5b: PRIVACY (F15) ============================= */

function privacyAdapter({ behavior = {}, overview = null, consents = null } = {}) {
  let overviewState = overview === null
    ? { shared_by_me: [], connections: [] }
    : JSON.parse(JSON.stringify(overview));
  let consentsState = consents === null
    ? [
      { purpose: "service", decision: "accepted", policy_version: "service-v1", withdrawn: false, current: true },
      { purpose: "ai_processing", decision: "none", policy_version: null, withdrawn: false, current: true },
      { purpose: "research", decision: "declined", policy_version: "research-v1", withdrawn: false, current: true },
    ]
    : JSON.parse(JSON.stringify(consents));
  let deletion = null;

  return {
    mode: "zalo",
    privacyOverview: async () => {
      behavior.overviewCalls = behavior.overviewCalls || [];
      behavior.overviewCalls.push(true);
      if (behavior.overviewError) throw behavior.overviewError;
      return JSON.parse(JSON.stringify(overviewState));
    },
    revokeGrant: async (args) => {
      behavior.revokeCalls = behavior.revokeCalls || [];
      behavior.revokeCalls.push(args);
      if (behavior.revokeError) throw behavior.revokeError;
      const row = overviewState.shared_by_me.find(
        (g) => g.item_type === args.itemType && g.item_id === args.itemId);
      if (row) row.revoked = true;
      return { item_type: args.itemType, item_id: args.itemId, revoked: true };
    },
    requestDeletion: async (args) => {
      behavior.requestCalls = behavior.requestCalls || [];
      behavior.requestCalls.push(args);
      if (behavior.requestError) throw behavior.requestError;
      deletion = { request_id: "dr-1", status: "requested", scope_categories: args.categories.slice(), requested_at: "2026-10-25T00:00:00Z" };
      return { request_id: "dr-1", status: "requested", receipt: "ONE-TIME-RECEIPT-9", duplicate: false };
    },
    getDeletionRequest: async (id) => {
      behavior.detailCalls = behavior.detailCalls || [];
      behavior.detailCalls.push(id);
      if (!deletion || deletion.request_id !== id) throw new ApiError("nf", 404, "http", { code: "not_found" });
      return { ...deletion };
    },
    cancelDeletionRequest: async (id, { expectedRevision = null } = {}) => {
      behavior.cancelCalls = behavior.cancelCalls || [];
      behavior.cancelCalls.push({ id, expectedRevision });
      if (behavior.cancelError) throw behavior.cancelError;
      if (deletion) deletion.status = "cancelled";
      return { request_id: id, status: "cancelled" };
    },
    withdrawConsent: async (args) => {
      behavior.withdrawCalls = behavior.withdrawCalls || [];
      behavior.withdrawCalls.push(args);
      if (behavior.withdrawError) throw behavior.withdrawError;
      const record = consentsState.find((c) => c.purpose === args.purpose);
      if (record) record.withdrawn = true;
      return { purpose: args.purpose, withdrawn: true };
    },
    listConsents: async () => {
      behavior.consentsCalls = behavior.consentsCalls || [];
      behavior.consentsCalls.push(true);
      return JSON.parse(JSON.stringify(consentsState));
    },
  };
}

const OVERVIEW_ONE_GRANT = {
  shared_by_me: [
    { item_type: "mood_entry", item_id: "mood-9", recipient_id: "peer-1", approved_revision: 1, revoked: false },
  ],
  connections: [],
};

describe("Web M5b — privacy (F15): thu hồi / yêu cầu xóa / rút đồng ý — không over-claim", () => {
  it("page contract: chrome 'app' + requiresAuth", () => {
    assert.equal(privacyPage.id, "privacy");
    assert.equal(privacyPage.chrome, "app");
    assert.equal(privacyPage.requiresAuth, true);
    assert.equal(privacyPage.requiresRole, true);
  });

  it("grants: 'Thu hồi' qua dialog confirm → revokeGrant đúng tham số → refetch overview", async () => {
    withSession();
    const behavior = {};
    const { ctx } = makeCtx({
      demo: false, role: "student",
      adapter: privacyAdapter({ behavior, overview: OVERVIEW_ONE_GRANT }),
    });
    const { host, el } = mount(privacyPage, ctx);
    await wait(50);
    const sharedCard = Array.from(el.querySelectorAll(".fb-card"))
      .find((card) => textOf(card).includes("Đang chia sẻ"));
    assert.ok(textOf(sharedCard).includes("Ghi nhận tâm trạng"));
    assert.ok(textOf(sharedCard).includes("đang chia sẻ"));
    findButton(sharedCard, "Thu hồi").click();
    clickDialogAction("Thu hồi");
    await wait(60);
    assert.deepEqual(behavior.revokeCalls,
      [{ itemType: "mood_entry", itemId: "mood-9", recipientId: "peer-1" }]);
    assert.ok(behavior.overviewCalls.length >= 2, "phải refetch sau thu hồi");
    const cardAfter = Array.from(el.querySelectorAll(".fb-card"))
      .find((card) => textOf(card).includes("Đang chia sẻ"));
    assert.ok(textOf(cardAfter).includes("đã thu hồi"), "trạng thái mới sau refetch");
    assert.ok(textOf(cardAfter).includes("bản sao đã lưu ngoài ứng dụng"),
      "copy trung thực về giới hạn thu hồi");
    unmount(host);
  });

  it("grants rỗng → empty state trung thực, không bịa mục", async () => {
    withSession();
    const { ctx } = makeCtx({
      demo: false, role: "student", adapter: privacyAdapter({}),
    });
    const { host, el } = mount(privacyPage, ctx);
    await wait(50);
    const sharedCard = Array.from(el.querySelectorAll(".fb-card"))
      .find((card) => textOf(card).includes("Đang chia sẻ"));
    assert.ok(textOf(sharedCard).includes("Bạn chưa chia sẻ mục nào"));
    assert.equal(sharedCard.querySelectorAll("button").length, 0);
    unmount(host);
  });

  it("yêu cầu xóa: cần ≥1 phạm vi; tạo qua confirm → requestDeletion(categories) + biên nhận một lần", async () => {
    withSession();
    const behavior = {};
    const { ctx } = makeCtx({
      demo: false, role: "student", adapter: privacyAdapter({ behavior }),
    });
    const { host, el } = mount(privacyPage, ctx);
    await wait(50);
    const delCard = Array.from(el.querySelectorAll(".fb-card"))
      .find((card) => textOf(card).includes("Yêu cầu xóa dữ liệu"));
    findButton(delCard, "Gửi yêu cầu xóa dữ liệu").click();
    await wait(20);
    assert.ok(textOf(delCard).includes("Chọn ít nhất một phạm vi."), "bắt buộc ≥1 phạm vi");
    assert.ok(behavior.requestCalls === undefined);

    const moodBox = delCard.querySelector("input[value='mood']");
    const journalBox = delCard.querySelector("input[value='journal']");
    assert.ok(moodBox && journalBox, "checkbox theo allowlist backend");
    moodBox.checked = true;
    journalBox.checked = true;
    findButton(delCard, "Gửi yêu cầu xóa dữ liệu").click();
    clickDialogAction("Gửi yêu cầu");
    await wait(60);
    assert.deepEqual(behavior.requestCalls, [{ categories: ["mood", "journal"] }]);
    assert.ok(textOf(delCard).includes("Mã biên nhận (lưu lại — chỉ hiện một lần)"));
    assert.ok(textOf(delCard).includes("ONE-TIME-RECEIPT-9"));
    assert.ok(textOf(delCard).includes("Đã tiếp nhận — chờ xác minh"),
      "trạng thái từ máy chủ, nhãn trung thực");
    unmount(host);
  });

  it("hủy yêu cầu qua confirm → cancelDeletionRequest(id,{expectedRevision}) → trạng thái Đã hủy", async () => {
    withSession();
    const behavior = {};
    const { ctx } = makeCtx({
      demo: false, role: "student", adapter: privacyAdapter({ behavior }),
    });
    const { host, el } = mount(privacyPage, ctx);
    await wait(50);
    const delCard = Array.from(el.querySelectorAll(".fb-card"))
      .find((card) => textOf(card).includes("Yêu cầu xóa dữ liệu"));
    delCard.querySelector("input[value='messages']").checked = true;
    findButton(delCard, "Gửi yêu cầu xóa dữ liệu").click();
    clickDialogAction("Gửi yêu cầu");
    await wait(60);
    findButton(delCard, "Hủy yêu cầu xóa").click();
    clickDialogAction("Hủy yêu cầu");
    await wait(60);
    assert.equal(behavior.cancelCalls.length, 1);
    assert.equal(behavior.cancelCalls[0].id, "dr-1");
    assert.ok("expectedRevision" in behavior.cancelCalls[0], "contract expectedRevision");
    assert.ok(textOf(delCard).includes("Đã hủy"));
    assert.ok(textOf(delCard).includes("không bị xóa bởi yêu cầu này"));
    unmount(host);
  });

  it("409 revision_conflict khi hủy → tải lại trạng thái, KHÔNG tự retry hủy", async () => {
    withSession();
    const behavior = {
      cancelError: new ApiError("conflict", 409, "http",
        { code: "revision_conflict", details: { current_revision: 3 } }),
    };
    const { ctx } = makeCtx({
      demo: false, role: "student", adapter: privacyAdapter({ behavior }),
    });
    const { host, el } = mount(privacyPage, ctx);
    await wait(50);
    const delCard = Array.from(el.querySelectorAll(".fb-card"))
      .find((card) => textOf(card).includes("Yêu cầu xóa dữ liệu"));
    delCard.querySelector("input[value='mood']").checked = true;
    findButton(delCard, "Gửi yêu cầu xóa dữ liệu").click();
    clickDialogAction("Gửi yêu cầu");
    await wait(60);
    findButton(delCard, "Hủy yêu cầu xóa").click();
    clickDialogAction("Hủy yêu cầu");
    await wait(60);
    assert.equal(behavior.cancelCalls.length, 1, "không tự retry");
    assert.ok(behavior.detailCalls.length >= 2, "phải refetch getDeletionRequest sau 409");
    assert.ok(textOf(delCard).includes("vừa thay đổi trên máy chủ"));
    unmount(host);
  });

  it("consents: service đang đồng ý → Rút đồng ý (confirm) → withdrawConsent + refetch; research declined không có nút", async () => {
    withSession();
    const behavior = {};
    const { ctx } = makeCtx({
      demo: false, role: "student", adapter: privacyAdapter({ behavior }),
    });
    const { host, el } = mount(privacyPage, ctx);
    await wait(50);
    const consentCard = Array.from(el.querySelectorAll(".fb-card"))
      .find((card) => textOf(card).includes("Đồng ý theo mục đích"));
    assert.ok(textOf(consentCard).includes("Đang đồng ý (phiên bản service-v1)"));
    assert.ok(textOf(consentCard).includes("Bạn đã từ chối"), "research declined");
    const withdrawBtn = findButton(consentCard, "Rút đồng ý");
    assert.ok(withdrawBtn, "chỉ purpose đang đồng ý mới có nút rút");
    withdrawBtn.click();
    const dialogRoot = document.body.querySelector(".fb-dialog-root");
    assert.ok(textOf(dialogRoot).includes("không thể tiếp tục dùng Family Bridge"),
      "hậu quả copy trung thực");
    clickDialogAction("Rút đồng ý");
    await wait(60);
    assert.deepEqual(behavior.withdrawCalls, [{ purpose: "service" }]);
    assert.ok(behavior.consentsCalls.length >= 2, "refetch consents sau rút");
    const cardAfter = Array.from(el.querySelectorAll(".fb-card"))
      .find((card) => textOf(card).includes("Đồng ý theo mục đích"));
    assert.ok(textOf(cardAfter).includes("Đã rút đồng ý"));
    unmount(host);
  });

  it("overview lỗi → error state + Thử lại; KHÔNG hiển thị trạng thái bịa", async () => {
    withSession();
    const behavior = { overviewError: new ApiError("net", 0, "network") };
    const { ctx } = makeCtx({
      demo: false, role: "student", adapter: privacyAdapter({ behavior }),
    });
    const { host, el } = mount(privacyPage, ctx);
    await wait(50);
    assert.ok(textOf(el).includes("Không tải được trạng thái riêng tư"));
    assert.ok(findButton(el, "Thử lại"));
    assert.ok(!textOf(el).includes("Hoàn tất"), "không tự suy trạng thái");
    unmount(host);
  });

  it("banned strings vắng mặt trên cả hai trang (không over-claim)", () => {
    for (const file of ["src/pages/settings/index.js", "src/pages/privacy/index.js"]) {
      const source = readFileSync(join(ROOT, file), "utf8");
      for (const banned of ["Đã gửi", "Đã lưu", "Đã chia sẻ", "đã xóa hết",
        "Bảo mật 100%", "Mã hóa nội bộ", "Giám hộ", "cdn.tailwindcss.com"]) {
        assert.ok(!source.includes(banned), `${file} không được chứa "${banned}"`);
      }
    }
  });
});
