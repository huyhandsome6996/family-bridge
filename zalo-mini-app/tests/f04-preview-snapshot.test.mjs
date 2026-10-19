// tests/f04-preview-snapshot.test.mjs — N01 (QA 19/10, P1 "gửi sai bản đã duyệt")
// US-033: preview đang bay phải CHỐT snapshot + KHÓA soạn thảo; sheet xác nhận
// hiển thị ĐÚNG bản máy chủ bind (preview.body ?? snapshot), KHÔNG đọc live
// textarea; Gửi phải re-verify trước khi confirm.
//
// Kịch bản N01 tái hiện (browser thật @ e0ee388, FAIL 2/2 client): bấm
// "Xem trước nội dung" → request trì hoãn → textarea VẪN sửa được, author đổi
// thành B → request đi tiếp, server bind bản A → sheet đọc LIVE textarea hiển
// thị B → author bấm xác nhận → recipient nhận A (khác B đã duyệt).
//
// Hợp đồng fix (freeze toàn đội):
//  1) previewSeq token — sau MỖI await, lệch -> ABORT im lặng;
//  2) snapshot (body/recipient/revision) chốt TRƯỚC await preview;
//  3) đang bay: khóa textarea + chọn người nhận + nút preview (rào cản 1);
//  4) sau await: body/recipient/revision đổi -> KHÔNG mở sheet + note trung
//     thực + mở khóa (rào cản 2);
//  5) sheet hiển thị preview.body ?? snapshotBody — TUYỆT ĐỐI không live text;
//  6) Gửi: re-verify trước khi confirmDraftSend — lệch -> lỗi trong sheet,
//     KHÔNG gửi, không đóng sheet ép;
//  7) sync editDraft lỗi trước preview -> dừng, không preview, mở khóa.
//
// Pattern happy-dom giống tests/f04-ai-refine.test.mjs: gắn globals TRƯỚC
// import động; adapter stub tự dựng với DELAY điều khiển được (deferred).
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

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/* ----------------------- Fixture: bản nháp trên máy chủ ----------------------- */

const SERVER_DRAFT = {
  draft_id: "d-n01",
  revision: 2,
  status: "editing",
  pause: null,
  recipient_id: "u-care-1",
  body: "Bản A đã nằm trên máy chủ.",
};

const BODY_A = SERVER_DRAFT.body;
const BODY_B = "Con vừa sửa thành bản B khi preview đang bay.";

const CONNECTIONS = [
  {
    connection_id: "c-1",
    other_party_id: "u-care-1",
    status: "active",
    relationship_kind: "parent",
    counterpart: { display_name: "Bố" },
  },
  {
    connection_id: "c-2",
    other_party_id: "u-care-2",
    status: "active",
    relationship_kind: "backup",
    counterpart: { display_name: "Chú Hùng" },
  },
];

/** Adapter stub với previewDraft/editDraft DELAY điều khiển được. */
function createAdapter(behavior = {}) {
  const calls = {
    editDraft: [],
    preview: [],
    confirmSend: [],
  };
  const deferredPreviews = []; // mỗi lượt previewDraft push 1 deferred
  const deferredEdits = [];

  const adapter = {
    listConnections: async () => ({ results: CONNECTIONS }),
    listDrafts: async () => ({
      results: [{ ...SERVER_DRAFT }],
      serverTime: "2026-10-19T00:00:00Z",
    }),
    aiStatus: async () => ({ ai_enabled: false }),
    createDraft: async (args) => ({
      draft_id: "d-new",
      revision: 1,
      status: "editing",
      server_time: "2026-10-19T00:00:00Z",
      ...args,
    }),
    editDraft: async (id, args) => {
      calls.editDraft.push({ id, ...args });
      if (behavior.editError) throw behavior.editError;
      if (behavior.deferEdit) {
        const d = createDeferred();
        deferredEdits.push(d);
        return d.promise;
      }
      return {
        draft_id: id,
        revision: SERVER_DRAFT.revision + 1,
        status: "editing",
        server_time: "2026-10-19T00:00:00Z",
      };
    },
    previewDraft: async (id) => {
      calls.preview.push(id);
      if (behavior.deferPreview) {
        const d = createDeferred();
        deferredPreviews.push(d);
        return d.promise;
      }
      // Hợp đồng MỚI (A2 backend): response kèm `body` = snapshot máy chủ.
      // behavior.noBody = true -> shape CŨ (không body) — CHỈ dùng cho test
      // N01 invalidate (response thiếu body giờ là drift fail-closed N03);
      // test cần sheet mở PHẢI trả shape hợp đồng đầy đủ.
      const payload = {
        preview_id: "pv-1",
        revision: SERVER_DRAFT.revision,
        recipient_id: SERVER_DRAFT.recipient_id,
        deadline: null,
        server_time: "2026-10-19T00:00:00Z",
      };
      if (!behavior.noBody) payload.body = behavior.previewBody ?? BODY_A;
      return payload;
    },
    confirmDraftSend: async (id, previewId) => {
      calls.confirmSend.push({ id, previewId });
      return { message_id: "m-1", state: "sent" };
    },
    sendMessage: async () => {
      throw new Error("compose KHÔNG được dùng sendMessage");
    },
    lookupOperation: async (key) => ({ status: "sent", key }),
  };
  return { adapter, calls, deferredPreviews, deferredEdits };
}

function makeCtx({ adapter } = {}) {
  initStore({ demoMode: true });
  resetState();
  setRole("student");
  return {
    ctx: {
      store: { getState: () => ({ demoMode: true, role: "student" }) },
      adapter,
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

/** statusNote của trang (p.fb-page__note[role=status] đầu tiên trong page). */
function statusNoteOf(el) {
  return el.querySelector("p.fb-page__note[role='status']");
}

function previewBodyOf(sheet) {
  const node = sheet.querySelector(".fb-compose__preview-body");
  return node ? node.textContent : null;
}

/** Mở sheet chọn người nhận (trước/Trong khi preview) và chọn một người. */
function pickRecipient(el, label) {
  const changePill = Array.from(el.querySelectorAll("button")).find(
    (btn) => textOf(btn).includes("Đổi"),
  );
  assert.ok(changePill, "nút Đổi người nhận phải tồn tại");
  changePill.click();
  const sheet = document.body.querySelector(".fb-sheet-root");
  assert.ok(sheet, "sheet chọn người nhận phải mở");
  const target = findButton(sheet, label);
  assert.ok(target, `phải có lựa chọn "${label}" trong sheet người nhận`);
  target.click();
}

/* ================================ N01 snapshot ================================ */

describe("N01 (US-033): preview chốt snapshot — sheet KHÔNG đọc live textarea", () => {
  it("(1) sửa body trong lúc preview đang bay -> KHÔNG mở sheet từ phiên cũ; nếu có hiển thị thì phải là bản A, không bao giờ là live B", async () => {
    const { adapter, calls, deferredPreviews } = createAdapter({ deferPreview: true });
    const { ctx } = makeCtx({ adapter });
    const { host, el } = mount(ctx);
    await wait(80);

    const textarea = el.querySelector("#fb-compose-body");
    assert.equal(textarea.value, BODY_A, "textarea tải đúng bản A từ máy chủ");

    findButton(el, "Xem trước nội dung").click();
    await wait(40);
    assert.equal(calls.preview.length, 1, "preview đã đi máy chủ");

    // N01 đúng kịch bản browser thật: sửa textarea KHI request đang bay
    // (set value trực tiếp — mô phỏng mọi đường đổi, kể cả vượt qua khóa).
    type(textarea, BODY_B);
    deferredPreviews[0].resolve({
      preview_id: "pv-1",
      revision: SERVER_DRAFT.revision,
      recipient_id: SERVER_DRAFT.recipient_id,
      body: BODY_A, // máy chủ bind bản A
    });
    await wait(60);

    const sheet = document.body.querySelector(".fb-sheet-root");
    if (sheet) {
      // Phòng thủ cuối (hợp đồng mục 5): sheet TỒN TẠI thì cũng phải hiển thị
      // ĐÚNG bản máy chủ bind (A) — không bao giờ là live textarea (B).
      const shown = previewBodyOf(sheet);
      assert.equal(
        shown,
        BODY_A,
        `sheet xác nhận phải hiển thị snapshot bản A của máy chủ — thực tế đang hiển thị live textarea: "${shown}" (N01: sửa khi đang bay làm sheet lệch bản)`,
      );
    }
    // Hợp đồng mục 4 (rào cản 2): body đổi trong lúc bay -> KHÔNG mở sheet,
    // phải có thông báo invalidate trung thực.
    // (assert với actual là Element happy-dom gây treo/OOM — dùng boolean.)
    assert.ok(
      !document.body.querySelector(".fb-sheet-root"),
      "body đã đổi trong lúc lấy bản xem trước -> KHÔNG được mở sheet xác nhận",
    );
    assert.ok(
      textOf(el).includes("đã thay đổi trong khi lấy bản xem trước"),
      "phải có thông báo trung thực yêu cầu xem trước lại",
    );
    assert.equal(textarea.readOnly, false, "phải mở khóa textarea sau invalidate");
    assert.equal(calls.confirmSend.length, 0, "không gửi gì sau invalidate");
    cleanup(host);
  });

  it("(2) body đổi trong lúc bay (response shape CŨ không body) -> không mở sheet + thông báo invalidate + mở khóa", async () => {
    const { adapter, calls, deferredPreviews } = createAdapter({
      deferPreview: true,
      noBody: true, // fallback `preview.body ?? snapshotBody` phải dùng snapshot
    });
    const { ctx } = makeCtx({ adapter });
    const { host, el } = mount(ctx);
    await wait(80);

    const textarea = el.querySelector("#fb-compose-body");
    findButton(el, "Xem trước nội dung").click();
    await wait(40);
    type(textarea, BODY_B);
    deferredPreviews[0].resolve({
      preview_id: "pv-1",
      revision: SERVER_DRAFT.revision,
      recipient_id: SERVER_DRAFT.recipient_id,
    });
    await wait(60);

    assert.ok(
      !document.body.querySelector(".fb-sheet-root"),
      "sheet KHÔNG được mở khi body đã đổi trong lúc bay",
    );
    const note = statusNoteOf(el);
    assert.ok(
      note && textOf(note).includes("đã thay đổi trong khi lấy bản xem trước"),
      `status note phải nói trung thực về invalidate — thực tế: "${note ? textOf(note) : "không có note"}"`,
    );
    assert.equal(textarea.readOnly, false, "khóa phải được mở lại sau invalidate");
    const previewBtn = findButton(el, "Xem trước nội dung");
    assert.equal(previewBtn.disabled, false, "nút preview phải mở lại để xem trước lần nữa");
    assert.equal(calls.confirmSend.length, 0);
    cleanup(host);
  });

  it("(3) người nhận đổi trong lúc bay (đường khác qua sheet đang mở) -> không mở sheet + invalidate + mở khóa", async () => {
    const { adapter, calls, deferredPreviews } = createAdapter({ deferPreview: true });
    const { ctx } = makeCtx({ adapter });
    const { host, el } = mount(ctx);
    await wait(80);

    const textarea = el.querySelector("#fb-compose-body");
    // Mở SẴN sheet chọn người nhận TRƯỚC khi preview — đây là "đường đổi khác"
    // mà rào cản 2 phải chặn (không phụ thuộc khóa nút Đổi khi đang bay).
    pickRecipient(el, "Bố"); // chốt recipient hiện tại (u-care-1, không đổi)

    findButton(el, "Xem trước nội dung").click();
    await wait(40);
    assert.equal(calls.preview.length, 1);

    // Đổi người nhận KHI preview đang bay (sheet chọn người vẫn mở).
    pickRecipient(el, "Chú Hùng");
    deferredPreviews[0].resolve({
      preview_id: "pv-1",
      revision: SERVER_DRAFT.revision,
      recipient_id: SERVER_DRAFT.recipient_id,
      body: BODY_A,
    });
    await wait(60);

    assert.ok(
      !document.body.querySelector(".fb-sheet-root"),
      "người nhận đã đổi trong lúc bay -> KHÔNG được mở sheet xác nhận",
    );
    assert.ok(
      textOf(el).includes("đã thay đổi trong khi lấy bản xem trước"),
      "thông báo invalidate trung thực",
    );
    assert.equal(textarea.readOnly, false, "mở khóa sau invalidate");
    assert.equal(calls.confirmSend.length, 0);
    cleanup(host);
  });

  it("(4) Gửi phải re-verify: sửa body SAU khi sheet mở -> bấm Gửi KHÔNG gọi confirm, hiện lỗi trong sheet", async () => {
    const { adapter, calls } = createAdapter(); // preview trả ngay, có body A
    const { ctx } = makeCtx({ adapter });
    const { host, el } = mount(ctx);
    await wait(80);

    findButton(el, "Xem trước nội dung").click();
    await wait(60);
    const sheet = document.body.querySelector(".fb-sheet-root");
    assert.ok(sheet, "luồng bình thường -> sheet mở");

    // Sửa textarea SAU khi sheet đã mở (khóa đã nhả sau khi preview xong).
    type(el.querySelector("#fb-compose-body"), "Con sửa sau khi sheet mở.");
    findButton(sheet, "Gửi cho").click();
    await wait(60);

    assert.equal(
      calls.confirmSend.length,
      0,
      "N01 mục 6: nội dung lệch bản hiển thị -> KHÔNG được gọi confirmDraftSend",
    );
    assert.ok(sheet.isConnected, "không được đóng sheet ép khi re-verify lệch");
    assert.ok(
      textOf(sheet).includes("đã thay đổi sau khi xem trước"),
      "lỗi trung thực phải hiển thị TRONG sheet nơi người dùng đang nhìn",
    );
    cleanup(host);
  });

  it("(5) luồng bình thường không đổi gì -> sheet hiển thị đúng bản A, Gửi gọi confirm với preview_id đúng", async () => {
    const { adapter, calls } = createAdapter({
      previewBody: BODY_A, // hợp đồng MỚI: máy chủ trả body = snapshot
    });
    const { ctx } = makeCtx({ adapter });
    const { host, el } = mount(ctx);
    await wait(80);

    findButton(el, "Xem trước nội dung").click();
    await wait(60);
    const sheet = document.body.querySelector(".fb-sheet-root");
    assert.ok(sheet, "luồng lành phải mở sheet xác nhận");
    assert.equal(
      previewBodyOf(sheet),
      BODY_A,
      "sheet hiển thị đúng bản máy chủ chốt (preview.body)",
    );

    findButton(sheet, "Gửi cho").click();
    await wait(60);
    assert.equal(calls.confirmSend.length, 1, "Gửi gọi confirm đúng 1 lần");
    assert.deepEqual(
      calls.confirmSend[0],
      { id: SERVER_DRAFT.draft_id, previewId: "pv-1" },
      "confirm mang đúng draft_id + preview_id",
    );
    cleanup(host);
  });

  it("(6) previewSeq: bấm 2 lần liên tiếp khi đang bay -> chỉ 1 request (phiên duy nhất = phiên cuối); xong vẫn xem trước lại được", async () => {
    const { adapter, calls, deferredPreviews } = createAdapter({
      deferPreview: true,
      // N03 contract: preview.body là field bắt buộc (A1 pin 6 field) —
      // response thiếu body giờ là DRIFT fail-closed, không còn fallback mở
      // sheet; test này kiểm previewSeq/lock nên dùng shape hợp đồng đầy đủ.
    });
    const { ctx } = makeCtx({ adapter });
    const { host, el } = mount(ctx);
    await wait(80);

    findButton(el, "Xem trước nội dung").click();
    await wait(40);
    // Bấm lần 2 khi phiên 1 đang bay: bị khóa (rào cản 1) -> KHÔNG tạo request
    // thứ hai; phiên cũ không thể bị "ghi đè" vì không có phiên chồng.
    findButton(el, "Xem trước nội dung").click();
    await wait(40);
    assert.equal(
      calls.preview.length,
      1,
      "đang bay phải khóa nút preview — không tạo request chồng (chỉ phiên cuối/duy nhất được chạy)",
    );

    deferredPreviews[0].resolve({
      preview_id: "pv-1",
      revision: SERVER_DRAFT.revision,
      recipient_id: SERVER_DRAFT.recipient_id,
      body: BODY_A, // N03: response thiếu body giờ là drift fail-closed
    });
    await wait(60);
    const sheets = document.body.querySelectorAll(".fb-sheet-root");
    assert.equal(sheets.length, 1, "đúng MỘT sheet của phiên duy nhất");
    assert.equal(previewBodyOf(sheets[0]), BODY_A, "sheet hiển thị bản máy chủ bind (preview.body)");
    assert.equal(calls.confirmSend.length, 0, "chưa gửi gì");

    // Đóng sheet ("Giữ lại làm nháp") -> khóa nhả -> xem trước lại được.
    findButton(sheets[0], "Giữ lại làm nháp").click();
    await wait(40);
    assert.ok(
      !document.body.querySelector(".fb-sheet-root"),
      "sheet đóng sạch",
    );
    assert.equal(
      findButton(el, "Xem trước nội dung").disabled,
      false,
      "không được khóa kẹt — vẫn xem trước lại được",
    );
    findButton(el, "Xem trước nội dung").click();
    await wait(40);
    assert.equal(calls.preview.length, 2, "phiên mới chạy bình thường sau khi phiên cũ xong");
    assert.equal(deferredPreviews.length, 2);
    deferredPreviews[1].resolve({
      preview_id: "pv-2",
      revision: SERVER_DRAFT.revision,
      recipient_id: SERVER_DRAFT.recipient_id,
      body: BODY_A, // N03: response thiếu body giờ là drift fail-closed
    });
    await wait(60);
    assert.equal(document.body.querySelectorAll(".fb-sheet-root").length, 1, "phiên mới mở đúng 1 sheet");
    cleanup(host);
  });

  it("(7) sync editDraft lỗi TRƯỚC preview -> không gọi previewDraft, mở khóa, thông báo trung thực", async () => {
    const { adapter, calls, deferredEdits } = createAdapter({
      deferEdit: true,
      noBody: true,
    });
    const { ctx } = makeCtx({ adapter });
    const { host, el } = mount(ctx);
    await wait(80);

    const textarea = el.querySelector("#fb-compose-body");
    type(textarea, "Con sửa nội dung trước khi xem trước."); // lệch synced -> cần sync

    findButton(el, "Xem trước nội dung").click();
    await wait(40);
    assert.equal(calls.editDraft.length, 1, "phải sync editDraft trước preview");
    assert.equal(textarea.readOnly, true, "đang bay -> textarea phải bị khóa (rào cản 1)");

    deferredEdits[0].reject(new Error("network down"));
    await wait(60);

    assert.equal(
      calls.preview.length,
      0,
      "sync lỗi -> KHÔNG được gọi previewDraft (dừng flow)",
    );
    assert.equal(textarea.readOnly, false, "lỗi -> mở khóa textarea");
    assert.equal(
      findButton(el, "Xem trước nội dung").disabled,
      false,
      "lỗi -> mở khóa nút preview",
    );
    const note = statusNoteOf(el);
    assert.ok(
      note && textOf(note).includes("đồng bộ"),
      `thông báo phải trung thực về việc đồng bộ lỗi — thực tế: "${note ? textOf(note) : "không có note"}"`,
    );
    cleanup(host);
  });
});
