// tests/test_f06_concurrency_contract.test.mjs — hợp đồng đồng thời F06 vòng 2
// (N06 P2 "stale edit đè im lặng" + N03 P1 "sheet preview bind state cũ") theo
// contract BINDING F04R2-LEAD-1 chốt 2026-10-19 trên nền ec29abb:
//  - N06 http editDraft: field MỚI optional `expectedRevision` → body JSON
//    kèm `expected_revision` (int dương 1..2147483647); KHÔNG truyền/null →
//    KHÔNG gửi field (backcompat hành vi cũ). HTTP 409 revision_conflict
//    {reason:"draft_conflict", current_revision:N} nổi lên NGUYÊN qua ApiError
//    (details KHÔNG chứa body — FORBIDDEN_DETAIL_KEYS), không nuốt, không retry.
//  - N06 mock: mirror đúng server semantics — lệch revision → throw
//    revision_conflict với current_revision = revision HIỆN TẠI của mock,
//    KHÔNG đè bản của client khác; khớp/undefined → bump như cũ.
//  - N03 preview (pin CẢ HAI adapter): response phải trả đủ
//    {preview_id, revision, recipient_id, body, deadline, server_time} —
//    client bind sheet xác nhận TỪ response này, không từ state UI cũ.
// Chạy: node --test packages/family_bridge_shared/tests/test_f06_concurrency_contract.test.mjs
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

function withHttpSession(fn) {
  return async () => {
    clearSession();
    setSession({ token: "tok-n06", userId: "u", expiresAt: Date.now() + 60_000 });
    try {
      await fn();
    } finally {
      clearSession();
      mock.restoreAll();
    }
  };
}

describe("N06 — http editDraft expected_revision (contract F04R2-LEAD-1)", () => {
  it("KHÔNG truyền expectedRevision -> body KHÔNG có expected_revision (backcompat)", withHttpSession(async () => {
    const calls = await captureFetch(() => jsonResponse({ draft_id: "d1", revision: 2 }));
    const endpoints = makeEndpoints();
    await endpoints.editDraft("d1", { body: "ban sua", title: "tieu de" });
    assert.equal(calls[0].url, "https://backend.example/api/v1/drafts/d1");
    assert.equal(calls[0].options.method, "POST");
    assert.ok(!("expected_revision" in calls[0].body),
      "không truyền expectedRevision → payload KHÔNG được gửi expected_revision (hành vi cũ)");
    assert.deepEqual(calls[0].body, { body: "ban sua", title: "tieu de" });
  }));

  it("expectedRevision hợp lệ -> body.expected_revision nguyên giá trị, đi kèm đủ field edit", withHttpSession(async () => {
    const calls = await captureFetch(() => jsonResponse({ draft_id: "d1", revision: 6 }));
    const endpoints = makeEndpoints();
    const result = await endpoints.editDraft("d1", {
      body: "ban da sua", title: "tieu de",
      cardId: "card-9", cardVersion: 3, recipientId: "r-1", expectedRevision: 5,
    });
    assert.deepEqual(calls[0].body, {
      body: "ban da sua", title: "tieu de",
      card_id: "card-9", card_version: 3, recipient_id: "r-1",
      expected_revision: 5,
    }, "expected_revision phải nằm trong JSON body kèm các field edit hiện có");
    assert.equal(result.revision, 6, "khớp revision → máy chủ trả revision+1 (pass-through)");
  }));

  it("expectedRevision sai (0, âm, lẻ, chuỗi, quá 2^31-1) -> 400 input_invalid TRƯỚC fetch (parity aiRefine)", withHttpSession(async () => {
    let fetchCalled = false;
    mock.method(globalThis, "fetch", async () => { fetchCalled = true; return jsonResponse({}); });
    const endpoints = makeEndpoints();
    for (const bad of [0, -1, 2.5, "3", 2147483648, true]) {
      await assert.rejects(
        () => endpoints.editDraft("d1", { body: "x", expectedRevision: bad }),
        (error) => error instanceof ApiError && error.status === 400
          && error.code === "input_invalid"
          && error.details && error.details.field === "expected_revision",
        `expectedRevision=${String(bad)} phải bị chặn trước fetch`,
      );
    }
    assert.equal(fetchCalled, false, "payload sai ràng buộc không được rời client");
  }));

  it("HTTP 409 revision_conflict -> ApiError nguyên status/code/details (reason + current_revision), KHÔNG nuốt, KHÔNG retry", withHttpSession(async () => {
    const calls = await captureFetch(() => jsonResponse(
      { error: { code: "revision_conflict",
        details: { reason: "draft_conflict", current_revision: 4 } } },
      { status: 409 }));
    const endpoints = makeEndpoints();
    await assert.rejects(
      () => endpoints.editDraft("d1", { body: "ban cu", expectedRevision: 3 }),
      (error) => error instanceof ApiError && error.status === 409
        && error.code === "revision_conflict"
        && error.details && error.details.reason === "draft_conflict"
        && error.details.current_revision === 4
        && !("body" in error.details),
      "409 revision_conflict phải nổi lên nguyên details {reason, current_revision} — KHÔNG chứa body",
    );
    assert.equal(calls.length, 1, "adapter KHÔNG được tự retry thao tác ghi");
  }));
});

describe("N06 — mock editDraft mirror server semantics", () => {
  it("expectedRevision KHỚP -> bump revision như cũ (happy path)", async () => {
    const adapter = createMockAdapter();
    const draft = await adapter.createDraft({ kind: "text", body: "ban dau", recipientId: "r-1" });
    assert.equal(draft.revision, 1);
    const edited = await adapter.editDraft(draft.draft_id, {
      body: "ban hai", recipientId: "r-1", expectedRevision: 1 });
    assert.equal(edited.revision, 2, "khớp revision → +1 như hành vi cũ");
    assert.equal(edited.body, "ban hai");
  });

  it("expectedRevision LỆCH -> 409 revision_conflict + details {reason:'draft_conflict', current_revision=rev hiện tại của mock}, KHÔNG đè im lặng", async () => {
    const adapter = createMockAdapter();
    const draft = await adapter.createDraft({ kind: "text", body: "ban A", recipientId: "r-1" });
    // "Client khác" sửa trước → revision của máy chủ/mock đi lên.
    await adapter.editDraft(draft.draft_id, { body: "ban B cua client khac", recipientId: "r-1" });
    // Client stale vẫn giữ expectedRevision = 1 (bản nó biết).
    await assert.rejects(
      () => adapter.editDraft(draft.draft_id, { body: "ban C cua client stale", recipientId: "r-1", expectedRevision: 1 }),
      (error) => error instanceof ApiError && error.status === 409
        && error.code === "revision_conflict"
        && error.details && error.details.reason === "draft_conflict"
        && error.details.current_revision === 2
        && !("body" in error.details),
      "lệch revision phải 409 với current_revision = revision hiện tại của mock, details KHÔNG chứa body",
    );
    // Bản của client khác phải còn NGUYÊN — không bị đè im lặng (đúng N06).
    const after = await adapter.getDraft(draft.draft_id);
    assert.equal(after.body, "ban B cua client khac", "edit stale KHÔNG được ghi vào draft");
    assert.equal(after.revision, 2, "revision không đổi khi bị chặn");
  });

  it("KHÔNG truyền expectedRevision -> hành vi cũ (bump, không conflict); null coi như không truyền (parity confirmInvite)", async () => {
    const adapter = createMockAdapter();
    const draft = await adapter.createDraft({ kind: "text", body: "ban dau" });
    const first = await adapter.editDraft(draft.draft_id, { body: "ban hai" });
    assert.equal(first.revision, 2);
    const second = await adapter.editDraft(draft.draft_id, { body: "ban ba", expectedRevision: null });
    assert.equal(second.revision, 3, "null = không truyền (cùng convention expectedRevision === null || === undefined của adapter family)");
  });

  it("expectedRevision sai kiểu -> 400 input_invalid (mock parity aiRefine input_revision)", async () => {
    const adapter = createMockAdapter();
    const draft = await adapter.createDraft({ kind: "text", body: "ban dau" });
    for (const bad of [0, -1, 2.5, "3", 2147483648]) {
      await assert.rejects(
        () => adapter.editDraft(draft.draft_id, { body: "x", expectedRevision: bad }),
        (error) => error instanceof ApiError && error.status === 400
          && error.code === "input_invalid"
          && error.details && error.details.field === "expected_revision",
        `expectedRevision=${String(bad)} mock phải từ chối như backend`,
      );
    }
  });
});

// N03 (P1): sheet xác nhận phải bind recipient/revision/body TỪ preview
// response — adapter hai phía (mock + http) phải trả ĐỦ field để UI có nguồn
// bind đúng; preview phản ánh state máy chủ TẠI THỜI ĐIỂM preview (sau mọi
// editDraft), không phải state UI cũ.
describe("N03 — previewDraft trả đủ recipient_id/revision/body (pin mock + http)", () => {
  it("mock preview trả đủ 6 field {preview_id, revision, recipient_id, body, deadline, server_time}", async () => {
    const adapter = createMockAdapter();
    const draft = await adapter.createDraft({ kind: "text", body: "ban can gui", recipientId: "r-n03" });
    const preview = await adapter.previewDraft(draft.draft_id);
    for (const field of ["preview_id", "revision", "recipient_id", "body", "deadline", "server_time"]) {
      assert.ok(field in preview, `mock preview thiếu field ${field}`);
    }
    assert.equal(preview.recipient_id, "r-n03");
    assert.equal(preview.revision, draft.revision);
    assert.equal(preview.body, "ban can gui");
    assert.deepEqual(Object.keys(preview),
      ["preview_id", "revision", "recipient_id", "body", "deadline", "server_time", "source"],
      "shape mock = make_preview backend (6 field) + source quy ước ở cuối");
  });

  it("mock preview bind TỪ server state SAU edit (cả edit thường lẫn edit có expectedRevision) — chống stale state UI N03", async () => {
    const adapter = createMockAdapter();
    const draft = await adapter.createDraft({ kind: "text", body: "ban A", recipientId: "r-a" });
    // Client khác đổi recipient + body (edit thường).
    const edited = await adapter.editDraft(draft.draft_id, { body: "ban B", recipientId: "r-b" });
    const previewB = await adapter.previewDraft(draft.draft_id);
    assert.equal(previewB.recipient_id, "r-b", "preview phải phản ánh recipient MỚI của máy chủ");
    assert.equal(previewB.revision, edited.revision);
    assert.equal(previewB.body, "ban B");
    // Edit có expectedRevision (luồng N06) cũng phải bump + preview bind bản mới.
    const editedC = await adapter.editDraft(draft.draft_id, {
      body: "ban C", recipientId: "r-c", expectedRevision: edited.revision });
    const previewC = await adapter.previewDraft(draft.draft_id);
    assert.equal(previewC.recipient_id, "r-c");
    assert.equal(previewC.revision, editedC.revision);
    assert.equal(previewC.body, "ban C");
  });

  it("http preview pass-through NGUYÊN VẸN 6 field server (adapter không strip recipient_id/revision/body)", withHttpSession(async () => {
    // Shape = make_preview backend tại ec29abb (đủ 6 field).
    const serverPreview = {
      preview_id: "8b1e1c58-0000-4a5a-9d1f-000000000002",
      revision: 9,
      recipient_id: "r-uuid-n03",
      body: "bản máy chủ chốt lúc preview",
      deadline: null,
      server_time: "2026-10-19T00:00:00+00:00",
    };
    const calls = await captureFetch(() => jsonResponse(serverPreview));
    const endpoints = makeEndpoints();
    const preview = await endpoints.previewDraft("d-n03");
    assert.deepEqual(preview, serverPreview,
      "adapter phải trả preview nguyên vẹn — N03 bind TỪ response này");
    assert.equal(calls[0].url, "https://backend.example/api/v1/drafts/d-n03/preview");
    assert.equal(calls[0].options.method, "POST");
  }));
});
