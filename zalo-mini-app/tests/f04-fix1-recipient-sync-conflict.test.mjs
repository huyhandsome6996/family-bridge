// tests/f04-fix1-recipient-sync-conflict.test.mjs — FIX1 (R1B vòng 1, 19/10):
// 2 test còn thiếu đã để lộ 2 P1 mini (r1b-findings.md):
//
// (fix1-a) P1-1 — đổi CHỈ người nhận (body nguyên) rồi preview:
//   Mini cũ chỉ auto-sync khi BODY dirty (không có syncedRecipientId) ->
//   preview bind người CŨ -> drift check bắt -> GET refresh REVERT lựa chọn
//   user + note "thay đổi ở nơi khác" SAI NGUYÊN NHÂN -> loop vô hạn.
//   Hợp đồng fix (parity web): onPreview tự đồng bộ editDraft khi body HOẶC
//   người nhận dirty (syncedRecipientId = bản máy chủ đang giữ); preview sau
//   sync bind ĐÚNG người mới -> sheet mở đúng người, không refresh-revert.
//
// (fix1-b) P1-2 — conflict lần 2 sau khi lần 1 xử lý thành công (ghi đè):
//   Mini cũ: adopt/overwrite thành công gọi sheet.remove() TRỰC TIẾP -> bypass
//   createSheet.close() -> onClose không chạy -> state.conflictSheetOpen kẹt
//   TRUE -> MỌI revision_conflict sau đó bị nuốt im lặng (openRevisionConflict-
//   Sheet return sớm). Hợp đồng fix: success path đóng qua sheet.close() ->
//   onClose chạy -> cờ nhả -> panel lần 2 VẪN mở.
//
// Pattern happy-dom giống tests/f04-n06-conflict.test.mjs.
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

function conflictError(currentRevision) {
  return {
    status: 409,
    code: "revision_conflict",
    details: { reason: "draft_conflict", current_revision: currentRevision },
  };
}

/* ------------------------------ Fixture chung ------------------------------ */

const BODY_A = "Bản A đã nằm trên máy chủ.";

const SERVER_DRAFT = {
  draft_id: "d-fix1",
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
 * Adapter stub STATEFUL đúng hợp đồng: editDraft là full-replace (body +
 * recipient), bump revision theo expectedRevision; previewDraft/getDraft luôn
 * phản ánh server truth TẠI THỜI ĐIỂM GỌI (recipient + body + revision).
 */
function createServer() {
  const calls = { editDraft: [], preview: [], getDraft: [], confirmSend: [] };
  let currentRevision = SERVER_DRAFT.revision;
  let currentRecipientId = SERVER_DRAFT.recipient_id;
  let currentBody = SERVER_DRAFT.body;
  let conflictOn = null; // Set chỉ số lượt editDraft phải 409
  const adapter = {
    listConnections: async () => ({ results: CONNECTIONS }),
    listDrafts: async () => ({
      results: [{ ...SERVER_DRAFT }],
      serverTime: "2026-10-19T00:00:00Z",
    }),
    aiStatus: async () => ({ ai_enabled: false }),
    getDraft: async (id) => {
      calls.getDraft.push(id);
      return {
        ...SERVER_DRAFT,
        revision: currentRevision,
        recipient_id: currentRecipientId,
        body: currentBody,
        server_time: "2026-10-19T00:01:00Z",
      };
    },
    editDraft: async (id, args) => {
      calls.editDraft.push({ id, ...args });
      const callIndex = calls.editDraft.length;
      if (conflictOn && conflictOn.has(callIndex)) {
        currentRevision = conflictOn.get(callIndex);
        throw conflictError(currentRevision);
      }
      currentRevision = args.expectedRevision != null
        ? args.expectedRevision + 1
        : currentRevision + 1;
      currentBody = String(args.body ?? "");
      // full-replace: recipientId vắng mặt -> máy chủ XOÁ người nhận.
      currentRecipientId = args.recipientId != null ? String(args.recipientId) : null;
      return {
        ...SERVER_DRAFT,
        revision: currentRevision,
        recipient_id: currentRecipientId,
        body: currentBody,
        server_time: "2026-10-19T00:01:00Z",
      };
    },
    previewDraft: async (id) => {
      calls.preview.push(id);
      return {
        preview_id: `pv-fix1-${calls.preview.length}`,
        revision: currentRevision,
        recipient_id: currentRecipientId,
        body: currentBody,
        deadline: null,
        server_time: "2026-10-19T00:01:00Z",
      };
    },
    confirmDraftSend: async (id, previewId) => {
      calls.confirmSend.push({ id, previewId });
      return { message_id: "m-1", state: "sent" };
    },
  };
  return {
    adapter,
    calls,
    setConflicts(map) { conflictOn = map; },
  };
}

function makeCtx() {
  initStore({ demoMode: true });
  resetState();
  setRole("student");
  return {
    ctx: {
      store: { getState: () => ({ demoMode: true, role: "student" }) },
      adapter: null,
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

/** Đổi người nhận qua đúng đường UI: nút "Đổi" -> sheet -> chọn tên. */
function pickRecipient(el, label) {
  const changePill = findButton(el, "Đổi");
  assert.ok(changePill, "nút Đổi người nhận phải tồn tại");
  changePill.click();
  const sheet = document.body.querySelector(".fb-sheet-root");
  assert.ok(sheet, "sheet chọn người nhận phải mở");
  const target = findButton(sheet, label);
  assert.ok(target, `phải có lựa chọn "${label}" trong sheet người nhận`);
  target.click();
}

/* ============ fix1-a (P1-1): đổi CHỈ người nhận -> tự sync trước preview ============ */

describe("FIX1 P1-1: đổi CHỈ người nhận (body nguyên) -> auto-sync editDraft người nhận TRƯỚC preview; sheet mở đúng người mới, không refresh-revert", () => {
  it("(fix1-a) sync recipient dirty trước preview; preview bind người mới; không getDraft-revert; note không nói 'thay đổi ở nơi khác'", async () => {
    const server = createServer();
    const { adapter, calls } = server;
    const { ctx } = makeCtx();
    ctx.adapter = adapter;
    const { host, el } = mount(ctx);
    await wait(80);

    const textarea = el.querySelector("#fb-compose-body");
    assert.equal(textarea.value, BODY_A, "textarea tải đúng bản A từ máy chủ");
    assert.ok(textOf(el).includes("Bố"), "ban đầu người nhận là Bố (u-care-1)");

    // User đổi CHỈ người nhận — body GIỮ NGUYÊN (không gõ thêm chữ nào).
    pickRecipient(el, "Cô Hoa");
    await wait(40);

    findButton(el, "Xem trước nội dung").click();
    await wait(120);

    // 1) Auto-sync recipient phải xảy ra TRƯỚC preview (editDraft 1 lần,
    //    mang đúng người mới + expectedRevision hiện hành + body nguyên).
    assert.equal(
      calls.editDraft.length,
      1,
      "đổi chỉ người nhận cũng phải auto-sync editDraft trước preview (P1-1)",
    );
    assert.equal(
      calls.editDraft[0].recipientId,
      "u-care-2",
      "editDraft phải mang người nhận MỚI (u-care-2)",
    );
    assert.equal(
      calls.editDraft[0].expectedRevision,
      SERVER_DRAFT.revision,
      "auto-sync phải mang expectedRevision = revision hiện hành (N06)",
    );
    assert.equal(
      calls.editDraft[0].body,
      BODY_A,
      "body không đổi -> sync gửi nguyên bản A (full-replace không mất nội dung)",
    );
    assert.equal(calls.preview.length, 1, "preview chạy sau khi sync thành công");
    assert.equal(
      calls.preview[0],
      SERVER_DRAFT.draft_id,
      "preview đúng bản nháp",
    );

    // 2) Không drift -> KHÔNG getDraft-revert lựa chọn user.
    assert.equal(
      calls.getDraft.length,
      0,
      "preview khớp sau sync -> KHÔNG được refresh/revert (loop cũ P1-1)",
    );

    // 3) Sheet mở ĐÚNG người mới từ preview response.
    const sheet = document.body.querySelector(".fb-sheet-root");
    assert.ok(sheet, "sync xong preview khớp -> sheet xác nhận phải mở");
    const sendBtn = findButton(sheet, "Gửi cho");
    assert.ok(sendBtn, "nút gửi phải có label 'Gửi cho ...'");
    assert.equal(
      textOf(sendBtn),
      "Gửi cho Cô Hoa",
      `sheet phải bind người mới từ preview response — thực tế: "${textOf(sendBtn)}"`,
    );

    // 4) Không note sai nguyên nhân "thay đổi ở nơi khác" (thay đổi là của
    //    chính user, đã được sync; không phải client khác sửa).
    const note = statusNoteOf(el);
    assert.ok(
      !note || !textOf(note).includes("đã thay đổi ở nơi khác"),
      `không được báo sai 'thay đổi ở nơi khác' — thực tế: "${note ? textOf(note) : ""}"`,
    );
    cleanup(host);
  });
});

/* ============ fix1-b (P1-2): conflict lần 2 sau lần 1 thành công VẪN mở ============ */

describe("FIX1 P1-2: conflict lần 1 xử lý thành công (ghi đè) -> conflict lần 2 VẪN mở panel (không nuốt im lặng)", () => {
  it("(fix1-b) ghi đè thành công đóng panel qua close(); 409 lần 2 phải mở lại panel xung đột", async () => {
    const server = createServer();
    const { adapter, calls } = server;
    // Lượt editDraft 1 (lưu tay) và 3 (lưu tay lần nữa) đều 409.
    server.setConflicts(new Map([[1, 5], [3, 9]]));
    const { ctx } = makeCtx();
    ctx.adapter = adapter;
    const { host, el } = mount(ctx);
    await wait(80);

    const textarea = el.querySelector("#fb-compose-body");

    // --- Lần 1: lưu tay vấp 409 (current_revision 5) -> panel mở ---
    type(textarea, "Bản của con viết lúc tối.");
    findButton(el, "Lưu nháp riêng").click();
    await wait(120);
    let sheet = document.body.querySelector(".fb-sheet-root");
    assert.ok(sheet, "lần 1: 409 revision_conflict -> panel xung đột phải mở");

    // --- Ghi đè thành công (expectedRevision 5 -> rev 6) -> panel đóng ---
    findButton(sheet, "Ghi đè bằng bản của tôi").click();
    await wait(140);
    assert.equal(calls.editDraft.length, 2, "ghi đè gọi editDraft đúng 1 lần");
    assert.equal(
      calls.editDraft[1].expectedRevision,
      5,
      "ghi đè mang expectedRevision = current_revision (5)",
    );
    assert.ok(
      !document.body.querySelector(".fb-sheet-root"),
      "ghi đè thành công -> panel phải đóng (onClose chạy, cờ nhả)",
    );

    // --- Lần 2: lưu tay vấp 409 lần nữa (current_revision 9) ---
    type(textarea, "Bản của con viết lúc tối. Con thêm dòng mới.");
    findButton(el, "Lưu nháp riêng").click();
    await wait(140);
    assert.equal(calls.editDraft.length, 3, "lần 2: editDraft đã gửi lên máy chủ");

    // P1-2: nếu cờ conflictSheetOpen kẹt TRUE (sheet.remove() bypass onClose),
    // openRevisionConflictSheet return im lặng -> KHÔNG panel -> assertion đỏ.
    sheet = document.body.querySelector(".fb-sheet-root");
    assert.ok(
      sheet,
      "conflict lần 2 sau lần 1 thành công: panel VẪN phải mở (không nuốt im lặng)",
    );
    assert.ok(
      textOf(sheet).includes("Bản nháp đã thay đổi trên máy chủ"),
      "panel lần 2 phải là panel xung đột đúng nghĩa",
    );
    const adoptBtn = findButton(sheet, "Cập nhật theo bản trên máy chủ");
    const overwriteBtn = findButton(sheet, "Ghi đè bằng bản của tôi");
    assert.ok(adoptBtn, "panel lần 2 đủ lựa chọn adopt");
    assert.ok(overwriteBtn, "panel lần 2 đủ lựa chọn ghi đè");
    cleanup(host);
  });
});
