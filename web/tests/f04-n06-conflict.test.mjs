// tests/f04-n06-conflict.test.mjs — N06 (QA F04 vòng 2, P2): mọi editDraft
// trên trang soạn phải gửi expectedRevision = revision máy chủ đã biết cuối
// (stale client không được ghi đè im lặng), và khi máy chủ trả 409
// revision_conflict {reason:"draft_conflict", current_revision:N} thì client
// phải: GIỮ text user đang gõ, GET bản server, hiện khối conflict với 2 lựa
// chọn rõ ràng (Cập nhật theo bản trên máy chủ / Ghi đè bằng bản của tôi) —
// KHÔNG auto-retry, KHÔNG auto-merge, KHÔNG mất text user.
//
// Kèm assertion CSS mức source cho N05 (nút "Đổi" >= 44x44) và large-text
// 200% reflow (stress probe — KHÔNG phải device cert; đo bounding thật bằng
// browser ở 390px là việc của A5).
//
// Chạy: node --test tests/f04-n06-conflict.test.mjs
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
const { readFileSync } = await import("node:fs");
const { fileURLToPath } = await import("node:url");
const path = (await import("node:path")).default;

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
    token: "test-token-n06",
    userId: "u-student-1",
    expiresAt: Date.now() + 60 * 60 * 1000,
    displayName: "Học sinh Test",
  });
}

const CONNECTIONS = [
  {
    connection_id: "c-1", status: "active", relationship_kind: "primary",
    generation: 1, other_party_id: "u-care-1",
    counterpart: { display_name: "Người chăm sóc Một", identity_basis: "self_declared" },
  },
];

const SERVER_BODY_NOW = "Bản máy chủ revision 3";

/**
 * Adapter giả N06:
 * - listDrafts trả view STALE (revision 1) — mô phỏng trang tải bản nháp
 *   trước khi client khác (Mini) sửa; getDraft trả bản HIỆN HÀNH (revision 3).
 * - editDraft: nếu còn lượt conflict (conflictOnlyFirst) -> ném ApiError
 *   revision_conflict {reason:"draft_conflict", current_revision: 3};
 *   không thì bump revision + ghi body. Ghi lại MỌI call args để assert
 *   expectedRevision.
 */
function n06Adapter({ behavior = {} } = {}) {
  const server = {
    body: SERVER_BODY_NOW,
    revision: behavior.serverRevision ?? 3,
    recipientId: "u-care-1",
  };
  behavior.editArgs = behavior.editArgs || [];
  behavior.getDraftCalls = 0;
  behavior.previewCalls = 0;
  behavior.confirmArgs = [];
  let conflictLeft = behavior.conflictOnlyFirst ?? 0;

  const draftView = (revision) => ({
    draft_id: "d-1",
    revision: revision ?? server.revision,
    status: "editing",
    pause: null,
    recipient_id: server.recipientId,
    body: server.body,
    server_time: "2026-10-19T00:00:00Z",
  });

  return {
    mode: "web",
    listConnections: async () => ({ results: CONNECTIONS, nextCursor: null }),
    listDrafts: async () => ({
      // Trang tải list TRƯỚC khi Mini sửa -> revision cũ (stale client).
      results: [draftView(behavior.staleRevision ?? 1)],
      serverTime: "2026-10-19T00:00:00Z",
    }),
    getDraft: async () => {
      behavior.getDraftCalls += 1;
      return draftView();
    },
    createDraft: async () => { throw new Error("không dùng trong test N06"); },
    editDraft: async (id, payload = {}) => {
      behavior.editArgs.push({ id, ...payload });
      if (conflictLeft > 0) {
        conflictLeft -= 1;
        throw new ApiErrorLike();
      }
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
    aiRefine: async () => { throw new Error("không dùng trong test N06"); },
    aiAccept: async (id) => ({ suggestion_id: id, status: "accepted" }),
    aiDiscard: async (id) => ({ suggestion_id: id, status: "discarded" }),
  };

  function ApiErrorLike() {
    const error = new Error("Bản nháp đã được sửa ở nơi khác (409).");
    error.name = "ApiError";
    error.status = 409;
    error.kind = "conflict";
    error.code = "revision_conflict";
    error.details = { reason: "draft_conflict", current_revision: server.revision };
    return error;
  }
}

async function setupCompose(behavior = {}) {
  withSession();
  const adapter = n06Adapter({ behavior });
  const { ctx } = makeCtx({ adapter });
  const { host, el } = mount(compose, ctx);
  await wait(60);
  const textarea = el.querySelector("#fb-compose-body");
  const previewBtn = el.querySelector(".fb-btn-hero");
  return { host, el, behavior, textarea, previewBtn };
}

function typeText(textarea, text) {
  textarea.value = text;
  textarea.dispatchEvent(new domWindow.Event("input", { bubbles: true }));
}

describe("F04 web — N06: expectedRevision trên mọi editDraft + panel conflict 2 lựa chọn", () => {
  it("case C1 — Lưu nháp trên draft có sẵn: editDraft nhận expectedRevision = revision server-known cuối (1)", async () => {
    const { host, el, behavior, textarea } = await setupCompose();

    typeText(textarea, "Bản của tôi chưa lưu");
    findButton(el, "Lưu nháp riêng").click();
    await wait(40);

    assert.equal(behavior.editArgs.length, 1, "đã gọi editDraft đúng 1 lần");
    assert.equal(behavior.editArgs[0].expectedRevision, 1,
      "save manual phải gửi expectedRevision = state.revision (server-known cuối)");
    assert.equal(behavior.editArgs[0].body, "Bản của tôi chưa lưu");
    unmount(host);
  });

  it("case C2 — auto-sync trong onPreview trước preview: editDraft nhận expectedRevision = state.revision; thành công thì preview chạy tiếp", async () => {
    const { host, el, behavior, textarea, previewBtn } = await setupCompose();

    typeText(textarea, "Bản của tôi chưa lưu");
    previewBtn.click();
    await wait(40);

    assert.equal(behavior.editArgs.length, 1, "auto-sync đã editDraft trước preview");
    assert.equal(behavior.editArgs[0].expectedRevision, 1,
      "auto-sync phải gửi expectedRevision = state.revision");
    assert.equal(behavior.previewCalls, 1, "sync xong -> preview chạy tiếp");
    assert.ok(findSheetByTitle("Xem trước nội dung"), "sheet mở bình thường");
    unmount(host);
  });

  it("case D1 — save dính revision_conflict: GIỮ text user, GET bản server, panel 2 nút xuất hiện, KHÔNG auto-retry", async () => {
    const { host, el, behavior, textarea } = await setupCompose({ conflictOnlyFirst: 1 });

    typeText(textarea, "Bản của tôi chưa lưu");
    findButton(el, "Lưu nháp riêng").click();
    await wait(60);

    assert.equal(behavior.editArgs.length, 1,
      "KHÔNG auto-retry: chỉ đúng 1 lần gọi editDraft");
    assert.ok(behavior.getDraftCalls >= 1, "đã GET bản server để đối chiếu");
    assert.equal(textarea.value, "Bản của tôi chưa lưu",
      "text user đang gõ phải được GIỮ NGUYÊN trong textarea");
    const panel = el.querySelector(".fb-compose__conflict");
    assert.ok(panel, "khối conflict hiện ra trên trang");
    assert.ok(findButton(panel, "Cập nhật theo bản trên máy chủ"),
      "có nút adopt: Cập nhật theo bản trên máy chủ");
    assert.ok(findButton(panel, "Ghi đè bằng bản của tôi"),
      "có nút deliberate: Ghi đè bằng bản của tôi");
    assert.ok(
      textOf(el).includes("đã được sửa ở nơi khác") || textOf(el).includes("thay đổi ở nơi khác"),
      "statusNote/panel giải thích trung thực",
    );
    unmount(host);
  });

  it("case D2 — chọn 'Cập nhật theo bản trên máy chủ': textarea <- server body, revision theo server, panel tắt; save kế tiếp gửi expectedRevision mới", async () => {
    const { host, el, behavior, textarea } = await setupCompose({ conflictOnlyFirst: 1 });

    typeText(textarea, "Bản của tôi chưa lưu");
    findButton(el, "Lưu nháp riêng").click();
    await wait(60);

    const panel = el.querySelector(".fb-compose__conflict");
    findButton(panel, "Cập nhật theo bản trên máy chủ").click();
    await wait(40);

    // (harness fix, không đổi contract: assert.equal(node, null) với node là
    // happy-dom Element làm Node 24 OOM khi dựng AssertionError — actual là
    // Element; assert.ok(x === null) cùng điều kiện fail, actual boolean.)
    assert.ok(el.querySelector(".fb-compose__conflict") === null,
      "adopt xong -> panel conflict tắt");
    assert.equal(textarea.value, SERVER_BODY_NOW,
      "adopt: textarea nhận đúng bản máy chủ hiện hành");
    // state.revision phải theo server (3) — kiểm chứng bằng save kế tiếp.
    findButton(el, "Lưu nháp riêng").click();
    await wait(40);
    assert.equal(behavior.editArgs.length, 2);
    assert.equal(behavior.editArgs[1].expectedRevision, 3,
      "sau adopt, save kế tiếp phải dùng revision mới lấy từ máy chủ (3)");
    unmount(host);
  });

  it("case D3 — chọn 'Ghi đè bằng bản của tôi': gọi lại editDraft với expectedRevision = current_revision của máy chủ, text user giữ nguyên, không auto-preview", async () => {
    const { host, el, behavior, textarea, previewBtn } = await setupCompose({ conflictOnlyFirst: 1 });

    typeText(textarea, "Bản của tôi chưa lưu");
    findButton(el, "Lưu nháp riêng").click();
    await wait(60);
    assert.equal(behavior.editArgs.length, 1, "conflict -> không tự retry");

    const panel = el.querySelector(".fb-compose__conflict");
    findButton(panel, "Ghi đè bằng bản của tôi").click();
    await wait(40);

    assert.equal(behavior.editArgs.length, 2,
      "deliberate là LỆNH CỦA USER: gọi lại editDraft đúng 1 lần nữa");
    assert.equal(behavior.editArgs[1].expectedRevision, 3,
      "ghi đè có chủ đích dùng expectedRevision = current_revision máy chủ (3)");
    assert.equal(behavior.editArgs[1].body, "Bản của tôi chưa lưu",
      "ghi đè gửi đúng text user đang giữ");
    // (harness fix OOM: xem case D2)
    assert.ok(el.querySelector(".fb-compose__conflict") === null,
      "ghi đè thành công -> panel tắt");
    assert.equal(textarea.value, "Bản của tôi chưa lưu",
      "text user vẫn nguyên sau khi ghi đè");
    assert.equal(behavior.previewCalls, 0,
      "KHÔNG tự động chạy preview lại (không auto-retry flow)");
    unmount(host);
  });

  it("case D4 — auto-sync trong onPreview dính conflict: KHÔNG gọi previewDraft, mở khóa, giữ text, panel 2 nút hiện ra", async () => {
    const { host, el, behavior, textarea, previewBtn } = await setupCompose({ conflictOnlyFirst: 1 });

    typeText(textarea, "Bản của tôi chưa lưu");
    previewBtn.click();
    await wait(60);

    assert.equal(behavior.previewCalls, 0,
      "sync conflict -> dừng flow, KHÔNG gọi previewDraft");
    // (harness fix OOM: xem case D2)
    assert.ok(findSheetByTitle("Xem trước nội dung") === null,
      "không mở sheet xác nhận khi sync chưa xong");
    assert.equal(textarea.disabled, false, "preview lock được mở lại cho user xử lý");
    assert.equal(textarea.value, "Bản của tôi chưa lưu", "text user được giữ nguyên");
    const panel = el.querySelector(".fb-compose__conflict");
    assert.ok(panel, "khối conflict hiện ra với 2 lựa chọn");
    assert.ok(findButton(panel, "Cập nhật theo bản trên máy chủ"));
    assert.ok(findButton(panel, "Ghi đè bằng bản của tôi"));
    // Chọn deliberate từ panel của preview-conflict cũng KHÔNG tự chạy preview.
    findButton(panel, "Ghi đè bằng bản của tôi").click();
    await wait(40);
    assert.equal(behavior.editArgs.length, 2);
    assert.equal(behavior.editArgs[1].expectedRevision, 3);
    assert.equal(behavior.previewCalls, 0,
      "sau deliberate từ preview-conflict vẫn không tự preview (user bấm lại)");
    unmount(host);
  });
});

/* --------------------- N05 + large-text: CSS source-level ---------------------
 * Đây là assertion MỨC NGUỒN (class + rule tồn tại). Đo boundingBox thật
 * >=44x44 và document không tràn ngang ở 390px với font nhân đôi (stress
 * probe kiểu responsive_audit) là việc của A5 bằng browser — KHÔNG phải
 * device cert. */
describe("F04 web — N05/large-text: CSS source-level (stress probe, không device cert)", () => {
  const cssPath = fileURLToPath(new URL("../src/styles/components.css", import.meta.url));
  const css = readFileSync(cssPath, "utf8");

  function cssBlock(selector) {
    const re = new RegExp(
      selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}",
    );
    const match = css.match(re);
    return match ? match[1] : null;
  }

  it("N05 — nút 'Đổi' (.fb-compose__change-btn) khai báo hit area thực: min-height + min-width 44px, focus-visible rõ", () => {
    const block = cssBlock(".fb-compose__change-btn");
    assert.ok(block, "có rule .fb-compose__change-btn");
    assert.match(block, /min-height:\s*44px/, "min-height 44px (touch target repo)");
    assert.match(block, /min-width:\s*44px/, "min-width 44px");
    assert.match(
      css,
      /\.fb-compose__change-btn:focus-visible\s*\{/,
      "focus-visible riêng cho nút Đổi (không chỉ relies global)",
    );
  });

  it("large-text — nút chính compose cho phép wrap (bỏ nowrap), privacy row wrap, khối conflict server là scroll-container", () => {
    const pauseBtn = cssBlock(".fb-compose__pause-btn");
    assert.ok(pauseBtn, "có rule .fb-compose__pause-btn");
    assert.doesNotMatch(pauseBtn, /white-space:\s*nowrap/,
      "nút pause/save compose KHÔNG nowrap — font nhân đôi phải được wrap, không tràn ngang");

    const privacyRow = cssBlock(".fb-compose__privacy-row");
    assert.ok(privacyRow, "có rule .fb-compose__privacy-row");
    assert.match(privacyRow, /flex-wrap:\s*wrap/,
      "privacy row cho phép wrap khi chip phình ở 200%");

    const conflictServer = cssBlock(".fb-compose__conflict-server");
    assert.ok(conflictServer, "có rule .fb-compose__conflict-server");
    assert.match(conflictServer, /overflow(?:-y)?:\s*auto/,
      "bản server trong panel conflict là scroll-container (không đẩy trang)");
    assert.match(conflictServer, /max-height/, "giới hạn chiều cao để cuộn");

    const conflict = cssBlock(".fb-compose__conflict");
    assert.ok(conflict, "có rule .fb-compose__conflict (panel conflict được style cùng ngôn ngữ fb-)");
  });
});
