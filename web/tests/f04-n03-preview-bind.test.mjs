// tests/f04-n03-preview-bind.test.mjs — N03 (QA F04 vòng 2, P1): sheet xác
// nhận gửi phải bind từ RESPONSE preview (server-truth), không chỉ so state
// LOCAL trước/sau await như N01. Kịch bản lỗi gốc: client khác (Mini) đổi
// người nhận B và lưu trong khi web preview đang bay — server trả preview
// {recipient_id: B, revision: 2, body} nhưng local state còn A/rev1 → check
// local của N01 vẫn pass, sheet cũ hiện tên A từ ui.recipientName (state cũ)
// và confirm-send 200 gửi B. Hai chiều đều sai.
//
// Hợp đồng (lead chốt, binding): previewDraft trả
// {preview_id, revision, recipient_id, body, deadline, server_time};
// lệch snapshot (revision/recipient/body) BẤT KỲ → KHÔNG mở sheet, tự GET
// draft mới từ server (adapter.getDraft), cập nhật state + UI, statusNote
// trung thực, KHÔNG tự mở sheet với bản mới. Tên người nhận trong sheet
// resolve từ preview.recipient_id qua danh sách connections; không resolve
// được → FAIL CLOSED (cảnh báo + disable nút gửi, không fallback tên khác).
//
// Chạy: node --test tests/f04-n03-preview-bind.test.mjs
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

const { initStore, setRole, resetState } = await import("../src/app/store.js");
const { setSession } = await import("../src/core/session.js");

const compose = (await import("../src/pages/compose/index.js")).page;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function textOf(el) {
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

function findButton(root, needle) {
  return Array.from(root.querySelectorAll("button")).find(
    (btn) => textOf(btn).includes(needle),
  );
}

function findSheetByTitle(title) {
  return Array.from(document.body.querySelectorAll(".fb-sheet")).find(
    (sheetEl) => textOf(sheetEl.querySelector(".fb-sheet__title")) === title,
  ) || null;
}

function makeCtx({ adapter }) {
  initStore({ demoMode: false });
  resetState();
  setRole("student");
  return {
    ctx: {
      store: { getState: () => ({ demoMode: false, role: "student" }) },
      adapter,
      navigate: () => {},
      setRole: () => {},
      rebuildAdapter: () => {},
      params: new URLSearchParams(""),
    },
    adapter,
  };
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
  document.body.querySelectorAll(".fb-sheet-root, .fb-dialog-root, .fb-overlay").forEach((el) => el.remove());
}

function withSession() {
  setSession({
    token: "test-token-n03",
    userId: "u-student-1",
    expiresAt: Date.now() + 60 * 60 * 1000,
    displayName: "Học sinh Test",
  });
}

const TWO_CONNECTIONS = [
  {
    connection_id: "c-1", status: "active", relationship_kind: "primary",
    generation: 1, other_party_id: "u-care-1",
    counterpart: { display_name: "Người chăm sóc Một", identity_basis: "self_declared" },
  },
  {
    connection_id: "c-2", status: "active", relationship_kind: "backup",
    generation: 1, other_party_id: "u-care-2",
    counterpart: { display_name: "Người chăm sóc Hai", identity_basis: "self_declared" },
  },
];

/**
 * Adapter giả N03: máy chủ riêng (body/revision/recipientId). previewDraft
 * trả đúng server-truth (đúng hợp đồng ec29abb) — kịch bản "client khác đổi
 * dữ liệu" được mô phỏng bằng miniEdit() ghi trực tiếp vào trạng thái máy
 * chủ, đúng như request của Mini làm trên backend thật.
 */
function n03Adapter({ behavior = {} } = {}) {
  const server = {
    body: behavior.initialBody ?? "Bản A đã lưu",
    revision: behavior.initialRevision ?? 1,
    recipientId: behavior.initialRecipientId ?? "u-care-1",
  };
  behavior.getDraftCalls = 0;
  behavior.previewCalls = 0;
  behavior.confirmArgs = behavior.confirmArgs || [];
  behavior.adapterRef = {
    miniEdit: async ({ body, recipientId } = {}) => {
      server.revision += 1; // mọi edit trên máy chủ đều bump revision
      if (body !== undefined) server.body = body;
      if (recipientId !== undefined) server.recipientId = recipientId;
      return draftView();
    },
  };

  const draftView = () => ({
    draft_id: "d-1",
    revision: server.revision,
    status: "editing",
    pause: null,
    recipient_id: server.recipientId,
    body: server.body,
    server_time: "2026-10-19T00:00:00Z",
  });

  return {
    mode: "web",
    listConnections: async () => ({ results: behavior.connections || TWO_CONNECTIONS, nextCursor: null }),
    listDrafts: async () => ({
      results: [draftView()],
      serverTime: "2026-10-19T00:00:00Z",
    }),
    getDraft: async () => {
      behavior.getDraftCalls += 1;
      return draftView();
    },
    createDraft: async () => { throw new Error("không dùng trong test N03"); },
    editDraft: async (id, payload = {}) => {
      behavior.editArgs = behavior.editArgs || [];
      behavior.editArgs.push({ id, ...payload });
      server.revision += 1;
      if (payload.body !== undefined) server.body = payload.body;
      if (payload.recipientId !== undefined) server.recipientId = payload.recipientId;
      return draftView();
    },
    previewDraft: async (id) => {
      behavior.previewCalls += 1;
      return {
        preview_id: `pv-${behavior.previewCalls}`,
        draft_id: id,
        revision: server.revision,
        recipient_id: server.recipientId,
        deadline: "2026-10-19T00:05:00Z",
        server_time: "2026-10-19T00:00:00Z",
        body: server.body,
      };
    },
    confirmDraftSend: async (id, previewId) => {
      behavior.confirmArgs.push([id, previewId]);
      return { message_id: "m-1", draft_id: id, status: "sent" };
    },
    pauseDraft: async () => ({ status: "paused", pause: { remaining_seconds: 300, can_preview: false } }),
    cancelDraftPause: async () => ({ status: "editing", pause: null }),
    aiStatus: async () => ({ ai_enabled: true }),
    listConsents: async () => ([
      { purpose: "ai_processing", decision: "accepted", policy_version: "ai-v1", withdrawn: false, current: true },
    ]),
    recordConsent: async (args) => ({ consent_id: "c-1", ...args }),
    aiRefine: async () => { throw new Error("không dùng trong test N03"); },
    aiAccept: async (id) => ({ suggestion_id: id, status: "accepted" }),
    aiDiscard: async (id) => ({ suggestion_id: id, status: "discarded" }),
  };
}

async function setupCompose(behavior = {}) {
  withSession();
  const adapter = n03Adapter({ behavior });
  const { ctx } = makeCtx({ adapter });
  const { host, el } = mount(compose, ctx);
  await wait(60); // đợi listConnections/listDrafts + aiStatus resolve
  const textarea = el.querySelector("#fb-compose-body");
  const previewBtn = el.querySelector(".fb-btn-hero");
  const changeBtn = el.querySelector(".fb-compose__change-btn");
  return { host, el, behavior, textarea, previewBtn, changeBtn };
}

describe("F04 web — N03: sheet gửi bind từ RESPONSE preview (server-truth hai chiều)", () => {
  it("case A1 — client khác đổi recipient + lưu khi preview bay: response lệch snapshot (recipient+revision+body) → KHÔNG mở sheet, GET draft mới, refresh state + UI, note trung thực", async () => {
    const { host, el, behavior, textarea, previewBtn } = await setupCompose();

    // Client khác (Mini) ghi đè máy chủ TRƯỚC khi preview trả về: đổi người
    // nhận B, revision bump 2, body khác — response preview trả server-truth
    // (đúng hợp đồng), local state còn A/rev1.
    await behavior.adapterRef.miniEdit({ body: "Bản B từ Mini", recipientId: "u-care-2" });

    previewBtn.click();
    await wait(40);

    const confirmSheet = findSheetByTitle("Xem trước nội dung");
    // (harness fix, không đổi contract: assert.equal(node, null) với node là
    // happy-dom Element làm Node 24 OOM khi dựng AssertionError — actual là
    // Element; assert.ok(x === null) cùng điều kiện fail, actual boolean.)
    assert.ok(confirmSheet === null,
      "preview response lệch snapshot (recipient/revision/body) → KHÔNG mở sheet xác nhận");
    assert.ok(behavior.getDraftCalls >= 1,
      "đã tự GET lại bản nháp mới từ máy chủ sau khi phát hiện lệch");
    assert.equal(textarea.value, "Bản B từ Mini",
      "sau refresh, textarea hiển thị đúng bản máy chủ mới");
    assert.ok(textOf(el).includes("Người chăm sóc Hai"),
      "UI người nhận refresh theo server-truth (B), không còn giữ tên A cũ");
    assert.ok(textOf(el).includes("Bản nháp đã thay đổi ở nơi khác"),
      "statusNote trung thực: đã tải bản mới, yêu cầu xem lại trước khi gửi");
    assert.equal(textarea.disabled, false, "đã mở khóa textarea sau refresh");
    assert.equal((behavior.confirmArgs || []).length, 0,
      "không có bất kỳ confirm-send nào bị gọi trong kịch bản lệch");
    unmount(host);
  });

  it("case A2 — chỉ body+revision lệch (Mini sửa nội dung, recipient giữ): KHÔNG mở sheet + refresh bản mới + note", async () => {
    const { host, el, behavior, textarea, previewBtn } = await setupCompose();

    await behavior.adapterRef.miniEdit({ body: "Bản B từ Mini" }); // recipient vẫn A

    previewBtn.click();
    await wait(40);

    // (harness fix OOM: xem case A1)
    assert.ok(findSheetByTitle("Xem trước nội dung") === null,
      "body+revision preview lệch snapshot → không mở sheet");
    assert.ok(behavior.getDraftCalls >= 1, "đã GET draft mới từ máy chủ");
    assert.equal(textarea.value, "Bản B từ Mini",
      "textarea được cập nhật theo bản máy chủ mới nhất");
    assert.ok(textOf(el).includes("Bản nháp đã thay đổi ở nơi khác"),
      "note trung thực cho user");
    unmount(host);
  });

  it("case A3 — chỉ revision lệch (Mini lưu lại cùng nội dung): KHÔNG mở sheet + refresh + note; preview lại do user bấm thì mở bình thường", async () => {
    const { host, el, behavior, textarea, previewBtn } = await setupCompose();

    await behavior.adapterRef.miniEdit({ body: "Bản A đã lưu" }); // cùng body, revision bump 2

    previewBtn.click();
    await wait(40);

    // (harness fix OOM: xem case A1)
    assert.ok(findSheetByTitle("Xem trước nội dung") === null,
      "revision preview (2) lệch snapshot (1) → không mở sheet");
    assert.ok(behavior.getDraftCalls >= 1, "đã GET draft mới");
    assert.ok(textOf(el).includes("Bản nháp đã thay đổi ở nơi khác"),
      "note trung thực");
    // Sau refresh, preview LẠI (user chủ động bấm) phải mở sheet được với
    // revision mới — KHÔNG kẹt vĩnh viễn ở trạng thái refresh.
    previewBtn.click();
    await wait(40);
    const sheet = findSheetByTitle("Xem trước nội dung");
    assert.ok(sheet, "preview lại sau refresh (user bấm) → sheet mở bình thường");
    unmount(host);
  });

  it("case B1 — label/nút gửi resolve từ preview.recipient_id (không phải text cũ trên thẻ): chọn B → 'Gửi cho Người chăm sóc Hai'", async () => {
    const { host, el, behavior, previewBtn, changeBtn } = await setupCompose();

    changeBtn.click();
    await wait(30);
    const recipientSheet = findSheetByTitle("Chọn người nhận");
    findButton(recipientSheet, "Người chăm sóc Hai").click();
    await wait(20);

    previewBtn.click();
    await wait(40);
    const confirmSheet = findSheetByTitle("Xem trước nội dung");
    assert.ok(confirmSheet, "preview hợp lệ → sheet mở");
    assert.ok(findButton(confirmSheet, "Gửi cho Người chăm sóc Hai"),
      "nút gửi phải resolve tên từ preview.recipient_id (B), không phải tên cũ A");

    findButton(confirmSheet, "Gửi cho Người chăm sóc Hai").click();
    await wait(40);
    assert.equal(behavior.confirmArgs.length, 1, "confirm đúng một lần cho bản B");
    unmount(host);
  });

  it("case B2 — preview.recipient_id không có trong connections → FAIL CLOSED: cảnh báo + disable nút gửi, KHÔNG fallback tên khác, không gửi được", async () => {
    // Draft trên máy chủ trỏ tới người nhận đã rời khỏi danh sách kết nối.
    const { host, el, behavior, previewBtn } = await setupCompose({
      initialRecipientId: "u-da-xoa",
    });

    previewBtn.click();
    await wait(40);
    const confirmSheet = findSheetByTitle("Xem trước nội dung");
    assert.ok(confirmSheet,
      "preview khớp snapshot (revision/body/recipient) → sheet mở để báo tình trạng");
    assert.ok(
      textOf(confirmSheet).includes("Người nhận không còn trong danh sách kết nối"),
      "cảnh báo fail-closed hiển thị trong sheet",
    );
    const sendBtn = Array.from(confirmSheet.querySelectorAll("button")).find(
      (btn) => btn.disabled && textOf(btn).includes("gửi"),
    );
    assert.ok(sendBtn, "có nút gửi (đã disable) trong sheet");
    assert.equal(sendBtn.disabled, true, "nút gửi bị disable (fail closed)");
    assert.ok(
      !textOf(confirmSheet).includes("Gửi cho Người chăm sóc Một"),
      "KHÔNG fallback sang tên kết nối khác (tránh gửi nhầm người)",
    );
    sendBtn.click(); //disabled → không phát sinh gửi
    await wait(40);
    assert.equal((behavior.confirmArgs || []).length, 0,
      "fail-closed: không có confirmDraftSend nào được gọi");
    unmount(host);
  });

  it("case B3 — revision drift giữa lúc mở sheet và lúc bấm Gửi: re-verify chặn, KHÔNG confirm-send, lỗi trung thực trong sheet", async () => {
    const { host, el, behavior, previewBtn } = await setupCompose();

    previewBtn.click();
    await wait(40);
    const confirmSheet = findSheetByTitle("Xem trước nội dung");
    assert.ok(confirmSheet, "sheet mở bình thường");

    // Giữa lúc sheet mở và lúc bấm Gửi: draft bị lưu lại (revision máy chủ
    // và state.revision tăng) — preview đã chốt là revision cũ.
    findButton(el, "Lưu nháp riêng").click();
    await wait(40);

    findButton(confirmSheet, "Gửi cho Người chăm sóc Một").click();
    await wait(40);

    assert.equal((behavior.confirmArgs || []).length, 0,
      "revision drift sau khi sheet mở → KHÔNG gọi confirmDraftSend");
    assert.ok(
      textOf(confirmSheet).includes("sau khi xem trước"),
      "lỗi trung thực nằm trong sheet (re-verify chặn drift revision)",
    );
    unmount(host);
  });
});
