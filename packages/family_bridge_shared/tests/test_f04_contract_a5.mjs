// tests/test_f04_contract_a5.mjs — A5 independent contract test (frozen v1):
// adapter mức HTTP phải pass-through DTO NGUYÊN VẸN, đúng method/path/headers,
// input_revision đúng ràng buộc, và KHÔNG CÓ nơi nào sinh `refined_text`.
// Viết từ hợp đồng freeze v1 + ma trận F04-T03/T19, KHÔNG sửa src.
//
// Chạy: node --test packages/family_bridge_shared/tests/test_f04_contract_a5.mjs
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { ApiError, createApiClient } from "../src/api/client.mjs";
import {
  clearSession, clearSessionIfUnchanged, getSessionGeneration, getToken,
  setSession,
} from "../src/session.js";
import { createHttpEndpoints } from "../src/adapter/http-endpoints.js";
import { createMockAdapter } from "../src/adapter/mock-adapter.js";
import { ADAPTER_METHODS } from "../src/adapter/contract.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const HARSH = "Con mệt mỏi lắm rồi, bố mẹ không bao giờ chịu nghe con cả!";

/** DTO đúng AiSuggestion.view() + echo input_revision (freeze v1 C2). */
function serverDto(overrides = {}) {
  return {
    suggestion_id: "6f0c9a2e-1111-4a5a-9d1f-000000000001",
    purpose: "refine_expression",
    status: "suggested",
    original_text: HARSH,
    suggested_text: "Mình cảm thấy mệt mỏi — mình cần được lắng nghe.",
    model_revision: "gemini-1.5-flash",
    prompt_revision: "pr-001",
    input_revision: null,
    created_at: "2026-10-16T18:00:00+00:00",
    decided_at: null,
    ...overrides,
  };
}

function jsonResponse(data, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

/** Host test dựng GIỐNG HỆT pattern glue (ADR-1) — xem http-endpoints.test.mjs. */
function makeEndpoints({ baseUrl = "https://backend.example" } = {}) {
  const request = createApiClient({ baseUrl, getToken, timeoutMs: 15000 });
  function requireBaseUrl() {
    if (!baseUrl) {
      throw new ApiError("Chưa cấu hình địa chỉ máy chủ.", 0, "configuration");
    }
  }
  function staleSessionError() {
    return new ApiError("Phién đã thay đổi khi yêu cầu đang chạy.", 0,
      "stale_session");
  }
  async function authed(run) {
    const capturedGeneration = getSessionGeneration();
    let data;
    try {
      data = await run();
    } catch (error) {
      if (getSessionGeneration() !== capturedGeneration) throw staleSessionError();
      if (error instanceof ApiError && error.status === 401) {
        clearSessionIfUnchanged(capturedGeneration);
      }
      throw error;
    }
    if (getSessionGeneration() !== capturedGeneration) throw staleSessionError();
    return data;
  }
  return createHttpEndpoints({
    request, authed, requireBaseUrl, staleSessionError, coldStartTimeoutMs: 60000,
  });
}

/** Bỏ comment khối + dòng để grep-like check "không sinh refined_text". */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("//");
      if (idx === -1) return line;
      if (idx > 0 && line[idx - 1] === ":") return line; // scheme URL (https://)
      return line.slice(0, idx);
    })
    .join("\n");
}

function withSession(fn) {
  return async () => {
    clearSession();
    setSession({ token: "tok-a5-f04", userId: "u-a5",
      expiresAt: Date.now() + 60_000 });
    try {
      await fn();
    } finally {
      clearSession();
      mock.restoreAll();
    }
  };
}

describe("A5 contract — aiRefine method/path/headers/body (freeze v1)", () => {
  it("POST /api/v1/ai/refine + X-Idempotency-Key + Bearer; body đúng shape", async () => {
    const calls = [];
    mock.method(globalThis, "fetch", async (url, options = {}) => {
      calls.push({ url: String(url), method: options.method,
        headers: options.headers, body: options.body });
      return jsonResponse(serverDto(), { status: 201 });
    });
    await withSession(async () => {
      const endpoints = makeEndpoints();
      const dto = await endpoints.aiRefine({
        text: HARSH, purpose: "refine_expression", key: "a5-key-0001",
      });
      assert.equal(calls.length, 1);
      const call = calls[0];
      assert.equal(call.url, "https://backend.example/api/v1/ai/refine");
      assert.equal(call.method, "POST");
      assert.equal(call.headers["X-Idempotency-Key"], "a5-key-0001");
      assert.equal(call.headers.Authorization, "Bearer tok-a5-f04");
      const body = JSON.parse(call.body);
      assert.deepEqual(body,
        { original_text: HARSH, purpose: "refine_expression" },
        "không truyền inputRevision → body KHÔNG chứa input_revision");
      assert.equal(dto.suggested_text,
        "Mình cảm thấy mệt mỏi — mình cần được lắng nghe.");
      assert.equal(!("refined_text" in dto), true);
    })();
  });

  it("inputRevision hợp lệ → body.input_revision nguyên giá trị (echo contract)", async () => {
    const calls = [];
    mock.method(globalThis, "fetch", async (_url, options = {}) => {
      calls.push({ body: options.body });
      return jsonResponse(serverDto({ input_revision: 7 }), { status: 201 });
    });
    await withSession(async () => {
      const endpoints = makeEndpoints();
      const dto = await endpoints.aiRefine({
        text: HARSH, key: "a5-key-0002", inputRevision: 7 });
      const body = JSON.parse(calls[0].body);
      assert.equal(body.input_revision, 7);
      assert.equal(dto.input_revision, 7,
        "adapter phải trả nguyên echo của máy chủ cho UI đối chiếu stale");
    })();
  });

  it("inputRevision sai (0 / âm / lẻ / chuỗi / vượt 2^31-1) → ApiError 400 input_invalid TRƯỚC fetch", async () => {
    let fetchCalled = false;
    mock.method(globalThis, "fetch", async () => { fetchCalled = true; });
    await withSession(async () => {
      const endpoints = makeEndpoints();
      for (const bad of [0, -3, 1.5, "2", 2147483648]) {
        await assert.rejects(
          () => endpoints.aiRefine({ text: HARSH, key: "a5-key-0003",
            inputRevision: bad }),
          (error) => error instanceof ApiError && error.status === 400
            && error.code === "input_invalid",
          `inputRevision=${bad} phải bị chặn trước fetch`);
      }
      assert.equal(fetchCalled, false);
    })();
  });

  it("thiếu key → ApiError kind configuration, KHÔNG gọi fetch", async () => {
    let fetchCalled = false;
    mock.method(globalThis, "fetch", async () => { fetchCalled = true; });
    await withSession(async () => {
      const endpoints = makeEndpoints();
      await assert.rejects(
        () => endpoints.aiRefine({ text: HARSH }),
        (error) => error.kind === "configuration");
      assert.equal(fetchCalled, false);
    })();
  });
});

describe("A5 contract — DTO pass-through NGUYÊN VẸN, không biến đổi envelope", () => {
  it("trả đúng object máy chủ trả (deepEqual), kể field lạ của server", async () => {
    const dto = serverDto({ provider_trace_id: "srv-only-field",
      input_revision: 3 });
    mock.method(globalThis, "fetch", async () => jsonResponse(dto, { status: 201 }));
    await withSession(async () => {
      const endpoints = makeEndpoints();
      const result = await endpoints.aiRefine({
        text: HARSH, key: "a5-key-0004", inputRevision: 3 });
      assert.deepEqual(result, dto,
        "adapter KHÔNG được đổi tên field/thêm bớt — pass-through");
      assert.equal(result.suggested_text, dto.suggested_text);
      assert.equal("refined_text" in result, false);
    })();
  });

  it("409 duplicate_key_payload_mismatch nổi lên nguyên status + code", async () => {
    mock.method(globalThis, "fetch", async () => jsonResponse(
      { error: { code: "duplicate_key_payload_mismatch",
        details: { reason: "same_key_different_payload" } } },
      { status: 409 }));
    await withSession(async () => {
      const endpoints = makeEndpoints();
      await assert.rejects(
        () => endpoints.aiRefine({ text: "khác", key: "a5-key-0005" }),
        (error) => error instanceof ApiError && error.status === 409
          && error.code === "duplicate_key_payload_mismatch");
    })();
  });

  it("503 temporarily_unavailable (provider lỗi) nổi lên nguyên vẹn", async () => {
    mock.method(globalThis, "fetch", async () => jsonResponse(
      { error: { code: "temporarily_unavailable",
        details: { reason: "provider_timeout" } } },
      { status: 503 }));
    await withSession(async () => {
      const endpoints = makeEndpoints();
      await assert.rejects(
        () => endpoints.aiRefine({ text: HARSH, key: "a5-key-0006" }),
        (error) => error.status === 503
          && error.code === "temporarily_unavailable");
    })();
  });

  it("aiAccept/aiDiscard: POST đúng path, body {}; aiStatus GET pass-through", async () => {
    const calls = [];
    mock.method(globalThis, "fetch", async (url, options = {}) => {
      calls.push({ url: String(url), method: options.method,
        body: options.body });
      if (String(url).endsWith("/ai/status")) {
        return jsonResponse({ ai_enabled: true });
      }
      return jsonResponse(serverDto({ status: "accepted" }));
    });
    await withSession(async () => {
      const endpoints = makeEndpoints();
      const accepted = await endpoints.aiAccept("6f0c9a2e-1111-4a5a-9d1f-000000000001");
      assert.equal(calls[0].method, "POST");
      assert.ok(calls[0].url.endsWith(
        "/api/v1/ai/suggestions/6f0c9a2e-1111-4a5a-9d1f-000000000001/accept"));
      assert.equal(accepted.status, "accepted");
      const discarded = await endpoints.aiDiscard("6f0c9a2e-1111-4a5a-9d1f-000000000001");
      assert.ok(calls[1].url.endsWith("/discard"));
      assert.equal(discarded.status, "accepted");
      const status = await endpoints.aiStatus();
      assert.deepEqual(status, { ai_enabled: true });
      assert.equal(calls[2].method, "GET");
    })();
  });
});

describe("A5 contract — editDraft + consents khớp C-hợp đồng", () => {
  it("editDraft: POST /api/v1/drafts/{id}, KHÔNG BAO GIỜ gửi kind, map snake_case", async () => {
    const calls = [];
    mock.method(globalThis, "fetch", async (url, options = {}) => {
      calls.push({ url: String(url), method: options.method,
        body: options.body });
      return jsonResponse({ draft_id: "d1", revision: 2 });
    });
    await withSession(async () => {
      const endpoints = makeEndpoints();
      await endpoints.editDraft("draft-1", {
        body: "final do người viết duyệt", title: "Tiêu đề",
        cardId: "card-9", cardVersion: 3, recipientId: "r-uuid" });
      assert.equal(calls[0].method, "POST");
      assert.ok(calls[0].url.endsWith("/api/v1/drafts/draft-1"));
      const body = JSON.parse(calls[0].body);
      assert.equal("kind" in body, false,
        "edit KHÔNG được gửi kind (bất biến sau create)");
      assert.deepEqual(body, {
        body: "final do người viết duyệt", title: "Tiêu đề",
        card_id: "card-9", card_version: 3, recipient_id: "r-uuid",
      });
    })();
  });

  it("consents: GET list; POST {purpose, policy_version, decision}; withdraw đúng path", async () => {
    const calls = [];
    mock.method(globalThis, "fetch", async (url, options = {}) => {
      calls.push({ url: String(url), method: options.method,
        body: options.body });
      if (options.method === "POST" && String(url).endsWith("/consents")) {
        return jsonResponse({ consent_id: "c1", purpose: "ai_processing",
          policy_version: "ai-v1", decision: "accepted",
          recorded_at: "2026-10-16T18:00:00+00:00" }, { status: 201 });
      }
      if (String(url).includes("/withdraw")) {
        return jsonResponse({ purpose: "ai_processing", withdrawn: true });
      }
      return jsonResponse({ consents: [
        { purpose: "ai_processing", decision: "none", policy_version: null,
          withdrawn: false, current: false },
      ] });
    });
    await withSession(async () => {
      const endpoints = makeEndpoints();
      const listed = await endpoints.listConsents();
      assert.ok(Array.isArray(listed));
      const recorded = await endpoints.recordConsent({
        purpose: "ai_processing", policyVersion: "ai-v1",
        decision: "accepted" });
      assert.equal(calls[1].method, "POST");
      assert.deepEqual(JSON.parse(calls[1].body), {
        purpose: "ai_processing", policy_version: "ai-v1",
        decision: "accepted" });
      assert.equal(recorded.decision, "accepted");
      const withdrawn = await endpoints.withdrawConsent({
        purpose: "ai_processing" });
      assert.ok(calls[2].url.endsWith(
        "/api/v1/privacy/consents/ai_processing/withdraw"));
      assert.equal(withdrawn.withdrawn, true);
    })();
  });

  it("ADAPTER_METHODS có đủ bộ F04 (nguồn duy nhất chống drift)", () => {
    for (const method of ["aiStatus", "aiRefine", "aiAccept", "aiDiscard",
      "listConsents", "recordConsent", "editDraft", "withdrawConsent"]) {
      assert.ok(ADAPTER_METHODS.includes(method), `thiếu ${method}`);
    }
  });
});

describe("A5 contract — mock-adapter: suggested_text duy nhất, KHÔNG refined_text", () => {
  it("aiRefine mock: shape khớp serializer thật + replay không sinh gợi ý mới", async () => {
    const adapter = createMockAdapter();
    const first = await adapter.aiRefine({ text: HARSH, key: "a5-mock-1" });
    assert.ok(first.suggested_text, "mock phải trả suggested_text");
    assert.equal("refined_text" in first, false,
      "mock KHÔNG được chứa refined_text");
    assert.equal("input_revision" in first, true,
      "mock phải echo input_revision như serializer thật");
    const replay = await adapter.aiRefine({ text: HARSH, key: "a5-mock-1" });
    assert.equal(replay.suggestion_id, first.suggestion_id,
      "replay cùng key trả CÙNG gợi ý");
    await assert.rejects(
      () => adapter.aiRefine({ text: "payload khác", key: "a5-mock-1" }),
      (error) => error.status === 409
        && error.code === "duplicate_key_payload_mismatch");
    const withRevision = await adapter.aiRefine({
      text: HARSH, key: "a5-mock-2", inputRevision: 4 });
    assert.equal(withRevision.input_revision, 4);
    await assert.rejects(
      () => adapter.aiRefine({ text: "x", key: "a5-mock-3", inputRevision: 0 }),
      (error) => error.status === 400 && error.code === "input_invalid");
  });

  it("grep-like: không còn sinh refined_text ngoài comment trong adapter src", () => {
    for (const file of ["adapter/http-endpoints.js", "adapter/mock-adapter.js"]) {
      const source = readFileSync(join(HERE, "..", "src", file), "utf8");
      const stripped = stripComments(source);
      assert.equal(
        /refined_text/.test(stripped), false,
        `${file}: 'refined_text' chỉ được xuất hiện trong comment giải thích — `
        + "không được sinh/dùng ở code chạy thật (freeze v1: suggested_text)");
    }
  });
});
