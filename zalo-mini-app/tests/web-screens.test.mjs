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
