// tests/f04-contract.test.mjs — regression hợp đồng F04 theo freeze contract v1
// (C1–C9, F04-HANDOFF). Phạm vi A1: shared http-endpoints + mock-adapter.
//  - C2: aiRefine body {original_text, purpose, input_revision?} — legacy hợp lệ.
//  - C3: DTO pass-through NGUYÊN VẸN — `suggested_text` là tên duy nhất,
//    KHÔNG refined_text; echo input_revision không bị adapter đổi tên.
//  - C4: consents mapping {purpose, policy_version, decision} (gate server-side).
//  - C6/C8: replay idempotency + editDraft KHÔNG gửi kind; pause chỉ chặn khi
//    ĐÃ chọn (mock không ép preview/send chờ 300s khi chưa chọn pause).
//  - Pagination mapping: F05/F07 dùng page_size + next; F06 server_time/pause_seconds.
// Chạy: node --test packages/family_bridge_shared/tests/f04-contract.test.mjs
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import { ApiError, createApiClient } from "../src/api/client.mjs";
import { clearSession, setSession } from "../src/session.js";
import { createHttpEndpoints } from "../src/adapter/http-endpoints.js";
import { createMockAdapter } from "../src/adapter/mock-adapter.js";

function jsonResponse(data, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

function makeEndpoints() {
  const baseUrl = "https://backend.example";
  const request = createApiClient({ baseUrl, getToken: () => "tok", timeoutMs: 15000 });
  return createHttpEndpoints({
    request,
    authed: (run) => run(),
    requireBaseUrl: () => {},
    staleSessionError: () => new ApiError("stale", 0, "stale_session"),
    coldStartTimeoutMs: 60000,
  });
}

async function captureFetch(handler) {
  const calls = [];
  mock.method(globalThis, "fetch", async (url, options = {}) => {
    const parsed = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ url: String(url), options, body: parsed });
    return handler ? handler(calls.length, url, parsed) : jsonResponse({});
  });
  return calls;
}

describe("F04 C2 — http aiRefine body mapping + idempotency header", () => {
  it("legacy: KHÔNG truyền inputRevision -> body {original_text, purpose} KHÔNG có input_revision", async () => {
    clearSession();
    setSession({ token: "tok", userId: "u", expiresAt: Date.now() + 60_000 });
    const calls = await captureFetch(() =>
      jsonResponse({ suggestion_id: "s1", suggested_text: "x", input_revision: null }, { status: 201 }));
    try {
      const endpoints = makeEndpoints();
      await endpoints.aiRefine({ text: "Con buồn lắm.", key: "key-legacy-1" });
      assert.equal(calls[0].url, "https://backend.example/api/v1/ai/refine");
      assert.equal(calls[0].options.method, "POST");
      assert.equal(calls[0].options.headers["X-Idempotency-Key"], "key-legacy-1");
      assert.deepEqual(calls[0].body, { original_text: "Con buồn lắm.", purpose: "refine_expression" });
      assert.ok(!("input_revision" in calls[0].body), "legacy payload không được gửi input_revision");
    } finally {
      clearSession();
      mock.restoreAll();
    }
  });

  it("C2: inputRevision nguyên dương -> body.input_revision = N (1..2147483647)", async () => {
    clearSession();
    setSession({ token: "tok", userId: "u", expiresAt: Date.now() + 60_000 });
    const calls = await captureFetch(() => jsonResponse({ suggestion_id: "s1" }, { status: 201 }));
    try {
      const endpoints = makeEndpoints();
      await endpoints.aiRefine({ text: "abc", key: "key-rev-7", inputRevision: 7 });
      assert.equal(calls[0].body.input_revision, 7);
      await endpoints.aiRefine({ text: "abc", key: "key-rev-max", inputRevision: 2147483647 });
      assert.equal(calls[1].body.input_revision, 2147483647);
    } finally {
      clearSession();
      mock.restoreAll();
    }
  });

  it("C2: inputRevision sai (0, âm, lẻ, chuỗi, quá 2^31-1) -> 400 input_invalid TRƯỚC fetch", async () => {
    clearSession();
    setSession({ token: "tok", userId: "u", expiresAt: Date.now() + 60_000 });
    let fetchCalled = false;
    mock.method(globalThis, "fetch", async () => { fetchCalled = true; return jsonResponse({}); });
    try {
      const endpoints = makeEndpoints();
      for (const bad of [0, -1, 2.5, "3", 2147483648, true]) {
        await assert.rejects(
          () => endpoints.aiRefine({ text: "abc", key: "k", inputRevision: bad }),
          (error) => error instanceof ApiError && error.status === 400
            && error.code === "input_invalid"
            && error.details && error.details.field === "input_revision",
          `inputRevision=${String(bad)} phải bị chặn trước fetch`,
        );
      }
      assert.equal(fetchCalled, false, "payload sai hợp lệ không được rời client");
    } finally {
      clearSession();
      mock.restoreAll();
    }
  });

  it("thiếu key -> ApiError kind configuration TRƯỚC fetch (C1: header bắt buộc)", async () => {
    clearSession();
    setSession({ token: "tok", userId: "u", expiresAt: Date.now() + 60_000 });
    let fetchCalled = false;
    mock.method(globalThis, "fetch", async () => { fetchCalled = true; return jsonResponse({}); });
    try {
      const endpoints = makeEndpoints();
      await assert.rejects(
        () => endpoints.aiRefine({ text: "abc" }),
        (error) => error.kind === "configuration",
      );
      assert.equal(fetchCalled, false);
    } finally {
      clearSession();
      mock.restoreAll();
    }
  });
});

describe("F04 C3 — http aiRefine DTO pass-through (không đổi tên field)", () => {
  it("response của máy chủ trả NGUYÊN VẸN: suggested_text + input_revision echo giữ nguyên", async () => {
    clearSession();
    setSession({ token: "tok", userId: "u", expiresAt: Date.now() + 60_000 });
    // Shape = AiSuggestion.view() thật + echo input_revision (A2 sẽ thêm).
    const serverDto = {
      suggestion_id: "0f3e6a2e-1111-4c1c-9c9c-000000000001",
      purpose: "refine_expression",
      status: "suggested",
      original_text: "Con tức quá.",
      suggested_text: "Con đang cảm thấy tức giận và muốn bố mẹ lắng nghe.",
      input_revision: 42,
      model_revision: "gemini-1.5-flash",
      prompt_revision: "f04-prompt-1",
      created_at: "2026-10-16T00:00:00+00:00",
      decided_at: null,
    };
    const calls = await captureFetch(() => jsonResponse(serverDto, { status: 201 }));
    try {
      const endpoints = makeEndpoints();
      const dto = await endpoints.aiRefine({ text: "Con tức quá.", key: "k-passthrough", inputRevision: 42 });
      assert.deepEqual(dto, serverDto, "adapter phải trả DTO nguyên vẹn (pass-through)");
      assert.equal(dto.suggested_text, serverDto.suggested_text);
      assert.equal(dto.input_revision, 42);
      assert.equal(dto.refined_text, undefined, "KHÔNG BAO GIỜ có refined_text");
      assert.equal(Object.keys(dto).length, Object.keys(serverDto).length,
        "adapter không được thêm/bớt field");
      assert.equal(calls.length, 1);
    } finally {
      clearSession();
      mock.restoreAll();
    }
  });
});

describe("C8 — http editDraft/createDraft (kind OPTIONAL khi edit)", () => {
  it("editDraft: body KHÔNG chứa `kind`, có body/title; createDraft: body CÓ kind", async () => {
    clearSession();
    setSession({ token: "tok", userId: "u", expiresAt: Date.now() + 60_000 });
    const calls = await captureFetch(() => jsonResponse({ draft_id: "d1", revision: 1 }));
    try {
      const endpoints = makeEndpoints();
      await endpoints.createDraft({ kind: "text", body: "nháp 1", recipientId: "r-1" });
      assert.equal(calls[0].url, "https://backend.example/api/v1/drafts");
      assert.equal(calls[0].body.kind, "text", "create PHẢI gửi kind");
      await endpoints.editDraft("d1", { body: "nháp đã sửa", title: "tiêu đề" });
      assert.equal(calls[1].url, "https://backend.example/api/v1/drafts/d1");
      assert.ok(!("kind" in calls[1].body), "edit KHÔNG được gửi kind (C8: kind optional)");
      assert.equal(calls[1].body.body, "nháp đã sửa");
      assert.equal(calls[1].body.title, "tiêu đề");
    } finally {
      clearSession();
      mock.restoreAll();
    }
  });
});

describe("C4 — consents mapping (gate consent là việc của MÁY CHỦ)", () => {
  it("recordConsent gửi {purpose, policy_version, decision}; listConsents đọc envelope consents[]", async () => {
    clearSession();
    setSession({ token: "tok", userId: "u", expiresAt: Date.now() + 60_000 });
    const calls = await captureFetch(() => jsonResponse({ consents: [{ purpose: "ai_processing", decision: "granted", policy_version: "ai-v1" }] }));
    try {
      const endpoints = makeEndpoints();
      await endpoints.recordConsent({ purpose: "ai_processing", policyVersion: "ai-v1", decision: "granted" });
      assert.equal(calls[0].url, "https://backend.example/api/v1/consents");
      assert.deepEqual(calls[0].body, { purpose: "ai_processing", policy_version: "ai-v1", decision: "granted" });
      const list = await endpoints.listConsents();
      assert.equal(list[0].purpose, "ai_processing");
    } finally {
      clearSession();
      mock.restoreAll();
    }
  });
});

describe("Pagination mapping (handoff 02 §4.6)", () => {
  it("listMessages: gửi page_size (KHÔNG phải limit) + map next -> nextCursor", async () => {
    clearSession();
    setSession({ token: "tok", userId: "u", expiresAt: Date.now() + 60_000 });
    const calls = await captureFetch(() => jsonResponse({ results: [{ message_id: "m1" }], next: "cursor-2" }));
    try {
      const endpoints = makeEndpoints();
      const page = await endpoints.listMessages({ cursor: "c1", limit: 20 });
      assert.ok(calls[0].url.includes("cursor=c1"), "cursor giữ nguyên tên");
      assert.ok(calls[0].url.includes("page_size=20"), `F05 nhận page_size, url=${calls[0].url}`);
      assert.ok(!calls[0].url.includes("limit="), "không gửi limit cho F05");
      assert.equal(page.nextCursor, "cursor-2");
      assert.equal(page.results[0].message_id, "m1");
    } finally {
      clearSession();
      mock.restoreAll();
    }
  });

  it("listDrafts: map server_time/pause_seconds của F06; next_cursor -> nextCursor", async () => {
    clearSession();
    setSession({ token: "tok", userId: "u", expiresAt: Date.now() + 60_000 });
    const calls = await captureFetch(() => jsonResponse({
      results: [{ draft_id: "d1" }],
      next_cursor: null,
      server_time: "2026-10-16T00:00:00+00:00",
      pause_seconds: 300,
    }));
    try {
      const endpoints = makeEndpoints();
      const page = await endpoints.listDrafts({ limit: 10 });
      assert.ok(calls[0].url.includes("limit=10"), "F01-style param tên limit (F06 bỏ qua im lặng — tài liệu hóa)");
      assert.equal(page.nextCursor, null);
      assert.equal(page.serverTime, "2026-10-16T00:00:00+00:00");
      assert.equal(page.pauseSeconds, 300);
    } finally {
      clearSession();
      mock.restoreAll();
    }
  });
});

describe("F04 mock-adapter — khớp serializer thật (không mock lệch schema)", () => {
  it("aiRefine mock: suggested_text (KHÔNG refined_text) + echo input_revision + đủ field view()", async () => {
    const adapter = createMockAdapter();
    const dto = await adapter.aiRefine({ text: "Con tức quá hôm nay.", key: "mock-key-1", inputRevision: 3 });
    assert.ok(typeof dto.suggested_text === "string" && dto.suggested_text.length > 0);
    assert.equal(dto.refined_text, undefined, "mock phải trả suggested_text (F04-02)");
    assert.equal(dto.input_revision, 3);
    assert.equal(dto.status, "suggested");
    for (const field of ["suggestion_id", "original_text", "model_revision", "prompt_revision", "created_at", "decided_at"]) {
      assert.ok(field in dto, `mock thiếu field ${field} của AiSuggestion.view()`);
    }
  });

  it("mock aiRefine: thiếu inputRevision -> echo null (legacy hợp lệ)", async () => {
    const adapter = createMockAdapter();
    const dto = await adapter.aiRefine({ text: "abc", key: "mock-key-2" });
    assert.equal(dto.input_revision, null);
  });

  it("mock aiRefine C6: replay cùng key+payload -> CÙNG suggestion_id; key khác payload -> 409", async () => {
    const adapter = createMockAdapter();
    const first = await adapter.aiRefine({ text: "abc", key: "k-replay", inputRevision: 1 });
    const replay = await adapter.aiRefine({ text: "abc", key: "k-replay", inputRevision: 1 });
    assert.equal(replay.suggestion_id, first.suggestion_id, "replay không tạo gợi ý thứ hai");
    await assert.rejects(
      () => adapter.aiRefine({ text: "NỘI DUNG KHÁC", key: "k-replay" }),
      (error) => error instanceof ApiError && error.status === 409
        && error.code === "duplicate_key_payload_mismatch",
    );
    await assert.rejects(
      () => adapter.aiRefine({ text: "abc", key: "k-replay", inputRevision: 2 }),
      (error) => error.status === 409 && error.code === "duplicate_key_payload_mismatch",
      "cùng key khác input_revision cũng là payload khác",
    );
  });

  it("mock aiRefine: inputRevision sai -> 400 input_invalid; thiếu key -> configuration", async () => {
    const adapter = createMockAdapter();
    await assert.rejects(
      () => adapter.aiRefine({ text: "abc", key: "k", inputRevision: 0 }),
      (error) => error.status === 400 && error.code === "input_invalid",
    );
    await assert.rejects(
      () => adapter.aiRefine({ text: "abc" }),
      (error) => error.kind === "configuration",
    );
  });
});

describe("C8 — mock drafts: không chọn pause thì preview/send KHÔNG bị ép chờ", () => {
  it("create -> preview (không pause) -> confirm-send đều hợp lệ ngay", async () => {
    const adapter = createMockAdapter();
    const draft = await adapter.createDraft({ kind: "text", body: "thu la", recipientId: "r-1" });
    const preview = await adapter.previewDraft(draft.draft_id);
    assert.ok(preview.preview_id);
    assert.equal(preview.deadline, null, "không chọn pause -> không có deadline");
    const sent = await adapter.confirmDraftSend(draft.draft_id, preview.preview_id);
    assert.equal(sent.status, "sent");
  });

  it("ĐÃ chọn pause: preview/confirm bị chặn 409 cooldown_active cho tới deadline", async () => {
    const adapter = createMockAdapter();
    const draft = await adapter.createDraft({ kind: "text", body: "co pause", recipientId: "r-1" });
    await adapter.pauseDraft(draft.draft_id);
    await assert.rejects(() => adapter.previewDraft(draft.draft_id),
      (error) => error.status === 409 && error.code === "cooldown_active");
    const preview = await adapter.previewDraft(draft.draft_id).catch((e) => e);
    assert.ok(preview instanceof ApiError, "chưa qua deadline không có preview");
  });

  it("mock editDraft không cần kind: edit sau create vẫn bump revision", async () => {
    const adapter = createMockAdapter();
    const draft = await adapter.createDraft({ kind: "text", body: "ban dau" });
    const edited = await adapter.editDraft(draft.draft_id, { body: "ban sua" });
    assert.equal(edited.revision, draft.revision + 1);
    assert.equal(edited.kind, "text", "kind giữ bất biến sau create");
  });
});

// ---------------------------------------------------------------------------
// Fix round-2 theo peer-review vòng 1 A5 → A1 (findings F1–F5, file
// docs/features/f04/peer-review/round1-A5-reviews-A1-plus-security.md).
// Nguồn sự thật backend: f06_drafts/services/drafts.py (_deadline_guard),
// f06_drafts/models.py (Draft.view), f01_identity/api.py (ConsentView.get),
// f04_ai/models.py (AiSuggestion.view), family_bridge_core/idempotency.py
// (send_payload_hash).
// ---------------------------------------------------------------------------

describe("C8/F1 — mock guard status-aware: pause→edit→preview CHO QUA", () => {
  it("pause → edit → preview/confirm hợp lệ ngay; edit giữ deadline nhưng guard không áp dụng", async () => {
    const adapter = createMockAdapter();
    const draft = await adapter.createDraft({ kind: "text", body: "ban dau", recipientId: "r-1" });
    const paused = await adapter.pauseDraft(draft.draft_id);
    assert.equal(paused.status, "paused");
    const edited = await adapter.editDraft(draft.draft_id, { body: "ban sua", recipientId: "r-1" });
    assert.equal(edited.status, "editing", "edit đưa nháp về editing (backend drafts.py edit)");
    assert.ok(edited.pause, "deadline CỐ TÌNH không xóa khi edit (không reset dừng)");
    assert.equal(edited.pause.remaining_seconds, null,
      "editing → remaining_seconds null (Draft.view backend chỉ tính khi paused)");
    assert.equal(edited.pause.can_preview, false,
      "editing → can_preview false dù deadline còn lưu");
    const preview = await adapter.previewDraft(draft.draft_id);
    assert.ok(preview.preview_id, "status=editing → preview CHO QUA (không 409 cooldown)");
    assert.ok(preview.deadline, "make_preview backend vẫn trả deadline đã lưu (non-null)");
    const sent = await adapter.confirmDraftSend(draft.draft_id, preview.preview_id);
    assert.equal(sent.status, "sent");
  });

  it("đang paused còn deadline → 409 cooldown_active; paused hết hạn → preview/confirm cho qua", async () => {
    const adapter = createMockAdapter();
    const draft = await adapter.createDraft({ kind: "text", body: "co pause", recipientId: "r-1" });
    await adapter.pauseDraft(draft.draft_id);
    await assert.rejects(() => adapter.previewDraft(draft.draft_id),
      (error) => error.status === 409 && error.code === "cooldown_active");
    await assert.rejects(() => adapter.confirmDraftSend(draft.draft_id, "preview-chua-co"),
      (error) => error.status === 409 && error.code === "cooldown_active",
      "confirm cũng bị gate khi đang paused còn deadline");
    // "Hết hạn" mô phỏng bằng dịch chuyển đồng hồ (guard backend so
    // now >= deadline trên SERVER clock — t=299 chặn, t=300 qua).
    const realNow = Date.now;
    mock.method(Date, "now", () => realNow() + 301 * 1000);
    try {
      const preview = await adapter.previewDraft(draft.draft_id);
      assert.ok(preview.preview_id, "hết hạn → guard cho qua (không auto-send, chỉ mở đường)");
      const sent = await adapter.confirmDraftSend(draft.draft_id, preview.preview_id);
      assert.equal(sent.status, "sent", "confirm TAY sau deadline hợp lệ (không tự gửi t=300)");
    } finally {
      mock.restoreAll();
    }
  });

  it("listDrafts: đang paused → remaining_seconds>0 + can_preview=false (chưa tới deadline)", async () => {
    const adapter = createMockAdapter();
    const draft = await adapter.createDraft({ kind: "text", body: "trong danh sach", recipientId: "r-1" });
    await adapter.pauseDraft(draft.draft_id);
    const page = await adapter.listDrafts();
    const row = page.results.find((r) => r.draft_id === draft.draft_id);
    assert.equal(row.status, "paused");
    assert.ok(row.pause.remaining_seconds > 0);
    assert.equal(row.pause.can_preview, false);
  });
});

describe("F2 — mock consents shape = ConsentView.get (f01 api.py:191-211)", () => {
  it("chưa ghi: đủ 3 purpose, decision 'none' + current false; rút giữ decision + withdrawn:true + current theo version", async () => {
    const adapter = createMockAdapter();
    let rows = await adapter.listConsents();
    assert.deepEqual(rows.map((r) => r.purpose), ["service", "ai_processing", "research"],
      "GET backend liệt kê mọi purpose đã biết (kể cả chưa có bản ghi)");
    for (const row of rows) {
      assert.deepEqual(Object.keys(row),
        ["purpose", "decision", "policy_version", "withdrawn", "current"],
        "đúng 5 field ConsentView.get");
    }
    await adapter.recordConsent({ purpose: "ai_processing", policyVersion: "ai-v1", decision: "accepted" });
    await adapter.withdrawConsent({ purpose: "ai_processing" });
    rows = await adapter.listConsents();
    const ai = rows.find((r) => r.purpose === "ai_processing");
    assert.deepEqual(ai,
      { purpose: "ai_processing", decision: "accepted", policy_version: "ai-v1", withdrawn: true, current: true },
      "rút KHÔNG đổi decision ('withdrawn' không thuộc enum backend), withdrawn là bool thật, current theo version hiện hành ai-v1");
  });

  it("current = policy_version == phiên bản hiện hành; version khác → current false", async () => {
    const adapter = createMockAdapter();
    await adapter.recordConsent({ purpose: "ai_processing", policyVersion: "ai-v0", decision: "accepted" });
    const ai = (await adapter.listConsents()).find((r) => r.purpose === "ai_processing");
    assert.equal(ai.current, false, "consent phiên bản cũ không current (fail-closed như has_active_consent)");
    await adapter.recordConsent({ purpose: "ai_processing", policyVersion: "ai-v1", decision: "declined" });
    const ai2 = (await adapter.listConsents()).find((r) => r.purpose === "ai_processing");
    assert.equal(ai2.current, true, "declined vẫn current:true theo shape backend (current chỉ về PHIÊN BẢN policy)");
    assert.equal(ai2.decision, "declined");
  });

  it("accept lại sau rút (latest-wins) → withdrawn false, current true", async () => {
    const adapter = createMockAdapter();
    await adapter.recordConsent({ purpose: "ai_processing", policyVersion: "ai-v1", decision: "accepted" });
    await adapter.withdrawConsent({ purpose: "ai_processing" });
    await adapter.recordConsent({ purpose: "ai_processing", policyVersion: "ai-v1", decision: "accepted" });
    const ai = (await adapter.listConsents()).find((r) => r.purpose === "ai_processing");
    assert.deepEqual(ai,
      { purpose: "ai_processing", decision: "accepted", policy_version: "ai-v1", withdrawn: false, current: true },
      "bản ghi mới nhất đè sổ cái (accept sau rút là hành động mới có hiệu lực)");
  });
});

describe("F4 — mock replay so khớp payload KHÔNG gồm purpose (send_payload_hash)", () => {
  it("cùng key + text + input_revision nhưng purpose khác → REPLAY (không 409)", async () => {
    const adapter = createMockAdapter();
    const first = await adapter.aiRefine({ text: "abc", key: "k-f4-purpose", inputRevision: 1, purpose: "refine_expression" });
    const replay = await adapter.aiRefine({ text: "abc", key: "k-f4-purpose", inputRevision: 1, purpose: "purpose_khac" });
    assert.equal(replay.suggestion_id, first.suggestion_id,
      "hash backend {kind, recipient_id, body, reply_to, context_revision} không có purpose — mock phải cùng semantics");
    // text khác vẫn 409 như trước (body có trong hash).
    await assert.rejects(
      () => adapter.aiRefine({ text: "khác", key: "k-f4-purpose", inputRevision: 1 }),
      (error) => error.status === 409 && error.code === "duplicate_key_payload_mismatch");
  });
});

// F5 (P2, peer-review round1 A5→A1): chống drift serializer↔mock bằng MỘT
// mảng hằng đơn nguồn. Nguồn sự thật: `AiSuggestion.view()` tại
// packages/family_bridge_features/f04_ai/models.py:69-82 (đọc ở working tree
// nhánh tinh-nang/f04-ai-ho-tro-dien-dat-us029-us033, 2026-10-16, sau fix
// C2/C3 echo input_revision).
// QUY TẮC BẢO TRÌ: khi backend thêm/đổi field trong AiSuggestion.view() PHẢI
// cập nhật CẢ HAI phía cùng một lúc:
//   (1) mảng hằng DOCUMENTED_SUGGESTION_DTO_FIELDS dưới đây (test Node/mock),
//   (2) test Python phía backend (yêu cầu cho FIX-BACKEND/coordinator — CHƯA
//       CÓ, cần thêm): assert set(AiSuggestion.view().keys()) == đúng danh
//       sách 10 field này.
// `source` KHÔNG nằm trong view() thật — quy ước mock-wide "fixture" đã được
// ghi nhận trong peer-review (chấp nhận cố ý, luôn ở CUỐI mảng key).
const DOCUMENTED_SUGGESTION_DTO_FIELDS = [
  "suggestion_id",
  "purpose",
  "status",
  "original_text",
  "suggested_text",
  "model_revision",
  "prompt_revision",
  "input_revision",
  "created_at",
  "decided_at",
];

describe("F5 — shape contract đơn nguồn: mock DTO = đúng key set AiSuggestion.view()", () => {
  it("mock aiRefine trả ĐÚNG key set + đúng thứ tự (+source quy ước ở cuối)", async () => {
    const adapter = createMockAdapter();
    const dto = await adapter.aiRefine({ text: "shape", key: "shape-refine", inputRevision: 2 });
    assert.deepEqual(Object.keys(dto), [...DOCUMENTED_SUGGESTION_DTO_FIELDS, "source"]);
  });

  it("mock decide (aiAccept/aiDiscard) cùng key set, decided_at ISO, one-way; replay phản ánh trạng đã quyết", async () => {
    const adapter = createMockAdapter();
    const dto = await adapter.aiRefine({ text: "shape", key: "shape-decide" });
    assert.equal(dto.decided_at, null, "mới refine → decided_at null như view() thật");
    const accepted = await adapter.aiAccept(dto.suggestion_id);
    assert.deepEqual(Object.keys(accepted), [...DOCUMENTED_SUGGESTION_DTO_FIELDS, "source"],
      "decide trả ĐỦ view() như backend _decide (api.py trả suggestion.view())");
    assert.equal(accepted.status, "accepted");
    assert.equal(typeof accepted.decided_at, "string");
    assert.ok(accepted.decided_at.length > 0, "decided_at đóng dấu ISO sau decide");
    const discarded = await adapter.aiDiscard(dto.suggestion_id);
    assert.equal(discarded.status, "accepted", "one-way: discard sau accept không đổi trạng thái (express.decide)");
    const replay = await adapter.aiRefine({ text: "shape", key: "shape-decide" });
    assert.equal(replay.status, "accepted", "replay cùng key sau decide trả row hiện tại như backend");
    assert.ok(replay.decided_at, "replay giữ decided_at");
  });

  it("mock confirmDraftSend trả đúng shape confirm_send backend: {message_id, draft_id, status}", async () => {
    const adapter = createMockAdapter();
    const draft = await adapter.createDraft({ kind: "text", body: "gui thu", recipientId: "r-1" });
    const preview = await adapter.previewDraft(draft.draft_id);
    const sent = await adapter.confirmDraftSend(draft.draft_id, preview.preview_id);
    assert.deepEqual(Object.keys(sent), ["message_id", "draft_id", "status", "source"],
      "shape = confirm_send (f06 drafts.py:247-248) + source quy ước — KHÔNG có preview_id");
    assert.equal(sent.status, "sent");
    assert.ok(sent.message_id, "phải có message_id của thư đã gửi");
  });

  it("mock listConsents mỗi row đúng 5 field ConsentView.get + decision thuộc enum backend", async () => {
    const adapter = createMockAdapter();
    for (const row of await adapter.listConsents()) {
      assert.deepEqual(Object.keys(row),
        ["purpose", "decision", "policy_version", "withdrawn", "current"]);
      assert.ok(["accepted", "declined", "none"].includes(row.decision),
        `decision phải thuộc enum backend accepted|declined|none, nhận: ${row.decision}`);
    }
  });
});
