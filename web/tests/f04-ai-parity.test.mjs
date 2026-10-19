// tests/f04-ai-parity.test.mjs — F04 (US-029/US-033) web counterpart tests (A4).
// Phủ hợp đồng đóng băng v1 ở mặt web: suggested_text (C2), consent sheet
// decline/accept (C3), stale guard inputRevision (C4), error manual fallback
// (C5), apply không gửi/không tạo Message (C6), biến thể caregiver, receipt
// sending/unknown/sent, smoke responsive/CSS palette (C7 — kiểm tra nguồn CSS
// vì happy-dom không tính layout thật; assertion được ghi rõ là source-level).
//
// Chạy: node --test tests/f04-ai-parity.test.mjs
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
const { setSession, clearSession } = await import("../src/core/session.js");
const { ApiError } = await import("../../packages/family_bridge_shared/src/api/client.mjs");
const { createMockAdapter } = await import("../src/adapter/web-adapter.js");

const compose = (await import("../src/pages/compose/index.js")).page;
const messagePage = (await import("../src/pages/message/index.js")).page;

const ROOT = resolve(import.meta.dirname, "..");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  return {
    ctx: {
      store: { getState: () => ({ demoMode: demo, role }) },
      adapter: currentAdapter,
      navigate: () => {},
      setRole: () => {},
      rebuildAdapter: () => {},
      params: new URLSearchParams(params),
    },
    adapter: currentAdapter,
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
    token: "test-token-f04",
    userId: "u-student-1",
    expiresAt: Date.now() + 60 * 60 * 1000,
    displayName: "Học sinh Test",
  });
}

/** Consent ai_processing đã cấp (đúng policy version shared) — dùng chung. */
const GRANTED_CONSENT = [
  { purpose: "ai_processing", decision: "accepted", policy_version: "ai-v1", withdrawn: false, current: true },
];

/** DTO chuẩn C1 với suggested_text; `echo` cho phép giả server echo lệch. */
function suggestionDto({ text, id = "sg-t", echo = null } = {}) {
  return {
    suggestion_id: id,
    purpose: "refine_expression",
    status: "pending",
    original_text: text,
    suggested_text: `Bản êm hơn: ${text}`,
    model_revision: "m-1",
    prompt_revision: "p-1",
    ...(echo === null ? {} : { input_revision: echo }),
    created_at: "2026-10-16T00:00:00Z",
    decided_at: null,
  };
}

/** Adapter web giả tối thiểu cho compose: draft engine + AI hooks kiểm soát. */
function f04Adapter({ behavior = {} } = {}) {
  // N01 (19/10): hợp đồng preview mới trả kèm `body` = bản máy chủ BIND
  // (server-bound snapshot). Adapter giả phải phản ánh đúng contract mới:
  // server body = body của draft ban đầu, đổi theo MỖI editDraft — sheet
  // xác nhận phải hiển thị bản này (preview.body ?? snapshotBody), KHÔNG
  // đọc live textarea. (Cập nhật adapter giả vì hành vi cũ "preview trả
  // body: "x" cố định" không còn đúng hợp đồng.)
  if (behavior.serverBody === undefined) {
    behavior.serverBody = behavior.drafts && behavior.drafts[0] && behavior.drafts[0].body != null
      ? String(behavior.drafts[0].body)
      : "x";
  }
  // Fix fixture sai hợp đồng (F04R2-A4): backend make_preview TRẢ ĐÚNG
  // revision hiện hành của draft (A1 pin 6 field — preview.revision ===
  // draft.revision máy chủ). Trước đây fixture để `behavior.revision || 1`
  // nên với draft revision 2/3 preview trả revision 1 — không API thật nào
  // làm vậy; N03 so server-truth nên lệch này phải được sửa ở FIXTURE chứ
  // không nới lỏng assert ứng dụng.
  if (behavior.revision === undefined) {
    behavior.revision = behavior.drafts && behavior.drafts[0] && behavior.drafts[0].revision != null
      ? Number(behavior.drafts[0].revision)
      : 1;
  }
  return {
    mode: "web",
    listConnections: async () => ({
      results: [{
        connection_id: "c-1", status: "active", relationship_kind: "primary",
        generation: 1, other_party_id: "u-care-1",
        counterpart: { display_name: "Người chăm sóc Test", identity_basis: "self_declared" },
      }],
      nextCursor: null,
    }),
    listDrafts: async () => ({ results: behavior.drafts || [], serverTime: "2026-10-16T00:00:00Z" }),
    createDraft: async ({ body }) => ({
      draft_id: "d-new", revision: 1, status: "editing", pause: null, server_time: "2026-10-16T00:00:00Z", body,
    }),
    editDraft: async (id, { body }) => {
      // Ghi nhận body lưu lên máy chủ — dùng assert "preview dùng bản ĐÃ SỬA".
      behavior.editDraftBodies = behavior.editDraftBodies || [];
      behavior.editDraftBodies.push(body);
      behavior.serverBody = body; // N01: máy chủ giờ giữ đúng bản này
      return {
        draft_id: id, revision: (behavior.revision = (behavior.revision || 1) + 1),
        status: "editing", pause: null, server_time: "2026-10-16T00:00:00Z", body,
      };
    },
    previewDraft: async (id) => {
      behavior.previewCalls = (behavior.previewCalls || 0) + 1;
      if (behavior.previewError) throw behavior.previewError;
      // N01: response preview kèm server-bound snapshot (body/revision/
      // recipient_id) — parity với backend A2.
      return {
        preview_id: "pv-1",
        draft_id: id,
        revision: behavior.revision || 1,
        recipient_id: "u-care-1",
        body: behavior.serverBody,
      };
    },
    confirmDraftSend: async (id, previewId) => {
      behavior.confirmCalls = (behavior.confirmCalls || 0) + 1;
      if (behavior.confirmError) throw behavior.confirmError;
      return { draft_id: id, preview_id: previewId, status: "sent" };
    },
    pauseDraft: async () => ({ status: "paused", pause: { remaining_seconds: 300, can_preview: false } }),
    cancelDraftPause: async () => ({ status: "editing", pause: null }),
    aiStatus: async () => behavior.aiStatusResult || { ai_enabled: true },
    listConsents: async () => {
      behavior.listConsentsCalls = (behavior.listConsentsCalls || 0) + 1;
      if (behavior.consentError) throw behavior.consentError;
      return behavior.consentRows || GRANTED_CONSENT;
    },
    recordConsent: async (args) => {
      behavior.recordConsentCalls = behavior.recordConsentCalls || [];
      behavior.recordConsentCalls.push(args);
      return { consent_id: "c-1", ...args };
    },
    aiRefine: async (args = {}) => {
      behavior.aiRefineCalls = behavior.aiRefineCalls || [];
      behavior.aiRefineCalls.push(args);
      if (behavior.deferRefine) {
        behavior.deferred = behavior.deferred || [];
        return new Promise((resolvePromise) => behavior.deferred.push(resolvePromise));
      }
      if (behavior.refineError) throw behavior.refineError;
      return behavior.refineResult || suggestionDto({ text: args.text, echo: args.inputRevision });
    },
    aiAccept: async (id) => {
      behavior.aiAcceptCalls = behavior.aiAcceptCalls || [];
      behavior.aiAcceptCalls.push(id);
      if (behavior.deferAccept) {
        // R3A4-01: giữ accept đang bay để mô phỏng user gõ trong lúc ghi nhận.
        behavior.deferredAccept = behavior.deferredAccept || [];
        return new Promise((resolvePromise) => behavior.deferredAccept.push(resolvePromise));
      }
      return { suggestion_id: id, status: "accepted" };
    },
    aiDiscard: async (id) => {
      behavior.aiDiscardCalls = behavior.aiDiscardCalls || [];
      behavior.aiDiscardCalls.push(id);
      return { suggestion_id: id, status: "discarded" };
    },
  };
}

async function openSuggestion(el, adapter, behavior, text) {
  const textarea = el.querySelector("#fb-compose-body");
  textarea.value = text;
  textarea.dispatchEvent(new domWindow.Event("input", { bubbles: true }));
  await wait(30); // đợi aiStatus resolve
  el.querySelector(".fb-compose__ai-btn").click();
  await wait(30);
  if (behavior.deferred && behavior.deferred.length) {
    // Echo đúng revision mà component đã gửi (server echo trung thực).
    const echo = behavior.aiRefineCalls?.[0]?.inputRevision ?? null;
    behavior.deferred.shift()(suggestionDto({ text, echo }));
    await wait(30);
  }
  return textarea;
}

describe("F04 web — C4 stale guard inputRevision", () => {
  it("deferred response + user đổi text trước khi response về -> STALE: banner + khoá 'Dùng gợi ý' + còn 'Tạo gợi ý mới' + manual giữ nguyên", async () => {
    withSession();
    const behavior = { deferRefine: true };
    const { ctx } = makeCtx({ demo: false, role: "student", adapter: f04Adapter({ behavior }) });
    const { host, el } = mount(compose, ctx);
    await wait(60);

    const textarea = el.querySelector("#fb-compose-body");
    textarea.value = "Bản soạn lúc gửi";
    textarea.dispatchEvent(new domWindow.Event("input", { bubbles: true }));
    await wait(30); // đợi aiStatus resolve
    el.querySelector(".fb-compose__ai-btn").click();
    await wait(30);

    // Response chưa về -> loading inline, KHÔNG chặn gõ (C5).
    assert.ok(textOf(el).includes("Đang tạo gợi ý"), "phải có loading inline");
    textarea.value = "Bản soạn đã đổi sau khi bấm";
    textarea.dispatchEvent(new domWindow.Event("input", { bubbles: true }));

    const echo = behavior.aiRefineCalls[0].inputRevision; // revision lúc gửi
    behavior.deferred.shift()(suggestionDto({ text: "Bản soạn lúc gửi", id: "sg-deferred", echo }));
    await wait(40);

    const card = el.querySelector(".fb-compose__ai-suggestion");
    assert.ok(card, "gợi ý vẫn hiển thị để đọc");
    assert.ok(
      textOf(card).includes("Nội dung đã thay đổi kể từ khi tạo gợi ý"),
      "phải có banner cảnh báo stale",
    );
    assert.ok(
      textOf(card).includes("Bản êm hơn: Bản soạn lúc gửi"),
      "nội dung gợi ý vẫn render qua textContent",
    );
    const useBtn = findButton(card, "Dùng gợi ý");
    assert.ok(useBtn.disabled, "stale -> KHÔNG được dùng gợi ý");
    assert.ok(findButton(card, "Tạo gợi ý mới"), "stale -> còn đường tạo lại");
    assert.equal(textarea.value, "Bản soạn đã đổi sau khi bấm", "manual text giữ nguyên");
    unmount(host);
  });

  it("response về OK rồi user sửa text TRƯỚC lúc bấm apply -> apply bị chặn (kiểm tra revision tại thời điểm bấm)", async () => {
    withSession();
    const behavior = {};
    const { ctx } = makeCtx({ demo: false, role: "student", adapter: f04Adapter({ behavior }) });
    const { host, el } = mount(compose, ctx);
    await wait(60);

    const textarea = await openSuggestion(el, null, behavior, "Bản gốc");
    assert.ok(!findButton(el.querySelector(".fb-compose__ai-suggestion"), "Dùng gợi ý").disabled,
      "response đúng revision -> nút dùng bình thường");

    textarea.value = "Bản gốc (đã sửa thêm)";
    textarea.dispatchEvent(new domWindow.Event("input", { bubbles: true }));

    // R3A4-02: banner stale + khóa "Dùng gợi ý" phải xuất hiện NGAY khi gõ
    // (re-render thẻ tại mỗi input event khi thẻ đang mở) — không chờ đến bấm.
    const cardAfterType = el.querySelector(".fb-compose__ai-suggestion");
    assert.ok(
      textOf(cardAfterType).includes("Nội dung đã thay đổi kể từ khi tạo gợi ý"),
      "gõ khi thẻ đang mở -> banner stale hiện tức thì (không chờ bấm)",
    );
    assert.ok(
      findButton(cardAfterType, "Dùng gợi ý").disabled,
      "gõ khi thẻ đang mở -> 'Dùng gợi ý' khóa tức thì",
    );
    assert.ok(findButton(cardAfterType, "Tạo gợi ý mới"), "còn 'Tạo gợi ý mới' ngay khi gõ");

    findButton(el.querySelector(".fb-compose__ai-suggestion"), "Dùng gợi ý").click();
    await wait(30);

    assert.deepEqual(behavior.aiAcceptCalls || [], [], "apply phải bị chặn khi revision lệch");
    assert.equal(textarea.value, "Bản gốc (đã sửa thêm)", "không ghi đè im lặng chữ của user");
    assert.ok(
      textOf(el).includes("Nội dung đã thay đổi kể từ khi tạo gợi ý"),
      "phải hiện cảnh báo stale",
    );
    unmount(host);
  });

  it("gõ trong lúc accept đang bay -> sau khi aiAccept resolve: KHÔNG điền đè, giữ text mới + banner stale (R3A4-01)", async () => {
    withSession();
    const behavior = { deferAccept: true };
    const { ctx } = makeCtx({ demo: false, role: "student", adapter: f04Adapter({ behavior }) });
    const { host, el } = mount(compose, ctx);
    await wait(60);

    const textarea = await openSuggestion(el, null, behavior, "Bản gốc khi tạo gợi ý");
    const card = el.querySelector(".fb-compose__ai-suggestion");
    assert.ok(card, "gợi ý đã mở");
    findButton(card, "Dùng gợi ý").click();
    await wait(30);

    assert.deepEqual(behavior.aiAcceptCalls, ["sg-t"], "aiAccept gọi đúng 1 lượt");
    assert.ok(
      findButton(el.querySelector(".fb-compose__ai-suggestion"), "Dùng gợi ý").disabled,
      "nút 'Dùng gợi ý' phải DISABLED nhìn thấy trong lúc accept đang bay",
    );

    // User gõ tiếp TRONG lúc ghi nhận đang bay (cửa sổ roundtrip).
    const textAfterTyping = "Bản gốc khi tạo gợi ý (user vừa gõ thêm)";
    textarea.value = textAfterTyping;
    textarea.dispatchEvent(new domWindow.Event("input", { bubbles: true }));

    // accept resolve sau đó -> KHÔNG được điền suggested_text đè lên text mới.
    behavior.deferredAccept.shift()({ suggestion_id: "sg-t", status: "accepted" });
    await wait(40);

    assert.equal(textarea.value, textAfterTyping,
      "suggested_text KHÔNG được điền đè lên nội dung mới hơn của user");
    const cardAfter = el.querySelector(".fb-compose__ai-suggestion");
    assert.ok(cardAfter, "thẻ gợi ý giữ lại (chuyển stale) để user đọc/đổi quyết định");
    assert.ok(
      textOf(cardAfter).includes("Nội dung đã thay đổi kể từ khi tạo gợi ý"),
      "banner stale phải xuất hiện ngay khi accept resolve lệch revision",
    );
    assert.ok(
      findButton(cardAfter, "Dùng gợi ý").disabled,
      "stale -> 'Dùng gợi ý' khóa",
    );
    assert.ok(findButton(cardAfter, "Tạo gợi ý mới"), "còn đường 'Tạo gợi ý mới'");
    unmount(host);
  });

  it("inputRevision tăng theo TỪNG keystroke (input event) và gửi kèm refine (C4)", async () => {
    withSession();
    const behavior = {};
    const { ctx } = makeCtx({ demo: false, role: "student", adapter: f04Adapter({ behavior }) });
    const { host, el } = mount(compose, ctx);
    await wait(60);

    const textarea = el.querySelector("#fb-compose-body");
    // 3 input event liên tiếp (mô phỏng 3 lần gõ) rồi mới bấm AI.
    textarea.value = "C";
    textarea.dispatchEvent(new domWindow.Event("input", { bubbles: true }));
    textarea.value = "Co ";
    textarea.dispatchEvent(new domWindow.Event("input", { bubbles: true }));
    textarea.value = "Con tức quá.";
    textarea.dispatchEvent(new domWindow.Event("input", { bubbles: true }));
    await wait(30);
    el.querySelector(".fb-compose__ai-btn").click();
    await wait(30);

    assert.equal(behavior.aiRefineCalls.length, 1);
    // revision bắt đầu 1 + 3 input events = 4 (IME cũng là input event — trung thực).
    assert.equal(behavior.aiRefineCalls[0].inputRevision, 4,
      `inputRevision phải tăng mỗi input event (nhận: ${behavior.aiRefineCalls[0].inputRevision})`);
    unmount(host);
  });
});

describe("F04 web — C3 consent sheet", () => {
  it("chưa consent -> sheet disclosure; decline -> recordConsent(declined) + manual vẫn dùng được, không gọi refine", async () => {
    withSession();
    const behavior = { consentRows: [
      { purpose: "ai_processing", decision: "none", policy_version: null, withdrawn: false },
    ] };
    const { ctx } = makeCtx({ demo: false, role: "student", adapter: f04Adapter({ behavior }) });
    const { host, el } = mount(compose, ctx);
    await wait(60);

    const textarea = el.querySelector("#fb-compose-body");
    textarea.value = "Con muốn nói với mẹ...";
    textarea.dispatchEvent(new domWindow.Event("input", { bubbles: true }));
    await wait(30);
    el.querySelector(".fb-compose__ai-btn").click();
    await wait(30);

    const sheet = document.body.querySelector(".fb-sheet");
    assert.ok(sheet, "phải mở sheet disclosure trước lần dùng AI đầu");
    const sheetText = textOf(sheet);
    assert.ok(sheetText.includes("Gemini của Google"), "nêu rõ dịch vụ Gemini");
    assert.ok(sheetText.includes("BÊN XỬ LÝ KỸ THUẬT"), "Gemini là bên xử lý kỹ thuật");
    assert.ok(sheetText.includes("không phải người thân"), "không phải người thân đọc tin");
    assert.ok(sheetText.includes("ai-v1"), "ghi phiên bản policy hiện hành");
    assert.ok(!/riêng tư tuyệt đối|mã hóa/i.test(sheetText), "không hứa riêng tư tuyệt đối/mã hóa");
    assert.ok(!/lượt dùng|quota|huấn luyện/i.test(sheetText), "không bịa quota/retention/training claim");

    findButton(sheet, "Tiếp tục viết tay").click();
    await wait(30);

    assert.deepEqual(behavior.recordConsentCalls.map((c) => c.decision), ["declined"],
      "decline phải được ghi nhận");
    assert.equal(behavior.aiRefineCalls, undefined, "decline -> KHÔNG gọi refine");
    assert.equal(textarea.value, "Con muốn nói với mẹ...", "manual text giữ nguyên");
    assert.ok(
      textOf(el).includes("viết tay"),
      "copy decline phải khẳng định đường manual còn dùng được",
    );
    // Manual path vẫn chạy thật: lưu nháp OK.
    findButton(el, "Lưu nháp riêng").click();
    await wait(30);
    assert.ok(
      textOf(el).includes("máy chủ"),
      "sau decline vẫn lưu nháp được (manual path thật)",
    );
    unmount(host);
  });

  it("403 consent_required sau khi consent bị rút -> sheet mở lại; đồng ý -> recordConsent(accepted) rồi refine, không loop vô hạn", async () => {
    withSession();
    const behavior = {};
    const { ctx } = makeCtx({ demo: false, role: "student", adapter: f04Adapter({ behavior }) });
    const { host, el } = mount(compose, ctx);
    await wait(60);

    const textarea = await openSuggestion(el, null, behavior, "Con buồn quá.");
    assert.ok(textOf(el).includes("Bản êm hơn: Con buồn quá."), "luồng consent sẵn chạy thẳng");

    // Consent bị rút phía server + 403 consent_required ở lượt dùng sau.
    behavior.refineError = new ApiError("Cần đồng ý xử lý AI.", 403, "http", { code: "consent_required" });
    behavior.consentRows = [
      { purpose: "ai_processing", decision: "none", policy_version: null, withdrawn: true },
    ];
    el.querySelector(".fb-compose__ai-btn").click();
    await wait(40);
    // Cache consent bị vô hiệu -> kiểm tra lại listConsents -> thiếu -> sheet.
    const sheet = document.body.querySelector(".fb-sheet");
    assert.ok(sheet, "403 consent_required phải mở sheet disclosure");
    findButton(sheet, "Đồng ý và tạo gợi ý").click();
    await wait(40);
    assert.deepEqual(
      (behavior.recordConsentCalls || []).map((c) => c.decision),
      ["accepted"],
      "accept phải ghi nhận accepted",
    );
    // Server vẫn lỗi refine (giữ refineError) -> phải dừng ở lỗi trung thực,
    // KHÔNG loop gọi lại vô hạn (đơn vị đếm refine calls là hữu hạn).
    assert.ok(behavior.aiRefineCalls.length >= 2, "đã thử lại sau consent");
    assert.ok(el.querySelector(".fb-ai-assist__error"), "kẹt 403 sau consent -> lỗi trung thực");
    unmount(host);
  });

  it("consent sai phiên bản policy (current=false) -> phải hỏi lại, không tự coi là đã đồng ý", () => {
    // Đơn vị test tại tầng helper vì semantics quan trọng cho parity 2 chiều.
    return (async () => {
      const { findActiveAiConsent } = await import("../src/components/ai-assist.js");
      assert.equal(findActiveAiConsent([
        { purpose: "ai_processing", decision: "accepted", policy_version: "ai-v1", withdrawn: false, current: true },
      ]) !== null, true, "current=true + accepted -> active");
      assert.equal(findActiveAiConsent([
        { purpose: "ai_processing", decision: "accepted", policy_version: "ai-v0", withdrawn: false, current: false },
      ]), null, "current=false -> phải hỏi lại");
      assert.equal(findActiveAiConsent([
        { purpose: "ai_processing", decision: "accepted", policy_version: "ai-v9", withdrawn: false },
      ]), null, "lech policy version (không có current) -> phải hỏi lại");
      assert.equal(findActiveAiConsent([
        { purpose: "ai_processing", decision: "accepted", policy_version: "ai-v1", withdrawn: true, current: true },
      ]), null, "withdrawn -> không active");
      assert.equal(findActiveAiConsent([
        { purpose: "research", decision: "accepted", policy_version: "ai-v1", current: true },
      ]), null, "purpose khác -> không tính");
      assert.equal(findActiveAiConsent([
        { purpose: "ai_processing", decision: "granted", policy_version: null, withdrawn: false },
      ]) !== null, true, "tương thích từ vựng 'granted' của backend (C1)");
    })();
  });
});

describe("F04 web — C5 error trung thực + manual fallback", () => {
  it("503/timeout khi refine -> panel lỗi trung thực, bản soạn nguyên, lưu nháp vẫn chạy", async () => {
    withSession();
    const behavior = { refineError: new ApiError("Service Unavailable", 503, "http") };
    const { ctx } = makeCtx({ demo: false, role: "student", adapter: f04Adapter({ behavior }) });
    const { host, el } = mount(compose, ctx);
    await wait(60);

    const textarea = el.querySelector("#fb-compose-body");
    textarea.value = "Bản soạn giữ nguyên khi AI lỗi.";
    textarea.dispatchEvent(new domWindow.Event("input", { bubbles: true }));
    await wait(30);
    el.querySelector(".fb-compose__ai-btn").click();
    await wait(30);

    const errorPanel = el.querySelector(".fb-ai-assist__error");
    assert.ok(errorPanel, "phải có panel lỗi trung thực");
    assert.ok(textOf(errorPanel).includes("tạm không khả dụng"), "503 -> đúng thông điệp unavailable");
    assert.ok(textOf(errorPanel).includes("viết tay vẫn dùng được"), "luôn chỉ ra manual path");
    assert.equal(textarea.value, "Bản soạn giữ nguyên khi AI lỗi.", "bản soạn không bị đụng");
    assert.equal(behavior.aiAcceptCalls, undefined);

    findButton(el, "Lưu nháp riêng").click();
    await wait(30);
    assert.ok(findButton(el, "Xem trước nội dung"), "manual path đầy đủ vẫn hiện");
    unmount(host);
  });

  it("aiStatus lỗi mạng -> nút disabled + 'chưa kiểm tra được' (không giả AI off, không giả AI on)", async () => {
    withSession();
    const behavior = { aiStatusError: true };
    const adapter = f04Adapter({ behavior });
    adapter.aiStatus = async () => { throw new ApiError("network", 0, "network"); };
    const { ctx } = makeCtx({ demo: false, role: "student", adapter });
    const { host, el } = mount(compose, ctx);
    await wait(60);
    const pill = el.querySelector(".fb-compose__ai-btn");
    assert.ok(pill.disabled, "không rõ trạng thái -> không cho bấm mạo");
    assert.ok(textOf(el).includes("Chưa kiểm tra được trạng thái"), "trung thực về trạng thái không rõ");
    unmount(host);
  });

  it("loading có 'Hủy chờ gợi ý' (frame 04): hủy cục bộ -> response cũ bị bỏ qua, không tự retry, bấm lại là lượt mới (key mới)", async () => {
    withSession();
    const behavior = { deferRefine: true };
    const { ctx } = makeCtx({ demo: false, role: "student", adapter: f04Adapter({ behavior }) });
    const { host, el } = mount(compose, ctx);
    await wait(60);

    const textarea = el.querySelector("#fb-compose-body");
    textarea.value = "Bản soạn chờ bị hủy";
    textarea.dispatchEvent(new domWindow.Event("input", { bubbles: true }));
    await wait(30);
    el.querySelector(".fb-compose__ai-btn").click();
    await wait(30);

    assert.ok(textOf(el).includes("Đang tạo gợi ý"), "loading inline đang hiện");
    assert.ok(
      textOf(el).includes("Bạn vẫn gõ tiếp"),
      "loading không chặn gõ/lưu nháp (copy trung thực)",
    );
    const cancelBtn = findButton(el, "Hủy chờ gợi ý");
    assert.ok(cancelBtn, "loading phải có nút Hủy chờ (frame zalo_f04_04)");

    cancelBtn.click();
    await wait(30);
    assert.ok(!el.querySelector(".fb-ai-assist__loading"), "hủy -> thoát loading");
    assert.ok(textOf(el).includes("đã hủy chờ"), "ghi nhận hủy trung thực");
    assert.equal(
      el.querySelector(".fb-compose__ai-btn").disabled, false,
      "CTA mở lại sau khi hủy chờ",
    );
    assert.equal(behavior.aiRefineCalls.length, 1, "hủy KHÔNG tự gọi lại refine");

    // Response cũ về muộn -> phải bị bỏ qua (không đè lên bản soạn).
    const echoLate = behavior.aiRefineCalls[0].inputRevision;
    behavior.deferred.shift()(
      suggestionDto({ text: "Bản soạn chờ bị hủy", id: "sg-late-cancel", echo: echoLate }),
    );
    await wait(40);
    assert.ok(
      !el.querySelector(".fb-compose__ai-suggestion"),
      "response sau hủy KHÔNG được render",
    );
    assert.equal(textarea.value, "Bản soạn chờ bị hủy", "bản soạn giữ nguyên");

    // Bấm lại = lượt refine MỚI (key idempotency mới), không phải retry lượt cũ.
    el.querySelector(".fb-compose__ai-btn").click();
    await wait(30);
    assert.equal(behavior.aiRefineCalls.length, 2, "bấm lại tạo lượt refine mới");
    assert.notEqual(
      behavior.aiRefineCalls[1].key, behavior.aiRefineCalls[0].key,
      "lượt mới dùng key idempotency mới (không replay key cũ)",
    );
    const echoNew = behavior.aiRefineCalls[1].inputRevision;
    behavior.deferred.shift()(
      suggestionDto({ text: "Bản soạn chờ bị hủy", id: "sg-after-cancel", echo: echoNew }),
    );
    await wait(30);
    assert.ok(el.querySelector(".fb-compose__ai-suggestion"), "lượt mới trả gợi ý bình thường");
    unmount(host);
  });
});

describe("F04 web — C6 apply không gửi, an toàn render", () => {
  it("apply/discard không gọi confirmDraftSend/sendMessage; suggestion chứa HTML -> render textContent thuần", async () => {
    withSession();
    const behavior = {};
    const adapter = f04Adapter({ behavior });
    adapter.sendMessage = async () => { throw new Error("KHÔNG được gọi"); };
    adapter.aiRefine = async (args = {}) => ({
      suggestion_id: "sg-x",
      suggested_text: "<img src=x onerror=alert(1)>Chào mẹ nhe",
      input_revision: args.inputRevision,
    });
    const { ctx } = makeCtx({ demo: false, role: "student", adapter });
    const { host, el } = mount(compose, ctx);
    await wait(60);

    const textarea = el.querySelector("#fb-compose-body");
    textarea.value = "chao me";
    textarea.dispatchEvent(new domWindow.Event("input", { bubbles: true }));
    await wait(30);
    el.querySelector(".fb-compose__ai-btn").click();
    await wait(30);

    const card = el.querySelector(".fb-compose__ai-suggestion");
    assert.equal(card.querySelectorAll("img").length, 0, "SEC-12: cấm innerHTML — không được tạo thẻ img");
    assert.ok(textOf(card).includes("<img src=x onerror=alert(1)>"), "chuỗi phải render như text");

    findButton(card, "Dùng gợi ý").click();
    await wait(30);
    assert.equal(textarea.value, "<img src=x onerror=alert(1)>Chào mẹ nhe", "apply chỉ điền textarea");
    assert.equal(behavior.confirmCalls, undefined, "apply KHÔNG confirm-send");
    unmount(host);
  });

  it("unmount giữa request đang bay -> response cũ không đụng DOM, không throw", async () => {
    withSession();
    const behavior = { deferRefine: true };
    const { ctx } = makeCtx({ demo: false, role: "student", adapter: f04Adapter({ behavior }) });
    const { host, el } = mount(compose, ctx);
    await wait(60);

    const textarea = el.querySelector("#fb-compose-body");
    textarea.value = "Đang chờ response...";
    textarea.dispatchEvent(new domWindow.Event("input", { bubbles: true }));
    await wait(30);
    el.querySelector(".fb-compose__ai-btn").click();
    await wait(30);

    unmount(host); // unmount/logout giữa chừng
    behavior.deferred.shift()(suggestionDto({ text: "Đang chờ response...", id: "sg-late" }));
    await wait(40);
    assert.ok(true, "không throw khi response về sau unmount");
    assert.equal(document.body.querySelectorAll(".fb-sheet").length, 0, "sheet consent đã đóng sạch");
  });
});

describe("F04 web — caregiver variant + receipt + responsive smoke", () => {
  it("caregiver: CÙNG component/classes, copy xưng hô khác ('Lời bạn muốn gửi')", async () => {
    withSession();
    const behavior = {};
    const { ctx } = makeCtx({ demo: false, role: "caregiver", adapter: f04Adapter({ behavior }) });
    const { host, el } = mount(compose, ctx);
    await wait(60);

    assert.ok(textOf(el).includes("Lời bạn muốn gửi"), "label caregiver phải khác student");
    assert.ok(el.querySelector("#fb-compose-body"), "cùng editor");
    assert.ok(el.querySelector(".fb-ai-assist"), "cùng khối AI assist (component chung)");
    assert.ok(el.querySelector(".fb-compose__ai-btn"), "cùng nút AI");
    assert.ok(!textOf(el).includes("Lời con muốn gửi"), "không lẫn copy student");

    const textarea = await openSuggestion(el, null, behavior, "Con đang lo cho mẹ quá");
    const card = el.querySelector(".fb-compose__ai-suggestion");
    assert.ok(card && textOf(card).includes("Bản êm hơn: Con đang lo cho mẹ quá"),
      "caregiver dùng được AI với cùng semantics");
    unmount(host);
  });

  it("receipt 'sent': chỉ sau response thành công; receipt 'unknown' khi lỗi -> không tự retry, có nút kiểm tra", async () => {
    withSession();
    // Draft paused + hết giờ -> preview mở -> confirm -> lỗi timeout.
    const behavior = {
      drafts: [{
        draft_id: "d-1", revision: 3, status: "paused",
        pause: { remaining_seconds: 0, can_preview: true },
        recipient_id: "u-care-1", body: "Lời nhắn hết giờ dừng.",
      }],
      confirmError: new ApiError("Kết nối quá thời gian chờ.", 0, "timeout"),
    };
    const { ctx } = makeCtx({ demo: false, role: "student", adapter: f04Adapter({ behavior }) });
    const { host, el } = mount(compose, ctx);
    await wait(60);

    const previewBtn = el.querySelector(".fb-btn-hero");
    assert.equal(previewBtn.disabled, false, "máy chủ báo hết giờ -> preview mở");
    previewBtn.click();
    await wait(30);
    const sheet = document.body.querySelector(".fb-sheet");
    assert.ok(sheet, "preview -> sheet xác nhận");
    const confirmBtn = findButton(sheet, "Gửi cho Người chăm sóc Test");
    assert.ok(confirmBtn, "nút gửi nêu rõ người nhận");
    confirmBtn.click();
    await wait(40);
    assert.equal(behavior.confirmCalls, 1, "confirm gọi đúng 1 lần");

    const receipt = el.querySelector(".fb-compose__receipt");
    assert.ok(receipt, "phải có bảng kết quả gửi");
    assert.ok(receipt.classList.contains("fb-compose__receipt--unknown"), "lỗi timeout -> trạng thái chưa xác định");
    assert.ok(textOf(receipt).includes("KẾT QUẢ CHƯA XÁC ĐỊNH"), "copy trung thực chưa xác định");
    assert.ok(textOf(receipt).includes("không gửi lại ngay"), "không khuyến khích gửi lại ngay");
    assert.ok(findButton(receipt, "Kiểm tra trạng thái mới nhất"), "có đường kiểm tra thật");
    assert.equal(behavior.confirmCalls, 1, "KHÔNG tự retry gửi");
    unmount(host);
  });

  it("receipt 'sent' khi máy chủ xác nhận; reset về bản soạn mới", async () => {
    withSession();
    const behavior = {
      drafts: [{
        draft_id: "d-1", revision: 3, status: "paused",
        pause: { remaining_seconds: 0, can_preview: true },
        recipient_id: "u-care-1", body: "Lời nhắn hết giờ dừng.",
      }],
    };
    const { ctx } = makeCtx({ demo: false, role: "student", adapter: f04Adapter({ behavior }) });
    const { host, el } = mount(compose, ctx);
    await wait(60);
    el.querySelector(".fb-btn-hero").click();
    await wait(30);
    const sheet = document.body.querySelector(".fb-sheet");
    findButton(sheet, "Gửi cho Người chăm sóc Test").click();
    await wait(40);
    const receipt = el.querySelector(".fb-compose__receipt");
    assert.ok(receipt && receipt.classList.contains("fb-compose__receipt--sent"), "response thành công -> sent receipt");
    assert.ok(textOf(receipt).includes("Máy chủ xác nhận"), "sent phải do máy chủ xác nhận");
    assert.equal(el.querySelector("#fb-compose-body").value, "", "reset về bản soạn mới");
    assert.equal(behavior.confirmCalls, 1);
    unmount(host);
  });

  it("responsive/palette smoke (source-level): grid 2 cột chỉ >=1024px; palette F04 đủ 6 màu; touch 44px; không hero ảnh", () => {
    const shell = readFileSync(join(ROOT, "src/styles/shell.css"), "utf8");
    const components = readFileSync(join(ROOT, "src/styles/components.css"), "utf8");
    const composeSrc = readFileSync(join(ROOT, "src/pages/compose/index.js"), "utf8");

    // C7: 320px không scroll ngang — grid 2 cột CHỈ trong media >=1024px.
    const gridIdx = shell.indexOf(".fb-compose-grid {");
    const mediaBeforeGrid = shell.lastIndexOf("@media (min-width: 1024px)", gridIdx);
    assert.ok(mediaBeforeGrid !== -1 && mediaBeforeGrid < gridIdx,
      ".fb-compose-grid phải nằm trong media query >=1024px (mobile 1 cột)");

    // Palette bắt buộc handoff: 6 màu + panel phụ phải xuất hiện trong CSS F04.
    for (const hex of ["#FFF4E8", "#713D32", "#C65B43", "#E4AB56", "#A84733", "#FAF0E4"]) {
      assert.ok(
        shell.includes(hex) || components.includes(hex),
        `palette F04 thiếu ${hex}`,
      );
    }

    // Touch targets: nút AI >= 44px (C7).
    assert.ok(/\.fb-ai-assist \.fb-compose__ai-btn[\s\S]*min-height: 44px/.test(components),
      "nút AI phải >=44px touch target");

    // Không hero ảnh trang trí làm chậm composer (03-THIET-KE §4).
    assert.ok(!/<img/.test(composeSrc), "compose không chèn <img> trang trí");
    assert.ok(!composeSrc.includes("background-image"), "compose không dùng ảnh nền hero");

    // Không fake keyboard/frame Zalo: không vẽ bàn phím giả trên web.
    assert.ok(!/keyboard-open|fake-keyboard|zalo-keyboard/i.test(shell + components),
      "web không vẽ bàn phím giả (keyboard variant = usability thật)");
  });

  it("message reply dùng CÙNG khối assist + suggested_text (parity 2 chiều frame 13)", async () => {
    withSession();
    const behavior = {
      aiStatusResult: { ai_enabled: true },
      consentRows: GRANTED_CONSENT,
    };
    const adapter = f04Adapter({ behavior });
    adapter.getMessage = async () => ({
      message_id: "m-1", kind: "text", direction: "received",
      counterparty_id: "u-care-1", title: "Lời nhắn từ bố",
      body: "Con khỏe không?", created_at: "2026-10-24T03:30:00Z",
      read: false, reply_to: null,
    });
    adapter.listMessages = async () => ({ results: [], nextCursor: null });
    adapter.quickReplies = async () => ({ results: [], note: "library_not_configured" });
    adapter.markMessageRead = async () => ({ read: true });
    const { ctx } = makeCtx({
      demo: false, role: "student", adapter, params: "id=m-1",
    });
    const { host, el } = mount(messagePage, ctx);
    await wait(60);

    assert.ok(el.querySelector(".fb-ai-assist"), "reply phải dùng cùng component AI assist");
    const textarea = el.querySelector("textarea");
    textarea.value = "Con vẫn ổn.";
    textarea.dispatchEvent(new domWindow.Event("input", { bubbles: true }));
    await wait(20);
    el.querySelector(".fb-compose__ai-btn").click();
    await wait(30);
    const card = el.querySelector(".fb-compose__ai-suggestion");
    assert.ok(card && textOf(card).includes("Bản êm hơn: Con vẫn ổn."), "reply render suggested_text");
    unmount(host);
    clearSession();
  });

  it("chọn người nhận: sheet chỉ liệt kê kết nối active; chọn -> hiện đúng người, không tự gửi (frame 09)", async () => {
    withSession();
    const behavior = {};
    const adapter = f04Adapter({ behavior });
    adapter.listConnections = async () => ({
      results: [
        {
          connection_id: "c-1", status: "active", relationship_kind: "primary",
          generation: 1, other_party_id: "u-care-1",
          counterpart: { display_name: "Người chăm sóc Test", identity_basis: "self_declared" },
        },
        {
          connection_id: "c-2", status: "pending", relationship_kind: "primary",
          generation: 1, other_party_id: "u-pending",
          counterpart: { display_name: "Kết nối chưa xác nhận", identity_basis: "self_declared" },
        },
      ],
      nextCursor: null,
    });
    const { ctx } = makeCtx({ demo: false, role: "student", adapter });
    const { host, el } = mount(compose, ctx);
    await wait(60);

    assert.ok(
      textOf(el).includes("Người chăm sóc Test"),
      "người nhận mặc định = kết nối active đầu tiên",
    );
    findButton(el, "Đổi").click();
    await wait(30);
    const sheet = document.body.querySelector(".fb-sheet");
    assert.ok(sheet, "phải mở sheet chọn người nhận");
    assert.ok(textOf(sheet).includes("Chọn người nhận"));
    assert.ok(textOf(sheet).includes("Người chăm sóc Test"), "active connection phải liệt kê");
    assert.ok(!textOf(sheet).includes("Kết nối chưa xác nhận"), "không active -> không liệt kê");
    findButton(sheet, "Người chăm sóc Test").click();
    await wait(30);
    assert.ok(textOf(el).includes("Người chăm sóc Test"), "chọn xong hiển thị đúng người nhận");
    assert.equal(behavior.confirmCalls, undefined, "chọn người nhận KHÔNG tự gửi");
    unmount(host);
  });
});

describe("F04 web — C8 preview (R2A3-01 web) + preview dùng bản đã sửa (R4A5-03)", () => {
  const EDITING_DRAFT = {
    draft_id: "d-edit", revision: 2, status: "editing", pause: null,
    recipient_id: "u-care-1", body: "Nháp chưa pause.",
  };

  it("draft CHƯA pause -> 'Xem trước nội dung' mở ngay (C8: khoảng dừng tuỳ chọn, không bắt buộc)", async () => {
    withSession();
    const behavior = { drafts: [{ ...EDITING_DRAFT }] };
    const { ctx } = makeCtx({ demo: false, role: "student", adapter: f04Adapter({ behavior }) });
    const { host, el } = mount(compose, ctx);
    await wait(60);

    const previewBtn = el.querySelector(".fb-btn-hero");
    assert.ok(previewBtn, "nút xem trước có mặt");
    assert.equal(previewBtn.disabled, false,
      "chưa pause -> KHÔNG bị khóa preview ở client (backend cho phép preview/confirm)");
    assert.equal(previewBtn.title, "",
      "không còn title sai hợp đồng 'Cần ... hoàn thành khoảng dừng trước khi xem trước'");

    previewBtn.click();
    await wait(30);
    assert.equal(behavior.previewCalls, 1, "previewDraft gọi thật đúng 1 lần");
    const sheet = document.body.querySelector(".fb-sheet");
    assert.ok(sheet, "preview -> sheet xác nhận gửi");
    unmount(host);
  });

  it("paused còn deadline -> preview vẫn chặn kèm thông báo cooldown trung thực (server sẽ 409)", async () => {
    withSession();
    const behavior = {
      drafts: [{
        ...EDITING_DRAFT, status: "paused",
        pause: { remaining_seconds: 299, deadline: "2026-10-16T00:04:59Z", can_preview: false },
      }],
    };
    const { ctx } = makeCtx({ demo: false, role: "student", adapter: f04Adapter({ behavior }) });
    const { host, el } = mount(compose, ctx);
    await wait(60);

    const previewBtn = el.querySelector(".fb-btn-hero");
    assert.equal(previewBtn.disabled, true, "đang paused còn giờ -> preview chặn");
    assert.ok(
      previewBtn.title.includes("còn khoảng dừng"),
      "lý do chặn nêu rõ khoảng dừng (trung thực)",
    );
    assert.equal(behavior.previewCalls, undefined, "chưa bấm được -> chưa gọi preview");
    unmount(host);
  });

  it("apply AI -> user sửa tiếp -> preview dùng bản ĐÃ SỬA (không phải suggested_text gốc) (R4A5-03)", async () => {
    withSession();
    const behavior = { drafts: [{ ...EDITING_DRAFT }] };
    const { ctx } = makeCtx({ demo: false, role: "student", adapter: f04Adapter({ behavior }) });
    const { host, el } = mount(compose, ctx);
    await wait(60);

    const textarea = await openSuggestion(el, null, behavior, "Con muốn nói với mẹ");
    findButton(el.querySelector(".fb-compose__ai-suggestion"), "Dùng gợi ý").click();
    await wait(40);
    assert.equal(textarea.value, "Bản êm hơn: Con muốn nói với mẹ", "apply điền suggested_text");

    // User sửa TIẾP sau khi dùng gợi ý — bản này mới là ý định hiện tại.
    const edited = "Bản êm hơn: Con muốn nói với mẹ (con đã chỉnh thêm)";
    textarea.value = edited;
    textarea.dispatchEvent(new domWindow.Event("input", { bubbles: true }));

    // Lưu nháp -> body lưu lên máy chủ phải là bản ĐÃ SỬA.
    findButton(el, "Lưu nháp riêng").click();
    await wait(30);
    assert.deepEqual(
      behavior.editDraftBodies,
      [edited],
      "editDraft phải nhận body bản ĐÃ SỬA (không phải suggested_text gốc)",
    );

    // Preview phải đi qua bản đã sửa: sheet hiển thị text hiện hành của user.
    el.querySelector(".fb-btn-hero").click();
    await wait(30);
    assert.equal(behavior.previewCalls, 1, "previewDraft gọi đúng 1 lần");
    const sheet = document.body.querySelector(".fb-sheet");
    assert.ok(sheet, "preview -> sheet xác nhận");
    const previewBody = sheet.querySelector(".fb-compose__preview-body");
    assert.ok(previewBody, "sheet có khối nội dung xem trước");
    assert.equal(
      textOf(previewBody), edited,
      "sheet xem trước hiển thị bản ĐÃ SỬA của user — không phải suggested_text gốc",
    );
    unmount(host);
  });

  it("R01 (QA 18/10) — Dùng gợi ý KHÔNG lưu nháp -> preview TỰ ĐỒNG BỘ final lên máy chủ, confirm gửi đúng bản đã duyệt (không còn gửi original cũ)", async () => {
    withSession();
    // Đúng 5 bước QA R01: server CÓ draft chứa original + recipient hợp lệ;
    // UI lấy AI suggestion -> Dùng gợi ý; KHÔNG lưu nháp thêm; preview + confirm.
    const behavior = { drafts: [{ ...EDITING_DRAFT }] };
    const { ctx } = makeCtx({ demo: false, role: "student", adapter: f04Adapter({ behavior }) });
    const { host, el } = mount(compose, ctx);
    await wait(60);

    await openSuggestion(el, null, behavior, "Con muốn nói với mẹ");
    findButton(el.querySelector(".fb-compose__ai-suggestion"), "Dùng gợi ý").click();
    await wait(40);
    const finalText = el.querySelector("#fb-compose-body").value;
    assert.equal(finalText, "Bản êm hơn: Con muốn nói với mẹ",
      "textarea + sheet sẽ hiển thị final mới");

    // Preview TRỰC TIẾP (không lưu nháp) — phải tự đồng bộ final trước.
    el.querySelector(".fb-btn-hero").click();
    await wait(40);
    assert.deepEqual(
      behavior.editDraftBodies,
      [finalText],
      "preview phải editDraft ĐÚNG text final đang hiển thị (sync trước khi bind)",
    );
    assert.equal(behavior.previewCalls, 1, "preview gọi sau khi đồng bộ");
    const sheet = document.body.querySelector(".fb-sheet");
    assert.ok(sheet, "preview -> sheet xác nhận");
    assert.equal(
      textOf(sheet.querySelector(".fb-compose__preview-body")), finalText,
      "sheet hiển thị đúng bản đã duyệt",
    );
    findButton(sheet, "Gửi cho Người chăm sóc Test").click();
    await wait(40);
    assert.equal(behavior.confirmCalls, 1, "confirm gửi bản đã đồng bộ");
    unmount(host);
  });

  it("R01 (QA 18/10) — textarea rỗng -> preview DỪNG ở client, không bind nhầm bản cũ trên máy chủ", async () => {
    withSession();
    const behavior = { drafts: [{ ...EDITING_DRAFT }] };
    const { ctx } = makeCtx({ demo: false, role: "student", adapter: f04Adapter({ behavior }) });
    const { host, el } = mount(compose, ctx);
    await wait(60);

    el.querySelector("#fb-compose-body").value = "   ";
    el.querySelector(".fb-btn-hero").click();
    await wait(40);
    assert.equal(behavior.previewCalls, undefined,
      "không gọi preview khi nội dung rỗng (tránh gửi bản cũ)");
    assert.ok(textOf(el).includes("chưa có nội dung"), "báo trung thực cho user");
    unmount(host);
  });
});

/* ============ R04/R05 (QA F04 18/10): desktop shell + layout guard ============ */
describe("R04/R05 (QA F04 18/10): compose web bọc app-shell desktop; CSS chống tràn + hidden guard", () => {

  it("R04 — compose page phải render trong app-shell (chrome 'app') như các trang web desktop khác", () => {
    assert.equal(compose.chrome, "app",
      "không có shell -> .fb-page cap 480px, grid co 84px/340px, textarea 52px (QA R04)");
  });

  it("R04 — root class fb-page--web (nâng cap 480px của mobile contract khi vào shell)", () => {
    const composeSrc = readFileSync(join(ROOT, "src/pages/compose/index.js"), "utf8");
    assert.match(composeSrc, /class:\s*"fb-page fb-page--web"/,
      "root phải dùng fb-page--web (max-width 880px) trong shell");
  });

  it("R05 — base.css có guard toàn cục [hidden]; CSS compose không còn min-content đẩy ngang", () => {
    const base = readFileSync(join(ROOT, "src/styles/base.css"), "utf8");
    assert.match(base, /\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
    const components = readFileSync(join(ROOT, "src/styles/components.css"), "utf8");
    const aiBtnIdx = components.indexOf(".fb-compose__ai-btn {");
    const aiBtnBlock = components.slice(aiBtnIdx, components.indexOf("}", aiBtnIdx));
    assert.match(aiBtnBlock, /white-space:\s*normal/,
      "nowrap đẩy min-content trong cột phải 340px + viewport <480px");
    const gridIdx = components.indexOf(".fb-compose__pause-buttons {");
    const gridBlock = components.slice(gridIdx, components.indexOf("}", gridIdx));
    assert.match(gridBlock, /minmax\(0,\s*1fr\)/);
    const shell = readFileSync(join(ROOT, "src/styles/shell.css"), "utf8");
    assert.match(shell, /\.fb-compose__ai \.fb-sec__row\s*\{\s*flex-wrap:\s*wrap;/);
  });
});
