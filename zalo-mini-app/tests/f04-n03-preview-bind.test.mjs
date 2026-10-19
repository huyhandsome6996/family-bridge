// tests/f04-n03-preview-bind.test.mjs — N03 (QA 19/10, P1 "duyệt A gửi B"):
// Mini đã có N01 snapshot guard so LOCAL nhưng KHÔNG bind/validate
// preview.recipient_id + preview.revision (+ body) từ response — sheet lấy
// tên người nhận từ state cũ -> duyệt A gửi B (FAIL cả hai chiều
// web-review/mini-edit và mini-review/web-edit).
//
// Hợp đồng fix (F04R2-LEAD-1):
// - Sau await previewDraft + seq check (N01 giữ nguyên): SERVER-TRUTH check
//   Number(preview.revision) === snapshot.revision && preview.recipient_id ===
//   snapshot.recipientId && preview.body === snapshot.body. Lệch -> KHÔNG mở
//   sheet; refresh draft từ server (getDraft) + cập nhật state/UI; note trung
//   thực "Bản nháp đã thay đổi ở nơi khác (nội dung/người nhận). Đã tải bản
//   mới — hãy xem lại trước khi gửi."
// - Sheet: tên người nhận resolve từ preview.recipient_id qua connections;
//   không resolve được -> fail closed (cảnh báo + disable gửi, KHÔNG fallback
//   tên cũ). Label nút = "Gửi cho <tên-từ-preview>".
// - Re-verify lúc bấm Gửi gồm cả state.revision === preview.revision.
//
// Tương thích shape CŨ (thiếu field): server cũ không trả field nào thì bỏ
// qua field đó (fallback N01 như trước) — shape hợp đồng mới (A1/A2) luôn có
// đủ revision/recipient_id/body nên check luôn chạy đầy đủ.
//
// Pattern happy-dom giống tests/f04-preview-snapshot.test.mjs.
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
const compose = (await import("../src/pages/compose/index.js")).page;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function textOf(el) {
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

function findButton(root, needle) {
  return Array.from(root.querySelectorAll("button")).find(
    (btn) => textOf(btn).includes(needle),
  );
}

function type(el, value) {
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/* ----------------------- Fixture: bản nháp + connections ----------------------- */

const BODY_A = "Bản A đã nằm trên máy chủ.";

const SERVER_DRAFT = {
  draft_id: "d-n03",
  revision: 2,
  status: "editing",
  pause: null,
  recipient_id: "u-care-1",
  body: BODY_A,
};

const CONNECTIONS = [
  {
    connection_id: "c-1",
    other_party_id: "u-care-1",
    status: "active",
    relationship_kind: "primary",
    counterpart: { display_name: "Bố" },
  },
  {
    connection_id: "c-2",
    other_party_id: "u-care-2",
    status: "active",
    relationship_kind: "primary",
    counterpart: { display_name: "Cô Hoa" },
  },
];

/**
 * Adapter stub: previewDraft trả shape HỢP ĐỒNG MỚI + getDraft để refresh.
 * - listDrafts  : bản client thấy khi tải trang (SERVER_DRAFT mặc định).
 * - previewDraft: response máy chủ bind (mặc định khớp listDrafts).
 * - getDraft    : bản server-truth sau khi refresh (mặc định = SERVER_DRAFT).
 */
function createAdapter(behavior = {}) {
  const calls = {
    editDraft: [],
    preview: [],
    confirmSend: [],
    getDraft: [],
  };
  const listDraft = behavior.listDraft || { ...SERVER_DRAFT };
  const refreshDraft = behavior.refreshDraft || { ...SERVER_DRAFT };
  const adapter = {
    listConnections: async () => ({
      results: behavior.connections || CONNECTIONS,
    }),
    listDrafts: async () => ({
      results: [{ ...listDraft }],
      serverTime: "2026-10-19T00:00:00Z",
    }),
    aiStatus: async () => ({ ai_enabled: false }),
    getDraft: async (id) => {
      calls.getDraft.push(id);
      if (behavior.getDraftError) throw behavior.getDraftError;
      return { ...refreshDraft, server_time: "2026-10-19T00:01:00Z" };
    },
    editDraft: async (id, args) => {
      calls.editDraft.push({ id, ...args });
      if (behavior.editRevision) {
        return { ...refreshDraft, revision: behavior.editRevision, server_time: "2026-10-19T00:01:00Z" };
      }
      return { ...refreshDraft, server_time: "2026-10-19T00:01:00Z" };
    },
    previewDraft: async (id) => {
      calls.preview.push(id);
      return {
        preview_id: "pv-n03",
        revision: behavior.previewRevision ?? listDraft.revision,
        recipient_id: behavior.previewRecipientId ?? listDraft.recipient_id,
        body: behavior.previewBody ?? listDraft.body,
        deadline: null,
        server_time: "2026-10-19T00:01:00Z",
      };
    },
    confirmDraftSend: async (id, previewId) => {
      calls.confirmSend.push({ id, previewId });
      return { message_id: "m-1", state: "sent" };
    },
    sendMessage: async () => {
      throw new Error("compose KHÔNG được dùng sendMessage");
    },
  };
  return { adapter, calls };
}

function makeCtx({ role = "student" } = {}) {
  initStore({ demoMode: true });
  resetState();
  setRole(role);
  return {
    ctx: {
      store: { getState: () => ({ demoMode: true, role }) },
      adapter: null, // gắn sau khi createAdapter
      navigate: () => {},
      setRole: () => {},
      rebuildAdapter: () => {},
      params: new URLSearchParams(""),
    },
  };
}

function mount(ctx) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const el = compose.render(ctx);
  host.appendChild(el);
  return { host, el };
}

function cleanup(host) {
  host.remove();
  document.body.querySelectorAll(".fb-sheet-root, .fb-dialog-root").forEach((el) => el.remove());
  resetState();
}

function statusNoteOf(el) {
  return el.querySelector("p.fb-page__note[role='status']");
}

function previewBodyOf(sheet) {
  const node = sheet.querySelector(".fb-compose__preview-body");
  return node ? node.textContent : null;
}

/* ==================== N03: bind sheet từ preview response ==================== */

describe("N03 (US-033): preview phải bind revision/recipient/body máy chủ — sheet không dùng state cũ", () => {
  it("(b1) preview revision khác snapshot -> KHÔNG mở sheet; getDraft refresh + note 'thay đổi ở nơi khác'; textarea cập nhật bản máy chủ", async () => {
    const { adapter, calls } = createAdapter({
      previewRevision: 9,
      refreshDraft: { ...SERVER_DRAFT, revision: 9 },
    });
    const { ctx } = makeCtx();
    ctx.adapter = adapter;
    const { host, el } = mount(ctx);
    await wait(80);

    findButton(el, "Xem trước nội dung").click();
    await wait(80);

    assert.ok(
      !document.body.querySelector(".fb-sheet-root"),
      "N03: server revision lệch snapshot -> KHÔNG được mở sheet xác nhận",
    );
    assert.equal(calls.getDraft.length, 1, "phải refresh draft từ máy chủ (getDraft)");
    assert.equal(
      el.querySelector("#fb-compose-body").value,
      BODY_A,
      "textarea phải được cập nhật theo bản máy chủ sau refresh",
    );
    const note = statusNoteOf(el);
    assert.ok(
      note && textOf(note).includes("đã thay đổi ở nơi khác"),
      `note phải trung thực về thay đổi ở nơi khác — thực tế: "${note ? textOf(note) : "không có note"}"`,
    );
    assert.equal(findButton(el, "Xem trước nội dung").disabled, false, "phải mở khóa để xem trước lại");
    assert.equal(calls.confirmSend.length, 0, "không gửi gì sau lệch revision");
    cleanup(host);
  });

  it("(b2) preview recipient_id khác -> refresh + note; người nhận trên UI cập nhật theo máy chủ, không dùng tên cũ", async () => {
    const { adapter, calls } = createAdapter({
      // Máy chủ bind người nhận Cô Hoa (đổi ở nơi khác) — khác snapshot Bố.
      previewRecipientId: "u-care-2",
      refreshDraft: { ...SERVER_DRAFT, recipient_id: "u-care-2" },
    });
    const { ctx } = makeCtx();
    ctx.adapter = adapter;
    const { host, el } = mount(ctx);
    await wait(80);

    findButton(el, "Xem trước nội dung").click();
    await wait(80);

    assert.ok(
      !document.body.querySelector(".fb-sheet-root"),
      "recipient_id máy chủ lệch -> KHÔNG mở sheet",
    );
    assert.equal(calls.getDraft.length, 1, "refresh qua getDraft");
    const note = statusNoteOf(el);
    assert.ok(
      note && textOf(note).includes("đã thay đổi ở nơi khác"),
      "note trung thực (nội dung/người nhận)",
    );
    assert.ok(
      textOf(el).includes("Cô Hoa"),
      "UI người nhận phải cập nhật theo dữ liệu máy chủ (Cô Hoa)",
    );
    assert.equal(calls.confirmSend.length, 0);
    cleanup(host);
  });

  it("(b3) preview body khác bản máy chủ bind -> không mở sheet + refresh + note", async () => {
    const serverBody = "Mẹ đã sửa bản nháp từ nơi khác.";
    const { adapter, calls } = createAdapter({
      previewBody: serverBody,
      previewRevision: 3,
      refreshDraft: { ...SERVER_DRAFT, body: serverBody, revision: 3 },
    });
    const { ctx } = makeCtx();
    ctx.adapter = adapter;
    const { host, el } = mount(ctx);
    await wait(80);

    findButton(el, "Xem trước nội dung").click();
    await wait(80);

    assert.ok(
      !document.body.querySelector(".fb-sheet-root"),
      "body máy chủ khác snapshot -> KHÔNG mở sheet",
    );
    assert.equal(calls.getDraft.length, 1);
    assert.equal(
      el.querySelector("#fb-compose-body").value,
      serverBody,
      "textarea phải nạp bản máy chủ sau refresh",
    );
    const note = statusNoteOf(el);
    assert.ok(note && textOf(note).includes("đã thay đổi ở nơi khác"));
    assert.equal(calls.confirmSend.length, 0);
    cleanup(host);
  });

  it("(c1) preview khớp snapshot + recipient resolve được -> sheet mở, nút 'Gửi cho Bố', body = preview.body; xác nhận gửi đúng preview_id", async () => {
    const { adapter, calls } = createAdapter();
    const { ctx } = makeCtx();
    ctx.adapter = adapter;
    const { host, el } = mount(ctx);
    await wait(80);

    findButton(el, "Xem trước nội dung").click();
    await wait(80);
    const sheet = document.body.querySelector(".fb-sheet-root");
    assert.ok(sheet, "luồng lành -> sheet mở");
    const sendBtn = findButton(sheet, "Gửi cho");
    assert.ok(sendBtn, "nút gửi phải có label 'Gửi cho ...'");
    assert.equal(
      textOf(sendBtn),
      "Gửi cho Bố",
      `label nút phải resolve tên từ preview.recipient_id — thực tế: "${textOf(sendBtn)}"`,
    );
    assert.equal(previewBodyOf(sheet), BODY_A, "sheet hiển thị preview.body (bản máy chủ bind)");

    sendBtn.click();
    await wait(60);
    assert.deepEqual(
      calls.confirmSend[0],
      { id: SERVER_DRAFT.draft_id, previewId: "pv-n03" },
      "confirm mang đúng draft_id + preview_id",
    );
    cleanup(host);
  });

  it("(c2) preview.recipient_id không resolve được qua connections -> fail closed: cảnh báo + nút gửi disabled + KHÔNG fallback tên cũ; bấm không gửi", async () => {
    // Không có kết nối active -> refreshRecipientUi giữ recipient_id gốc của
    // draft ("u-ghost"), preview trả đúng id đó (khớp snapshot) nhưng id này
    // không resolve được qua connections.
    const { adapter, calls } = createAdapter({
      connections: [{
        connection_id: "c-1",
        other_party_id: "u-care-1",
        status: "pending", // KHÔNG active
        relationship_kind: "primary",
        counterpart: { display_name: "Bố" },
      }],
      listDraft: { ...SERVER_DRAFT, recipient_id: "u-ghost" },
      previewRecipientId: "u-ghost",
    });
    const { ctx } = makeCtx();
    ctx.adapter = adapter;
    const { host, el } = mount(ctx);
    await wait(80);

    findButton(el, "Xem trước nội dung").click();
    await wait(80);
    const sheet = document.body.querySelector(".fb-sheet-root");
    assert.ok(sheet, "sheet vẫn mở để báo trạng thái (fail closed trong sheet)");

    const sendBtn = findButton(sheet, "Gửi");
    assert.ok(sendBtn, "nút gửi vẫn hiện để khóa rõ ràng");
    assert.equal(
      sendBtn.disabled,
      true,
      "fail closed: không resolve được người nhận -> KHÓA gửi",
    );
    assert.ok(
      textOf(sheet).includes("Không xác định được người nhận"),
      "phải có cảnh báo trung thực về người nhận không xác định",
    );
    // KHÔNG fallback tên cũ: sheet không được hiển thị nút "Gửi cho <tên cũ>"
    // khả dụng.
    const oldNameBtn = findButton(sheet, "Gửi cho");
    assert.ok(
      !oldNameBtn || oldNameBtn.disabled,
      "không được fallback sang tên người nhận cũ từ state",
    );
    sendBtn.click();
    await wait(60);
    assert.equal(calls.confirmSend.length, 0, "bấm nút khóa -> không gửi");
    cleanup(host);
  });

  it("(b4) re-verify gồm revision: state.revision đổi sau khi sheet mở (lưu nháp nơi khác bump) -> bấm Gửi KHÔNG confirm, báo bản xem trước đã cũ", async () => {
    const { adapter, calls } = createAdapter({ editRevision: 7 });
    const { ctx } = makeCtx();
    ctx.adapter = adapter;
    const { host, el } = mount(ctx);
    await wait(80);

    findButton(el, "Xem trước nội dung").click();
    await wait(80);
    const sheet = document.body.querySelector(".fb-sheet-root");
    assert.ok(sheet, "sheet mở bình thường trước khi revision đổi");

    // "Nơi khác" lưu nháp: revision máy chủ + state bump lên 7 (cùng body).
    findButton(el, "Lưu nháp riêng").click();
    await wait(80);
    assert.equal(calls.editDraft.length, 1);

    findButton(sheet, "Gửi cho").click();
    await wait(60);
    assert.equal(
      calls.confirmSend.length,
      0,
      "state.revision != preview.revision -> KHÔNG được gọi confirm",
    );
    assert.ok(sheet.isConnected, "không đóng sheet ép");
    assert.ok(
      textOf(sheet).includes("đã cũ"),
      "lỗi trong sheet phải nói rõ bản xem trước đã cũ so với máy chủ",
    );
    cleanup(host);
  });
});
