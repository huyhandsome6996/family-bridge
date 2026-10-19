// tests/f04-preview-snapshot.test.mjs — N01 (QA F04 19/10, P1): preview đang
// bay + sheet xác nhận phải bám BẢN MÁY CHỦ BIND, không bao giờ đọc live
// textarea. 7 case tương đương mini (hai client đồng nhất) + 1 case bonus ở
// bước re-verify của sheet:
//   1. preview đang bay sửa body  -> server-truth thắng (không sheet lệch bản)
//   2. body đổi khi bay           -> không mở sheet + invalidate + mở khóa
//   3. recipient đổi khi bay      -> invalidate
//   4. Gửi trong sheet khi body đổi sau khi sheet mở -> không gọi confirmSend
//   5. luồng bình thường          -> sheet hiện bản máy chủ, confirm đúng preview_id
//   6. double-click preview       -> chỉ 1 request + 1 sheet (không sheet chồng)
//   7. sync editDraft lỗi         -> không gọi previewDraft + mở khóa
//   +bonus: recipient đổi sau khi sheet mở -> re-verify chặn, không gửi
//
// Adapter giả có DELAY điều khiển được (deferPreview/deferEdit) — cùng kiểu
// fake adapter có kiểm soát resolve như f04-ai-parity.test.mjs.
//
// Chạy: node --test tests/f04-preview-snapshot.test.mjs
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
const { ApiError } = await import("../../packages/family_bridge_shared/src/api/client.mjs");

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

/** Tìm sheet theo tiêu đề — phân biệt sheet người nhận vs sheet xác nhận. */
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
    token: "test-token-n01",
    userId: "u-student-1",
    expiresAt: Date.now() + 60 * 60 * 1000,
    displayName: "Học sinh Test",
  });
}

const SERVER_BODY = "Bản A đã lưu";
const EDITED_DRAFT = {
  draft_id: "d-1", revision: 1, status: "editing", pause: null,
  recipient_id: "u-care-1", body: SERVER_BODY, server_time: "2026-10-16T00:00:00Z",
};

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

/** Adapter giả: trạng thái máy chủ riêng (server.body/revision/recipientId)
 * + DELAY điều khiển được cho preview/edit (deferred promise). */
function n01Adapter({ behavior = {} } = {}) {
  const server = {
    body: SERVER_BODY,
    revision: 1,
    recipientId: "u-care-1",
  };
  behavior.deferredPreview = behavior.deferredPreview || [];
  behavior.deferredEdit = behavior.deferredEdit || [];
  return {
    mode: "web",
    listConnections: async () => ({
      results: behavior.connections || TWO_CONNECTIONS,
      nextCursor: null,
    }),
    listDrafts: async () => ({
      results: [JSON.parse(JSON.stringify(EDITED_DRAFT))],
      serverTime: "2026-10-16T00:00:00Z",
    }),
    createDraft: async () => { throw new Error("không dùng trong test N01"); },
    editDraft: async (id, { body }) => {
      behavior.editDraftBodies = behavior.editDraftBodies || [];
      behavior.editDraftBodies.push(body);
      if (behavior.deferEdit) {
        await new Promise((res) => behavior.deferredEdit.push(res));
      }
      if (behavior.editError) throw behavior.editError;
      server.revision += 1;
      server.body = body;
      return {
        draft_id: id, revision: server.revision, status: "editing",
        pause: null, server_time: "2026-10-16T00:00:00Z", body,
      };
    },
    previewDraft: async (id) => {
      behavior.previewCalls = (behavior.previewCalls || 0) + 1;
      if (behavior.deferPreview) {
        await new Promise((res) => behavior.deferredPreview.push(res));
      }
      if (behavior.previewError) throw behavior.previewError;
      return {
        preview_id: `pv-${behavior.previewCalls}`,
        draft_id: id,
        revision: server.revision,
        recipient_id: server.recipientId,
        deadline: "2026-10-16T00:05:00Z",
        server_time: "2026-10-16T00:00:00Z",
        // Hợp đồng mới: response preview kèm `body` = bản máy chủ BIND.
        body: behavior.previewBody !== undefined ? behavior.previewBody : server.body,
      };
    },
    confirmDraftSend: async (id, previewId) => {
      behavior.confirmArgs = behavior.confirmArgs || [];
      behavior.confirmArgs.push([id, previewId]);
      if (behavior.confirmError) throw behavior.confirmError;
      return { draft_id: id, preview_id: previewId, status: "sent" };
    },
    pauseDraft: async () => ({ status: "paused", pause: { remaining_seconds: 300, can_preview: false } }),
    cancelDraftPause: async () => ({ status: "editing", pause: null }),
    aiStatus: async () => ({ ai_enabled: true }),
    listConsents: async () => ([
      { purpose: "ai_processing", decision: "accepted", policy_version: "ai-v1", withdrawn: false, current: true },
    ]),
    recordConsent: async (args) => ({ consent_id: "c-1", ...args }),
    aiRefine: async () => { throw new Error("không dùng trong test N01"); },
    aiAccept: async (id) => ({ suggestion_id: id, status: "accepted" }),
    aiDiscard: async (id) => ({ suggestion_id: id, status: "discarded" }),
  };
}

async function setupCompose(behavior) {
  withSession();
  const adapter = n01Adapter({ behavior });
  const { ctx } = makeCtx({ adapter });
  const { host, el } = mount(compose, ctx);
  await wait(60); // đợi listConnections/listDrafts + aiStatus resolve
  const textarea = el.querySelector("#fb-compose-body");
  const previewBtn = el.querySelector(".fb-btn-hero");
  const changeBtn = el.querySelector(".fb-compose__change-btn");
  return { host, el, behavior, textarea, previewBtn, changeBtn };
}

function typeText(textarea, text) {
  textarea.value = text;
  textarea.dispatchEvent(new domWindow.Event("input", { bubbles: true }));
}

describe("F04 web — N01 preview snapshot (server-truth, không đọc live textarea)", () => {
  it("case 1 — preview đang bay sửa body: sheet KHÔNG được hiện bản live khác bản máy chủ bind; nếu hiển thị lệch thì KHÔNG được gửi", async () => {
    const { host, el, behavior, textarea, previewBtn } = await setupCompose({ deferPreview: true });

    previewBtn.click(); // preview đang bay
    await wait(30);
    typeText(textarea, "Bản B sửa khi preview đang bay"); // user sửa khi bay
    behavior.deferredPreview[0](); // preview của bản A về
    await wait(40);

    const confirmSheet = findSheetByTitle("Xem trước nội dung");
    const sheetBody = confirmSheet && confirmSheet.querySelector(".fb-compose__preview-body");
    assert.ok(
      !confirmSheet || textOf(sheetBody) === SERVER_BODY,
      `server-truth: sheet phải hiển thị bản máy chủ bind (${SERVER_BODY}) hoặc không mở; `
        + `thấy: ${confirmSheet ? textOf(sheetBody) : "(không mở sheet)"}`,
    );
    if (confirmSheet) {
      // Bản hiển thị lệch server -> bấm Gửi cũng không được trao gửi nhầm.
      findButton(confirmSheet, "Gửi cho Người chăm sóc Một").click();
      await wait(40);
      assert.equal((behavior.confirmArgs || []).length, 0,
        "sheet hiển thị lệch bản bind -> KHÔNG được gọi confirmDraftSend");
    }
    unmount(host);
  });

  it("case 2 — body đổi khi bay: KHÔNG mở sheet + thông báo invalidate + mở khóa (trước đó khóa kèm giải thích trung thực)", async () => {
    const { host, el, behavior, textarea, previewBtn, changeBtn } = await setupCompose({ deferPreview: true });

    previewBtn.click();
    await wait(30);
    // Trong lúc bay: khóa đúng spec (textarea + control người nhận + nút
    // preview) kèm giải thích trung thực.
    assert.equal(textarea.disabled, true, "preview đang bay -> textarea bị khóa");
    assert.equal(previewBtn.disabled, true, "preview đang bay -> nút preview bị khóa");
    assert.equal(changeBtn.disabled, true, "preview đang bay -> control người nhận bị khóa");
    assert.ok(textOf(el).includes("Đang lấy bản xem trước từ máy chủ…"),
      "giải thích trung thực trong lúc khóa");

    typeText(textarea, "Bản B đổi khi bay");
    behavior.deferredPreview[0]();
    await wait(40);

    assert.equal(findSheetByTitle("Xem trước nội dung"), null,
      "body đổi khi bay -> KHÔNG mở sheet xác nhận");
    assert.ok(textOf(el).includes("đã thay đổi trong khi lấy bản xem trước"),
      "thông báo invalidate trung thực cho user");
    assert.equal(textarea.disabled, false, "invalidate -> mở khóa textarea");
    assert.equal(previewBtn.disabled, false, "invalidate -> mở khóa nút preview");
    assert.equal(changeBtn.disabled, false, "invalidate -> mở khóa control người nhận");
    unmount(host);
  });

  it("case 2b (bonus re-check revision) — Lưu nháp giữa chừng preview bay (revision đổi) -> invalidate, không mở sheet", async () => {
    const { host, el, behavior, textarea, previewBtn } = await setupCompose({ deferPreview: true });

    previewBtn.click();
    await wait(30);
    assert.equal(textarea.disabled, true, "preview đang bay -> textarea khóa");
    // "Lưu nháp" KHÔNG thuộc danh sách khóa (spec item 3) — nếu nó bump
    // revision trong lúc bay thì re-check sau await phải chặn sheet.
    findButton(el, "Lưu nháp riêng").click();
    await wait(30);
    assert.deepEqual(behavior.editDraftBodies, [SERVER_BODY],
      "save giữa chừng đã editDraft (revision máy chủ đổi)");
    behavior.deferredPreview[0]();
    await wait(40);

    assert.equal(findSheetByTitle("Xem trước nội dung"), null,
      "revision đổi khi bay -> KHÔNG mở sheet xác nhận");
    assert.ok(textOf(el).includes("đã thay đổi trong khi lấy bản xem trước"),
      "thông báo invalidate trung thực");
    assert.equal(textarea.disabled, false, "invalidate -> mở khóa textarea");
    unmount(host);
  });

  it("case 3 — recipient đổi khi bay: invalidate (không mở sheet)", async () => {
    const { host, el, behavior, textarea, previewBtn, changeBtn } = await setupCompose({ deferPreview: true });

    // Mở sẵn sheet chọn người nhận rồi bấm preview — sheet người nhận còn mở
    // khi preview đang bay, mô phỏng user đổi người nhận giữa chừng.
    changeBtn.click();
    await wait(30);
    assert.ok(findSheetByTitle("Chọn người nhận"), "sheet người nhận mở trước khi preview");
    previewBtn.click();
    await wait(30);
    assert.equal(changeBtn.disabled, true, "khi bay control người nhận bị khóa");
    // Đổi người nhận GIỮA CHỪNG preview đang bay (option trong sheet còn mở).
    const recipientSheet = findSheetByTitle("Chọn người nhận");
    findButton(recipientSheet, "Người chăm sóc Hai").click(); // state.recipientId -> u-care-2
    await wait(20);

    behavior.deferredPreview[0]();
    await wait(40);

    assert.equal(findSheetByTitle("Xem trước nội dung"), null,
      "recipient đổi khi bay -> KHÔNG mở sheet xác nhận");
    assert.ok(textOf(el).includes("đã thay đổi trong khi lấy bản xem trước"),
      "thông báo invalidate trung thực");
    assert.equal(textarea.disabled, false, "invalidate -> mở khóa textarea");
    unmount(host);
  });

  it("case 4 — Gửi trong sheet khi body đổi SAU KHI sheet mở: KHÔNG gọi confirmSend, lỗi trung thực trong sheet", async () => {
    const { host, el, behavior, textarea, previewBtn } = await setupCompose({});

    previewBtn.click();
    await wait(40);
    const confirmSheet = findSheetByTitle("Xem trước nội dung");
    assert.ok(confirmSheet, "luồng bình thường -> sheet xác nhận mở");

    typeText(textarea, "Bản B sửa sau khi sheet mở");
    findButton(confirmSheet, "Gửi cho Người chăm sóc Một").click();
    await wait(40);

    assert.equal((behavior.confirmArgs || []).length, 0,
      "body đã đổi sau khi xem trước -> KHÔNG gọi confirmDraftSend");
    assert.ok(
      textOf(confirmSheet).includes("Nội dung đã thay đổi sau khi xem trước"),
      "lỗi trung thực phải nằm TRONG sheet nơi user đang nhìn",
    );
    unmount(host);
  });

  it("case 4b (bonus re-verify) — recipient đổi SAU KHI sheet mở: KHÔNG gọi confirmSend, lỗi trong sheet", async () => {
    const { host, el, behavior, previewBtn, changeBtn } = await setupCompose({});

    previewBtn.click();
    await wait(40);
    const confirmSheet = findSheetByTitle("Xem trước nội dung");
    assert.ok(confirmSheet, "sheet xác nhận mở");

    // Đổi người nhận khi sheet đang mở (control người nhận KHÔNG bị khóa sau
    // khi preview xong — re-verify tại thời điểm bấm Gửi là lưới chốt).
    changeBtn.click();
    await wait(30);
    const recipientSheet = findSheetByTitle("Chọn người nhận");
    assert.ok(recipientSheet, "sheet chọn người nhận mở được khi sheet xác nhận đang mở");
    findButton(recipientSheet, "Người chăm sóc Hai").click();
    await wait(20);

    findButton(confirmSheet, "Gửi cho Người chăm sóc Một").click();
    await wait(40);

    assert.equal((behavior.confirmArgs || []).length, 0,
      "recipient đã đổi sau khi xem trước -> KHÔNG gọi confirmDraftSend");
    assert.ok(
      textOf(confirmSheet).includes("Người nhận đã thay đổi sau khi xem trước"),
      "lỗi trung thực về người nhận phải nằm trong sheet",
    );
    unmount(host);
  });

  it("case 5 — luồng bình thường: sheet hiện đúng bản máy chủ, confirm gọi với preview_id đúng, receipt sent", async () => {
    const { host, el, behavior, previewBtn } = await setupCompose({});

    previewBtn.click();
    await wait(40);
    const confirmSheet = findSheetByTitle("Xem trước nội dung");
    assert.ok(confirmSheet, "preview -> sheet xác nhận mở");
    const previewBody = confirmSheet.querySelector(".fb-compose__preview-body");
    assert.equal(textOf(previewBody), SERVER_BODY,
      "sheet hiển thị bản máy chủ bind (preview.body ?? snapshotBody)");
    assert.ok(findButton(confirmSheet, "Giữ lại làm nháp"), "vẫn còn đường giữ lại làm nháp");

    findButton(confirmSheet, "Gửi cho Người chăm sóc Một").click();
    await wait(40);
    assert.deepEqual(behavior.confirmArgs, [["d-1", "pv-1"]],
      "confirm gọi đúng (draftId, preview_id) của bản đã xem trước");
    assert.ok(el.querySelector(".fb-compose__receipt--sent"),
      "sent chỉ báo khi máy chủ xác nhận");
    unmount(host);
  });

  it("case 6 — double-click preview: chỉ 1 request bind + MỘT sheet xác nhận (không sheet chồng)", async () => {
    const { host, el, behavior, previewBtn } = await setupCompose({ deferPreview: true });

    previewBtn.click();
    previewBtn.click(); // double-click cùng tick
    await wait(20);
    assert.equal(behavior.previewCalls, 1,
      "double-click không tạo request preview/bind trùng");

    behavior.deferredPreview[0]();
    await wait(40);
    const sheets = Array.from(document.body.querySelectorAll(".fb-sheet")).filter(
      (sheetEl) => textOf(sheetEl.querySelector(".fb-sheet__title")) === "Xem trước nội dung",
    );
    assert.equal(sheets.length, 1, "chỉ MỘT sheet xác nhận mở");
    assert.equal(textOf(sheets[0].querySelector(".fb-compose__preview-body")), SERVER_BODY,
      "sheet của phiên hợp lệ hiển thị bản máy chủ bind");
    unmount(host);
  });

  it("case 7 — sync editDraft lỗi: KHÔNG gọi previewDraft + mở khóa + thông báo trung thực", async () => {
    const { host, el, behavior, textarea, previewBtn } = await setupCompose({
      editError: new ApiError("Kết nối quá thời gian chờ.", 0, "timeout"),
    });

    typeText(textarea, "Bản B chưa lưu");
    previewBtn.click();
    await wait(40);

    assert.deepEqual(behavior.editDraftBodies, ["Bản B chưa lưu"],
      "đã thử đồng bộ đúng bản mới trước khi preview");
    assert.equal(behavior.previewCalls, undefined,
      "sync lỗi -> dừng flow, KHÔNG gọi previewDraft");
    assert.equal(textarea.disabled, false, "lỗi -> mở khóa textarea");
    assert.ok(textOf(el).includes("Kết nối quá thời gian chờ"),
      "thông báo lỗi trung thực");
    assert.equal(findSheetByTitle("Xem trước nội dung"), null,
      "sync lỗi -> không mở sheet");
    unmount(host);
  });
});
