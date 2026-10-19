// tests/f04-ai-refine.test.mjs — F04 (US-029/US-033) hợp đồng v1 trên Mini App.
// Cover:
//  (a) thẻ gợi ý render từ `suggested_text` (DTO NGUYÊN — không refined_text);
//  (b) "Dùng gợi ý" -> aiAccept + chỉ điền TEXTAREA, KHÔNG sendMessage/createDraft;
//  (c) stale guard C4: deferred response + user đổi text -> gợi ý STALE
//      (frame zalo_f04_07): cảnh báo + "Dùng gợi ý" DISABLED, apply bị chặn
//      cả khi sửa TRƯỚC lúc bấm; "Tạo gợi ý mới" gọi refine với revision mới;
//  (d) consent C5: chưa active -> sheet disclosure; decline -> manual path
//      (Lưu nháp/Gửi phản hồi) vẫn dùng được; accept -> recordConsent rồi refine;
//      403 consent_required giữa phiên -> mở lại sheet;
//  (e) AI 503/timeout -> trạng thái lỗi trung thực + Lưu nháp vẫn hoạt động;
//  (f) inputRevision tăng theo keystroke và gửi kèm aiRefine.
//
// Pattern happy-dom giống tests/web-screens.test.mjs: gắn globals TRƯỚC import
// động; adapter stub tự dựng (không phụ thuộc mock-adapter dùng chung).
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

const { initStore, setRole, resetState } = await import("../src/app/store.js");
const { ApiError } = await import("../src/core/api/client.mjs");
const compose = (await import("../src/pages/compose/index.js")).page;
const messagePage = (await import("../src/pages/message/index.js")).page;

const ROOT = resolve(import.meta.dirname, "..");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function textOf(el) {
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

function findButton(root, needle) {
  return Array.from(root.querySelectorAll("button")).find(
    (btn) => textOf(btn).includes(needle),
  );
}

function findButtonExact(root, needle) {
  return Array.from(root.querySelectorAll("button")).find(
    (btn) => textOf(btn) === needle,
  );
}

function type(el, value) {
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/* ------------------------- Adapter stub cho F04 ------------------------- */

const ACTIVE_CONSENTS = [
  { purpose: "service", decision: "accepted", policy_version: "service-v1", withdrawn: false, current: true },
  { purpose: "ai_processing", decision: "accepted", policy_version: "ai-v1", withdrawn: false, current: true },
];
const NO_AI_CONSENTS = [
  { purpose: "service", decision: "accepted", policy_version: "service-v1", withdrawn: false, current: true },
  { purpose: "ai_processing", decision: "none", policy_version: null, withdrawn: false, current: false },
];

/** DTO NGUYÊN theo hợp đồng C1 (suggested_text; echo input_revision). */
function suggestionDto({ text, inputRevision }, suggestedText) {
  return {
    suggestion_id: "sg-f04",
    purpose: "refine_expression",
    status: "pending",
    original_text: text,
    suggested_text: suggestedText || `Bản êm hơn: ${text}`,
    model_revision: "gemini-test",
    prompt_revision: "prompt-v1",
    input_revision: inputRevision,
    created_at: "2026-10-16T00:00:00Z",
    decided_at: null,
  };
}

function createAdapter(behavior = {}) {
  const calls = {
    refine: [],
    accept: [],
    discard: [],
    listConsents: [],
    recordConsent: [],
    send: [],
    createDraft: [],
    editDraft: [],
    preview: [],
    confirmSend: [],
  };
  const adapter = {
    listConnections: async () => ({ results: [] }),
    listDrafts: async () => ({ results: [] }),
    aiStatus: async () => {
      if (behavior.aiStatusError) throw behavior.aiStatusError;
      return { ai_enabled: behavior.aiEnabled !== false }; // shape C1 (R2A3-05)
    },
    listConsents: async () => {
      calls.listConsents.push(1);
      if (behavior.consentsError) throw behavior.consentsError;
      if (behavior.deferConsents) return behavior.deferredConsents; // pending do test điều khiển
      return behavior.consents || ACTIVE_CONSENTS;
    },
    recordConsent: async (args) => {
      calls.recordConsent.push(args);
      if (behavior.recordConsentError) throw behavior.recordConsentError;
      return { consent_id: "c-1", ...args };
    },
    aiRefine: async (args) => {
      calls.refine.push(args);
      if (behavior.aiRefineError) throw behavior.aiRefineError;
      if (behavior.deferredRefine) return behavior.deferredRefine; // promise pending
      return suggestionDto(args, behavior.suggestedText);
    },
    aiAccept: async (id) => {
      calls.accept.push(id);
      if (behavior.aiAcceptError) throw behavior.aiAcceptError;
      return { suggestion_id: id, status: "accepted" };
    },
    aiDiscard: async (id) => {
      calls.discard.push(id);
      return { suggestion_id: id, status: "discarded" };
    },
    createDraft: async (args) => {
      calls.createDraft.push(args);
      return { draft_id: "d-1", revision: 1, status: "editing", server_time: "2026-10-16T00:00:00Z" };
    },
    editDraft: async (id, args) => {
      calls.editDraft.push({ id, ...args });
      return { draft_id: id, revision: 2, status: "editing", server_time: "2026-10-16T00:00:00Z" };
    },
    previewDraft: async (id) => {
      calls.preview.push(id);
      return { preview_id: "p-1" };
    },
    confirmDraftSend: async (id, previewId) => {
      calls.confirmSend.push({ id, previewId });
      return { message_id: "m-1", state: "sent" };
    },
    sendMessage: async (args) => {
      calls.send.push(args);
      return { message_id: "m-out-1", state: "sent" };
    },
    quickReplies: async () => ({ results: [], note: "library_not_configured" }),
    getMessage: async (id) => ({
      message_id: id,
      direction: "received",
      read: true,
      kind: "text",
      title: "Thư của bố",
      body: "Cuối tuần con về ăn cơm nhé.",
      counterparty_id: "ph-1",
      created_at: "2026-10-16T00:00:00Z",
    }),
    markMessageRead: async () => ({ read: true }),
    lookupOperation: async (key) => ({ status: "sent", key }),
  };
  return { adapter, calls };
}

function makeCtx({ adapter, demo = true, params = "" } = {}) {
  initStore({ demoMode: demo });
  resetState();
  setRole("student");
  const navigateCalls = [];
  return {
    ctx: {
      store: { getState: () => ({ demoMode: demo, role: "student" }) },
      adapter,
      navigate: (path) => navigateCalls.push(path),
      setRole: () => {},
      rebuildAdapter: () => {},
      params: new URLSearchParams(params),
    },
    navigateCalls,
  };
}

function mount(pageModule, ctx) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const el = pageModule.render(ctx);
  host.appendChild(el);
  return { host, el };
}

function cleanup(host) {
  host.remove();
  // Dọn sheet còn sót (consent) gắn trong trang/body giữa các test.
  document.body.querySelectorAll(".fb-sheet-root, .fb-dialog-root").forEach((el) => el.remove());
  resetState();
}

/* ============================== COMPOSER (VIEW 1) ============================== */

describe("F04 composer: hợp đồng v1 (suggested_text + inputRevision + consent)", () => {
  it("(a) thẻ gợi ý render từ suggested_text; refine gửi key + inputRevision", async () => {
    const { adapter, calls } = createAdapter();
    const { ctx } = makeCtx({ adapter });
    const { host, el } = mount(compose, ctx);
    await wait(80);

    type(el.querySelector("#fb-compose-body"), "Con tức quá hôm nay.");
    el.querySelector(".fb-compose__ai-btn").click();
    await wait(60);

    assert.equal(calls.refine.length, 1, "consent active -> refine gọi thẳng");
    assert.ok(calls.refine[0].key, "refine phải mang key idempotency");
    assert.equal(calls.refine[0].inputRevision, 2, "(f) 1 input event -> revision = 2");
    assert.equal(calls.refine[0].text, "Con tức quá hôm nay.");

    const card = el.querySelector(".fb-compose__ai-suggestion");
    assert.ok(card && !card.hidden, "thẻ gợi ý phải hiện");
    assert.ok(textOf(card).includes("Bản êm hơn: Con tức quá hôm nay."),
      "(a) gợi ý render từ suggested_text");
    assert.ok(textOf(card).includes("Gợi ý của máy chủ"));
    assert.ok(!textOf(card).includes("refined"), "không còn dấu vết refined_text");
    cleanup(host);
  });

  it("(b) 'Dùng gợi ý' -> aiAccept + chỉ điền TEXTAREA, không gửi/không tạo nháp", async () => {
    const { adapter, calls } = createAdapter();
    const { ctx } = makeCtx({ adapter });
    const { host, el } = mount(compose, ctx);
    await wait(80);
    const textarea = el.querySelector("#fb-compose-body");
    type(textarea, "Con muốn nói chuyện riêng với mẹ.");
    el.querySelector(".fb-compose__ai-btn").click();
    await wait(60);

    const useBtn = findButtonExact(el.querySelector(".fb-compose__ai-suggestion"), "Dùng gợi ý");
    assert.ok(useBtn && !useBtn.disabled, "gợi ý mới -> nút Dùng phải bật");
    useBtn.click();
    await wait(60);

    assert.deepEqual(calls.accept, ["sg-f04"], "aiAccept được gọi với suggestion_id");
    assert.equal(textarea.value, "Bản êm hơn: Con muốn nói chuyện riêng với mẹ.",
      "(b) apply điền suggested_text vào editor");
    assert.equal(calls.send.length, 0, "apply KHÔNG gọi sendMessage");
    assert.equal(calls.createDraft.length, 0, "apply KHÔNG tạo draft");
    assert.equal(calls.editDraft.length, 0, "apply KHÔNG sửa draft");
    assert.equal(calls.confirmSend.length, 0, "apply KHÔNG confirm-send");
    assert.ok(textOf(el).includes("chưa lưu nháp và chưa gửi"),
      "copy phải nói rõ chưa lưu nháp và chưa gửi");
    assert.equal(el.querySelector(".fb-compose__ai-suggestion").hidden, true,
      "thẻ gợi ý ẩn sau khi dùng");
    cleanup(host);
  });

  it("(c1) stale: response deferred, user sửa text trước resolve -> gợi ý STALE, apply bị khóa", async () => {
    const behavior = {};
    let resolveRefine;
    behavior.deferredRefine = new Promise((res) => { resolveRefine = res; });
    const { adapter, calls } = createAdapter(behavior);
    const { ctx } = makeCtx({ adapter });
    const { host, el } = mount(compose, ctx);
    await wait(80);
    const textarea = el.querySelector("#fb-compose-body");

    type(textarea, "Con muốn nói với bố mẹ về chuyện học.");
    el.querySelector(".fb-compose__ai-btn").click();
    await wait(60);
    assert.equal(calls.refine.length, 1);

    // Người dùng sửa nội dung KHI AI còn đang chạy (revision 2 -> 3).
    type(textarea, "Con muốn tự sắp xếp lịch học tuần này.");
    resolveRefine(suggestionDto({ text: "Con muốn nói với bố mẹ về chuyện học.", inputRevision: 2 }));
    await wait(60);

    const card = el.querySelector(".fb-compose__ai-suggestion");
    assert.ok(card && !card.hidden, "response về vẫn render thẻ (stale)");
    assert.ok(textOf(card).includes("Nội dung đã thay đổi kể từ khi tạo gợi ý"),
      "(c) cảnh báo stale (frame zalo_f04_07)");
    const useBtn = findButtonExact(card, "Dùng gợi ý");
    assert.ok(useBtn, "nút Dùng vẫn render nhưng");
    assert.equal(useBtn.disabled, true, "phải DISABLED khi stale");
    assert.ok(findButton(card, "Tạo gợi ý mới"), "stale phải có lối Tạo gợi ý mới");
    assert.ok(findButton(card, "Bỏ"), "stale vẫn bỏ được gợi ý");

    // Bấm nút DISABLED / bấm apply với revision lệch -> KHÔNG aiAccept, không đè text.
    useBtn.click();
    await wait(60);
    assert.equal(calls.accept.length, 0, "stale -> không gọi aiAccept");
    assert.equal(textarea.value, "Con muốn tự sắp xếp lịch học tuần này.",
      "nội dung user vừa sửa giữ nguyên");

    // "Tạo gợi ý mới" -> refine lại với revision hiện tại (một inflight).
    findButton(card, "Tạo gợi ý mới").click();
    await wait(60);
    assert.equal(calls.refine.length, 2, "regenerate gọi đúng 1 lượt mới");
    assert.equal(calls.refine[1].inputRevision, 3, "lượt mới mang revision hiện tại");
    assert.equal(calls.refine[1].text, "Con muốn tự sắp xếp lịch học tuần này.");
    cleanup(host);
  });

  it("(c2) stale: user sửa text SAU khi response về nhưng TRƯỚC apply -> apply bị chặn", async () => {
    const { adapter, calls } = createAdapter();
    const { ctx } = makeCtx({ adapter });
    const { host, el } = mount(compose, ctx);
    await wait(80);
    const textarea = el.querySelector("#fb-compose-body");

    type(textarea, "Bản gốc chưa sửa.");
    el.querySelector(".fb-compose__ai-btn").click();
    await wait(60);
    const card = el.querySelector(".fb-compose__ai-suggestion");
    const useBtn = findButtonExact(card, "Dùng gợi ý");
    assert.equal(useBtn.disabled, false, "vừa nhận gợi ý -> còn fresh");

    // Sửa TRƯỚC KHI bấm apply: input event -> render lại thẻ thành stale NGAY.
    type(textarea, "Bản gốc chưa sửa. À còn điều này nữa.");
    const useBtn2 = findButtonExact(el.querySelector(".fb-compose__ai-suggestion"), "Dùng gợi ý");
    assert.equal(useBtn2.disabled, true, "sửa sau response -> nút Dùng khóa ngay");
    useBtn2.click();
    await wait(60);
    assert.equal(calls.accept.length, 0, "apply bị chặn theo revision (C4)");
    assert.equal(textarea.value, "Bản gốc chưa sửa. À còn điều này nữa.",
      "không ghi đè nội dung mới");
    cleanup(host);
  });

  it("(d1) chưa consent -> sheet disclosure trước refine; decline -> manual path vẫn dùng được", async () => {
    const { adapter, calls } = createAdapter({ consents: NO_AI_CONSENTS });
    const { ctx } = makeCtx({ adapter });
    const { host, el } = mount(compose, ctx);
    await wait(80);
    type(el.querySelector("#fb-compose-body"), "Con buồn lắm.");
    el.querySelector(".fb-compose__ai-btn").click();
    await wait(60);

    assert.equal(calls.refine.length, 0, "chưa consent -> KHÔNG gọi refine");
    assert.equal(calls.listConsents.length, 1, "phải đọc GET /consents trước");
    const sheet = document.body.querySelector(".fb-sheet-root");
    assert.ok(sheet, "(d) sheet disclosure phải hiện");
    const sheetText = textOf(sheet);
    assert.ok(sheetText.includes("Gemini"), "sheet nói rõ nhà cung cấp AI (Gemini)");
    assert.ok(sheetText.includes("bên xử lý kỹ thuật"), "Gemini là bên xử lý kỹ thuật");
    assert.ok(sheetText.includes("không liên quan đến bước gửi thư"),
      "không precheck-bọc-gộp với gửi tin");
    assert.ok(!/riêng tư tuyệt đối|mã hóa/i.test(sheetText),
      "copy CẤM 'riêng tư tuyệt đối'/'mã hóa'");

    findButton(sheet, "Viết tay thôi").click();
    await wait(60);
    assert.equal(document.body.querySelector(".fb-sheet-root"), null, "từ chối -> sheet đóng");
    assert.equal(calls.refine.length, 0, "từ chối -> vẫn không refine");

    // Manual path vẫn hoạt động: Lưu nháp thật qua createDraft.
    findButton(el, "Lưu nháp riêng").click();
    await wait(60);
    assert.equal(calls.createDraft.length, 1, "từ chối AI -> lưu nháp tay vẫn chạy");
    assert.ok(textOf(el).includes("Bản nháp đã nằm trên máy chủ"),
      "chỉ báo lưu lấy từ response máy chủ");
    cleanup(host);
  });

  it("(d2) đồng ý trong sheet -> recordConsent(purpose ai_processing) rồi refine", async () => {
    const { adapter, calls } = createAdapter({ consents: NO_AI_CONSENTS });
    const { ctx } = makeCtx({ adapter });
    const { host, el } = mount(compose, ctx);
    await wait(80);
    type(el.querySelector("#fb-compose-body"), "Con nhớ mẹ.");
    el.querySelector(".fb-compose__ai-btn").click();
    await wait(60);
    const sheet = document.body.querySelector(".fb-sheet-root");
    findButton(sheet, "Đồng ý và tạo gợi ý").click();
    await wait(80);

    assert.equal(calls.recordConsent.length, 1, "accept -> POST consents");
    assert.equal(calls.recordConsent[0].purpose, "ai_processing");
    assert.equal(calls.recordConsent[0].decision, "accepted");
    assert.ok(calls.recordConsent[0].policyVersion, "POST phải mang policy_version hiện hành");
    assert.equal(calls.refine.length, 1, "accept xong -> refine chạy ngay");
    assert.ok(el.querySelector(".fb-compose__ai-suggestion") && !el.querySelector(".fb-compose__ai-suggestion").hidden,
      "gợi ý hiện sau khi consent + refine");
    cleanup(host);
  });

  it("(d3) refine 403 consent_required giữa phiên -> mở lại sheet disclosure", async () => {
    const { adapter, calls } = createAdapter({
      aiRefineError: new ApiError("Cần đồng ý.", 403, "http", { code: "consent_required", details: {} }),
    });
    const { ctx } = makeCtx({ adapter });
    const { host, el } = mount(compose, ctx);
    await wait(80);
    type(el.querySelector("#fb-compose-body"), "Con cần được lắng nghe.");
    el.querySelector(".fb-compose__ai-btn").click();
    await wait(60);
    assert.equal(calls.refine.length, 1, "consent active theo client -> refine được gọi");
    const sheet = document.body.querySelector(".fb-sheet-root");
    assert.ok(sheet, "consent_required -> mở sheet disclosure");
    cleanup(host);
  });

  it("(e) AI 503 -> lỗi trung thực, KHÔNG fallback gợi ý; Lưu nháp vẫn hoạt động", async () => {
    const { adapter, calls } = createAdapter({
      aiRefineError: new ApiError("Service Unavailable", 503, "http"),
    });
    const { ctx } = makeCtx({ adapter });
    const { host, el } = mount(compose, ctx);
    await wait(80);
    type(el.querySelector("#fb-compose-body"), "Hôm nay con mệt.");
    el.querySelector(".fb-compose__ai-btn").click();
    await wait(60);

    assert.equal(el.querySelector(".fb-compose__ai-suggestion").hidden, true,
      "KHÔNG fallback gợi ý giả (C6)");
    assert.ok(textOf(el).includes("đang tắt hoặc bảo trì"),
      "trạng thái lỗi trung thực (frame zalo_f04_08)");
    assert.ok(textOf(el).includes("giữ nguyên"), "nói rõ lời nhắn giữ nguyên");

    // Manual path: Lưu nháp + textarea vẫn dùng được sau khi AI lỗi.
    findButton(el, "Lưu nháp riêng").click();
    await wait(60);
    assert.equal(calls.createDraft.length, 1, "(e) Lưu nháp vẫn hoạt động khi AI lỗi");
    cleanup(host);
  });

  it("(e2) AI timeout -> thông báo quá thời gian chờ; nút AI mở lại để thử lại", async () => {
    const { adapter } = createAdapter({
      aiRefineError: new ApiError("Timeout", 0, "timeout"),
    });
    const { ctx } = makeCtx({ adapter });
    const { host, el } = mount(compose, ctx);
    await wait(80);
    type(el.querySelector("#fb-compose-body"), "Con muốn xin lỗi bố.");
    el.querySelector(".fb-compose__ai-btn").click();
    await wait(60);
    assert.ok(textOf(el).includes("Kết nối quá thời gian chờ"), "timeout báo đúng");
    const pill = el.querySelector(".fb-compose__ai-btn");
    assert.equal(pill.disabled, false, "sau lỗi nút AI phải mở lại (thử lại thủ công)");
    cleanup(host);
  });

  it("(f) inputRevision tăng theo từng keystroke và gửi kèm mỗi lượt refine", async () => {
    const { adapter, calls } = createAdapter();
    const { ctx } = makeCtx({ adapter });
    const { host, el } = mount(compose, ctx);
    await wait(80);
    const textarea = el.querySelector("#fb-compose-body");
    const input = () => textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.value = "A"; input();  // revision 2
    textarea.value = "Af"; input(); // revision 3
    textarea.value = "Afh"; input(); // revision 4
    el.querySelector(".fb-compose__ai-btn").click();
    await wait(60);
    assert.equal(calls.refine[0].inputRevision, 4, "3 keystroke -> revision 4");

    // "Bỏ" rồi xin lại: lượt mới mang revision hiện hành.
    findButton(el.querySelector(".fb-compose__ai-suggestion"), "Bỏ").click();
    await wait(60);
    el.querySelector(".fb-compose__ai-btn").click();
    await wait(60);
    assert.equal(calls.refine[1].inputRevision, 4, "revision giữ nguyên khi không gõ thêm");
    assert.notEqual(calls.refine[0].key, calls.refine[1].key, "mỗi lượt refine có key riêng");
    cleanup(host);
  });

  it("(e3) quota thật (503 + details.reason=provider_quota_exceeded) -> báo 'Hết lượt', không rơi nhánh 503 chung", async () => {
    const { adapter } = createAdapter({
      // Envelope lỗi thật của backend f04 (express.py): code =
      // temporarily_unavailable, reason nằm ở details.reason (R2A3-03).
      aiRefineError: new ApiError("Service Unavailable", 503, "http", {
        code: "temporarily_unavailable",
        details: { reason: "provider_quota_exceeded" },
      }),
    });
    const { ctx } = makeCtx({ adapter });
    const { host, el } = mount(compose, ctx);
    await wait(80);
    type(el.querySelector("#fb-compose-body"), "Hôm nay con không nói nên lời.");
    el.querySelector(".fb-compose__ai-btn").click();
    await wait(60);

    assert.ok(
      textOf(el).includes("Hết lượt gợi ý AI"),
      "details.reason=provider_quota_exceeded phải map 'Hết lượt gợi ý AI'",
    );
    assert.ok(
      !textOf(el).includes("đang tắt hoặc bảo trì"),
      "KHÔNG được nói sai nguyên nhân (không phải 503 chung 'đang tắt')",
    );
    const pill = el.querySelector(".fb-compose__ai-btn");
    assert.equal(pill.disabled, false, "nút mở lại để thử lại sau (thủ công)");
    cleanup(host);
  });

  it("(e4) aiStatus lỗi mạng -> 'Chưa kiểm tra được trạng thái' (không bịa 'chưa được bật')", async () => {
    const { adapter } = createAdapter({
      aiStatusError: new ApiError("Chưa kết nối được backend.", 0, "network"),
    });
    const { ctx } = makeCtx({ adapter });
    const { host, el } = mount(compose, ctx);
    await wait(80);

    const pill = el.querySelector(".fb-compose__ai-btn");
    assert.ok(pill, "nút AI vẫn render (trang không chặn)");
    assert.ok(pill.disabled, "không rõ trạng thái -> nút không bấm mạo");
    const note = textOf(el.querySelector(".fb-compose__ai-note"));
    assert.ok(
      note.includes("Chưa kiểm tra được trạng thái"),
      "trung thực: không kiểm tra được trạng thái (R2A3-04)",
    );
    assert.ok(
      !note.includes("chưa được bật trên máy chủ"),
      "KHÔNG được tuyên bố máy chủ đã tắt AI khi thực ra là lỗi mạng",
    );
    assert.ok(note.includes("vẫn viết tay"), "manual path vẫn nói rõ còn nguyên");
    cleanup(host);
  });

  it("(d4) double-click nút AI trong cửa sổ kiểm tra consent -> 1 listConsents + 1 sheet + 1 POST", async () => {
    // listConsents GIỮ pending: mô phỏng roundtrip thật đang bay. Hai click
    // PHẢI riêng lượt event (như double-click thật): busyGuard('ai') của
    // compose chỉ khóa phần đồng bộ, click 2 rơi vào giữa roundtrip.
    let resolveConsents;
    const behavior = {
      consents: NO_AI_CONSENTS,
      deferConsents: true,
      deferredConsents: new Promise((res) => { resolveConsents = res; }),
    };
    const { adapter, calls } = createAdapter(behavior);
    const { ctx } = makeCtx({ adapter });
    const { host, el } = mount(compose, ctx);
    await wait(80);
    type(el.querySelector("#fb-compose-body"), "Con cần bố mẹ lắng nghe.");
    const pill = el.querySelector(".fb-compose__ai-btn");
    pill.click();
    await wait(0); // cho microtask của guarded chạy xong — listConsents VẪN đang bay
    pill.click(); // double-click thật (R2A3-02)
    await wait(10);

    assert.equal(
      calls.listConsents.length, 1,
      "double-click chỉ tạo MỘT lượt kiểm tra consent",
    );

    resolveConsents(NO_AI_CONSENTS);
    await wait(60);
    const sheets = document.body.querySelectorAll(".fb-sheet-root");
    assert.equal(sheets.length, 1, "chỉ MỘT sheet disclosure (không chồng sheet)");

    // Đồng ý (bấm 2 lần liên tiếp) -> vẫn chỉ 1 POST consents + 1 refine.
    const agreeBtn = findButton(sheets[0], "Đồng ý và tạo gợi ý");
    agreeBtn.click();
    agreeBtn.click(); // agreeBtn tự disabled khi bấm -> không nhân bản POST
    await wait(80);
    assert.equal(calls.recordConsent.length, 1, "chỉ 1 POST consents (không nhân bản ledger)");
    assert.equal(calls.refine.length, 1, "refine chạy đúng 1 lượt sau đồng ý");
    cleanup(host);
  });

  it("(g) Hủy chờ gợi ý (frame zalo_f04_04): response muộn bị bỏ qua; bấm lại là lượt mới (key mới)", async () => {
    let resolveRefine;
    const behavior = { deferredRefine: new Promise((res) => { resolveRefine = res; }) };
    const { adapter, calls } = createAdapter(behavior);
    const { ctx } = makeCtx({ adapter });
    const { host, el } = mount(compose, ctx);
    await wait(80);
    const textarea = el.querySelector("#fb-compose-body");
    type(textarea, "Con đang chờ một gợi ý bị hủy.");
    el.querySelector(".fb-compose__ai-btn").click();
    await wait(60);
    assert.equal(calls.refine.length, 1);

    const cancelBtn = findButton(el, "Hủy chờ gợi ý");
    assert.ok(cancelBtn, "loading phải có nút 'Hủy chờ gợi ý' (frame zalo_f04_04)");
    assert.equal(cancelBtn.hidden, false, "nút hủy phải hiện khi đang loading");

    cancelBtn.click();
    await wait(30);
    assert.ok(textOf(el).includes("đã hủy chờ gợi ý"), "ghi nhận hủy trung thực");
    assert.equal(
      el.querySelector(".fb-compose__ai-btn").disabled, false,
      "pill mở lại sau khi hủy",
    );
    assert.equal(findButton(el, "Hủy chờ gợi ý").hidden, true, "nút hủy ẩn lại");
    assert.equal(calls.refine.length, 1, "hủy KHÔNG tự retry/refine lại máy chủ");

    // Response cũ về muộn -> phải bị bỏ qua (không render thẻ, không đè nội dung).
    resolveRefine(suggestionDto({
      text: "Con đang chờ một gợi ý bị hủy.",
      inputRevision: calls.refine[0].inputRevision,
    }));
    await wait(60);
    const lateCard = el.querySelector(".fb-compose__ai-suggestion");
    assert.ok(!lateCard || lateCard.hidden === true, "response sau hủy KHÔNG được render");
    assert.equal(textarea.value, "Con đang chờ một gợi ý bị hủy.", "nội dung giữ nguyên");

    // Bấm lại = lượt refine MỚI với key idempotency mới (không replay key cũ).
    behavior.deferredRefine = new Promise((res) => { resolveRefine = res; });
    el.querySelector(".fb-compose__ai-btn").click();
    await wait(60);
    assert.equal(calls.refine.length, 2, "bấm lại tạo lượt refine mới");
    assert.notEqual(calls.refine[1].key, calls.refine[0].key, "lượt mới dùng key mới");
    resolveRefine(suggestionDto({
      text: "Con đang chờ một gợi ý bị hủy.",
      inputRevision: calls.refine[1].inputRevision,
    }));
    await wait(60);
    const newCard = el.querySelector(".fb-compose__ai-suggestion");
    assert.ok(newCard && newCard.hidden === false, "lượt mới trả gợi ý bình thường");
    cleanup(host);
  });

  it("F04-02 regression: hai trang không còn đọc refined_text", () => {
    for (const file of ["src/pages/compose/index.js", "src/pages/message/index.js"]) {
      const src = readFileSync(join(ROOT, file), "utf8").replace(/\/\/[^\n]*/g, "");
      assert.ok(!/refined_text/.test(src), `${file} còn đọc refined_text`);
      assert.ok(/suggested_text/.test(src), `${file} phải đọc suggested_text`);
    }
  });
});

/* ============================== REPLY (VIEW 13) ============================== */

describe("F04 reply (message detail): hợp đồng v1", () => {
  function mountMessage(adapter) {
    const { ctx } = makeCtx({ adapter, demo: true, params: "id=m-9" });
    const { host, el } = mount(messagePage, ctx);
    return { host, el };
  }

  it("(a)+(b) gợi ý từ suggested_text; 'Dùng gợi ý' điền textarea, không sendMessage", async () => {
    const { adapter, calls } = createAdapter();
    const { host, el } = mountMessage(adapter);
    await wait(80);
    const textarea = el.querySelector("textarea");
    type(textarea, "Con cũng nhớ bố.");
    findButton(el, "AI gợi ý cách diễn đạt êm ái hơn").click();
    await wait(60);

    assert.equal(calls.refine.length, 1);
    assert.equal(calls.refine[0].inputRevision, 2);
    const card = el.querySelector(".fb-compose__ai-suggestion");
    assert.ok(card && !card.hidden);
    assert.ok(textOf(card).includes("Bản êm hơn: Con cũng nhớ bố."), "(a) suggested_text");

    findButtonExact(card, "Dùng gợi ý").click();
    await wait(60);
    assert.deepEqual(calls.accept, ["sg-f04"], "aiAccept thật");
    assert.equal(textarea.value, "Bản êm hơn: Con cũng nhớ bố.", "(b) chỉ điền textarea");
    assert.equal(calls.send.length, 0, "KHÔNG tự gửi Message");
    cleanup(host);
  });

  it("(c) reply stale: user sửa trước resolve -> gợi ý cũ không áp dụng được", async () => {
    let resolveRefine;
    const behavior = { deferredRefine: new Promise((res) => { resolveRefine = res; }) };
    const { adapter, calls } = createAdapter(behavior);
    const { host, el } = mountMessage(adapter);
    await wait(80);
    const textarea = el.querySelector("textarea");
    type(textarea, "Lời chưa êm.");
    findButton(el, "AI gợi ý cách diễn đạt êm ái hơn").click();
    await wait(60);
    type(textarea, "Lời chưa êm. Con muốn nói riêng."); // sửa khi AI đang chạy
    resolveRefine(suggestionDto({ text: "Lời chưa êm.", inputRevision: 2 }));
    await wait(60);

    const card = el.querySelector(".fb-compose__ai-suggestion");
    assert.ok(textOf(card).includes("Nội dung đã thay đổi kể từ khi tạo gợi ý"));
    const useBtn = findButtonExact(card, "Dùng gợi ý");
    assert.equal(useBtn.disabled, true, "stale -> Dùng bị khóa");
    useBtn.click();
    await wait(40);
    assert.equal(calls.accept.length, 0, "không aiAccept khi stale");
    assert.equal(textarea.value, "Lời chưa êm. Con muốn nói riêng.");
    cleanup(host);
  });

  it("(d2-r) reply double-click khi kiểm tra consent -> 1 listConsents + 1 sheet + 1 POST", async () => {
    const { adapter, calls } = createAdapter({ consents: NO_AI_CONSENTS });
    const { host, el } = mountMessage(adapter);
    await wait(80);
    const textarea = el.querySelector("textarea");
    type(textarea, "Con cảm ơn bố nhiều.");
    const pill = findButton(el, "AI gợi ý cách diễn đạt êm ái hơn");
    pill.click();
    pill.click(); // double-click ngay khi listConsents đang bay (R2A3-02)
    await wait(60);

    assert.equal(calls.listConsents.length, 1, "reply: double-click chỉ 1 lượt kiểm tra");
    const sheets = document.body.querySelectorAll(".fb-sheet-root");
    assert.equal(sheets.length, 1, "reply: chỉ MỘT sheet consent (không chồng)");
    findButton(sheets[0], "Đồng ý và tạo gợi ý").click();
    await wait(80);
    assert.equal(calls.recordConsent.length, 1, "reply: chỉ 1 POST consents");
    assert.equal(calls.refine.length, 1, "reply: refine chạy đúng 1 lượt");
    cleanup(host);
  });

  it("(d) reply chưa consent -> sheet; decline -> gửi tay vẫn dùng được", async () => {
    const { adapter, calls } = createAdapter({ consents: NO_AI_CONSENTS });
    const { host, el } = mountMessage(adapter);
    await wait(80);
    const textarea = el.querySelector("textarea");
    type(textarea, "Con cảm ơn bố.");
    findButton(el, "AI gợi ý cách diễn đạt êm ái hơn").click();
    await wait(60);

    assert.equal(calls.refine.length, 0, "chưa consent -> không refine");
    const sheet = document.body.querySelector(".fb-sheet-root");
    assert.ok(sheet, "(d) sheet disclosure trong khung phản hồi");
    findButton(sheet, "Viết tay thôi").click();
    await wait(60);

    // Manual path: gửi phản hồi tay vẫn hoạt động.
    const sendBtn = findButton(el, "Gửi phản hồi");
    assert.equal(sendBtn.disabled, false, "manual path không bị AI chặn");
    sendBtn.click();
    await wait(60);
    assert.equal(calls.send.length, 1, "(d) gửi tay vẫn chạy khi từ chối AI");
    assert.equal(calls.send[0].kind, "text", "gửi đúng hợp đồng F05");
    cleanup(host);
  });
});

/* ================= R01 (QA 18/10): gửi sai bản đã duyệt ================= */
describe("F04 composer R01 (QA 18/10): preview tự đồng bộ final — không còn gửi original cũ", () => {
  const SERVER_DRAFT = {
    draft_id: "d-srv", revision: 2, status: "editing", pause: null,
    recipient_id: "u-care-1", body: "Nháp original trên máy chủ.",
  };

  it("(r01-a) Dùng gợi ý KHÔNG lưu nháp -> preview phải editDraft ĐÚNG final trước khi bind; confirm gửi bản đã duyệt", async () => {
    const { adapter, calls } = createAdapter();
    // Đúng kịch bản QA: server CÓ draft chứa original + recipient hợp lệ.
    adapter.listDrafts = async () => ({
      results: [{ ...SERVER_DRAFT }], serverTime: "2026-10-16T00:00:00Z",
    });
    // N03 contract: connections phải chứa recipient của draft để sheet resolve
    // tên từ preview.recipient_id (server-truth); thiếu -> fail-closed.
    adapter.listConnections = async () => ({
      results: [{ connection_id: "u-care-1", other_party_id: "u-care-1",
        relationship_kind: "parent",
        counterpart: { display_name: "Bố" } }],
    });
    // N03 contract (A1 pin 6 field): previewDraft trả ĐỦ shape — body = bản
    // editDraft cuối (auto-sync R01) hoặc bản server draft.
    const previewBody = () => (calls.editDraft.length
      ? calls.editDraft[calls.editDraft.length - 1].body
      : SERVER_DRAFT.body);
    adapter.previewDraft = async (id) => {
      calls.preview.push(id);
      return { preview_id: "p-1", revision: 2, recipient_id: "u-care-1",
        body: previewBody(), deadline: null,
        server_time: "2026-10-16T00:00:01Z" };
    };
    const { ctx } = makeCtx({ adapter });
    const { host, el } = mount(compose, ctx);
    await wait(80);

    const textarea = el.querySelector("#fb-compose-body");
    type(textarea, "Con muốn nói chuyện riêng với mẹ.");
    el.querySelector(".fb-compose__ai-btn").click();
    await wait(60);
    const useBtn = findButtonExact(
      el.querySelector(".fb-compose__ai-suggestion"), "Dùng gợi ý");
    useBtn.click();
    await wait(60);
    const finalText = textarea.value;
    assert.equal(finalText, "Bản êm hơn: Con muốn nói chuyện riêng với mẹ.",
      "(r01-a) textarea giữ final sau khi Dùng gợi ý");

    // Preview TRỰC TIẾP — không Lưu nháp thêm (đúng 5 bước QA R01).
    findButton(el, "Xem trước nội dung").click();
    await wait(80);
    assert.deepEqual(
      calls.editDraft.map((row) => row.body),
      [finalText],
      "(r01-a) preview phải TỰ ĐỒNG BỘ final lên máy chủ (editDraft) trước khi bind",
    );
    assert.equal(calls.preview.length, 1, "(r01-a) preview gọi sau khi đồng bộ");
    const sheet = document.body.querySelector(".fb-sheet-root");
    assert.ok(sheet, "(r01-a) preview -> sheet xác nhận");
    // N03: sheet phải bind tên TỪ preview.recipient_id (không phải tên cũ)
    assert.ok(findButton(sheet, "Gửi cho Bố"),
      "(r01-a) sheet bind tên người nhận từ preview response (server-truth)");
    findButton(sheet, "Gửi cho Bố").click();
    await wait(80);
    assert.equal(calls.confirmSend.length, 1,
      "(r01-a) confirm gửi đúng bản đã duyệt (đã đồng bộ)");
    cleanup(host);
  });

  it("(r01-b) textarea rỗng -> preview DỪNG ở client, không bind nhầm bản cũ trên máy chủ", async () => {
    const { adapter, calls } = createAdapter();
    adapter.listDrafts = async () => ({
      results: [{ ...SERVER_DRAFT }], serverTime: "2026-10-16T00:00:00Z",
    });
    const { ctx } = makeCtx({ adapter });
    const { host, el } = mount(compose, ctx);
    await wait(80);

    el.querySelector("#fb-compose-body").value = "   ";
    findButton(el, "Xem trước nội dung").click();
    await wait(80);
    assert.equal(calls.preview.length, 0,
      "(r01-b) không gọi preview khi nội dung rỗng");
    assert.ok(textOf(el).includes("chưa có nội dung"),
      "(r01-b) báo trung thực cho user");
    cleanup(host);
  });
});
