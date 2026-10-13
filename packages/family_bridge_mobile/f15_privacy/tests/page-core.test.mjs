// F15 page-core logic tests (node thuần, không DOM) — một nguồn logic dùng
// chung cho package page và official zalo-mini-app page. Chạy:
//   node --test packages/family_bridge_mobile/f15_privacy/tests/*.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import { createPrivacyPageCore, classifyError } from "../page-core.js";

const OVERVIEW_OK = {
  shared_by_me: [{
    item_type: "mood_entry", item_id: "i-1", share_id: "s-1",
    recipient_id: "r-1", approved_revision: 2, revoked: false,
  }],
  connections: [{ connection_id: "c-1", other_party_id: "r-1",
    relationship_kind: "primary", generation: 1, status: "active" }],
  next_cursor: null, has_more: false,
};

class ZaloApiError extends Error {
  constructor(message, status, kind) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.kind = kind;
  }
}

class MobileCoreError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeCore({ overview = OVERVIEW_OK, getToken = async () => "tok",
                    postImpl = async () => ({ revoked: true }) } = {}) {
  const calls = [];
  const api = {
    async get(path) { calls.push(["GET", path]); return typeof overview === "function" ? overview() : overview; },
    async post(path, opts) { calls.push(["POST", path, opts]); return postImpl(path, opts); },
  };
  const confirmCalls = [];
  const core = createPrivacyPageCore({
    api,
    getToken,
    confirm: (message) => { confirmCalls.push(message); return true; },
  });
  return { core, calls, confirmCalls };
}

test("classifyError: zalo kind + mobile-core code -> trạng thái thống nhất", () => {
  assert.equal(classifyError(new ZaloApiError("x", 0, "network")), "transient");
  assert.equal(classifyError(new ZaloApiError("x", 0, "timeout")), "transient");
  assert.equal(classifyError(new ZaloApiError("x", 0, "configuration")), "configuration");
  assert.equal(classifyError(new ZaloApiError("x", 401, "http")), "unauthenticated");
  assert.equal(classifyError(new ZaloApiError("x", 503, "http")), "transient");
  assert.equal(classifyError(new ZaloApiError("x", 400, "http")), "fatal");
  assert.equal(classifyError(new MobileCoreError("temporarily_unavailable", 0)), "transient");
  assert.equal(classifyError(new MobileCoreError("not_authenticated", 401)), "unauthenticated");
  assert.equal(classifyError(new MobileCoreError("not_found", 404)), "fatal");
});

test("load: không token -> no_session và KHÔNG gọi API riêng tư", async () => {
  const { core, calls } = makeCore({ getToken: async () => null });
  await core.load();
  const view = core.getView();
  assert.equal(view.status, "no_session");
  assert.equal(calls.length, 0, "không fetch khi chưa có token");
  core.destroy();
});

test("load: thành công -> ready, items có label, có kết nối", async () => {
  const { core, calls } = makeCore();
  await core.load();
  const view = core.getView();
  assert.equal(view.status, "ready");
  assert.equal(view.items.length, 1);
  assert.equal(view.items[0].label, "Tâm trạng");
  assert.equal(view.connections.length, 1);
  assert.ok(calls.some(([m, p]) => m === "GET" && p === "/api/v1/privacy/overview"));
  core.destroy();
});

test("revokeGrant: confirm + POST đúng path + reload; double-submit bị chặn", async () => {
  let pending;
  const { core, calls, confirmCalls } = makeCore({
    postImpl: () => new Promise((resolve) => { pending = resolve; }),
  });
  await core.load();
  const item = core.getView().items[0];
  const first = core.revokeGrant(item);
  const second = await core.revokeGrant(item); // trong lúc mutation đầu chưa xong
  assert.equal(second.status, "busy");
  pending({ revoked: true });
  assert.equal((await first).status, "ok");
  assert.equal(confirmCalls.length, 1, "phải có confirm trước mutation");
  assert.ok(calls.some(([m, p]) => m === "POST"
    && p === "/api/v1/privacy/grants/mood_entry/i-1/revoke"));
  core.destroy();
});

test("revokeGrant: confirm=false -> không gọi API", async () => {
  const calls = [];
  const core = createPrivacyPageCore({
    api: {
      async get() { return OVERVIEW_OK; },
      async post(path, opts) { calls.push(["POST", path, opts]); return {}; },
    },
    getToken: async () => "tok",
    confirm: () => false,
  });
  await core.load();
  const result = await core.revokeGrant(core.getView().items[0]);
  assert.equal(result.status, "cancelled");
  assert.deepEqual(calls, []);
  core.destroy();
});

test("mutation timeout -> đọc lại đúng một lần GET, không tự retry POST", async () => {
  let posts = 0;
  let gets = 0;
  const core = createPrivacyPageCore({
    api: {
      async get() { gets += 1; return OVERVIEW_OK; },
      async post() { posts += 1; throw new ZaloApiError("timeout", 0, "timeout"); },
    },
    getToken: async () => "tok",
    confirm: () => true,
  });
  await core.load();
  const result = await core.revokeGrant(core.getView().items[0]);
  assert.equal(result.status, "unknown");
  assert.equal(posts, 1, "không tự retry mutation");
  assert.ok(gets >= 2, "phải đọc lại bằng GET sau unknown outcome");
  core.destroy();
});

test("requestDeletion: receipt một lần; duplicate không ghi đè receipt", async () => {
  const { core } = makeCore({
    postImpl: (path) => path.endsWith("/deletion-requests")
      ? { receipt: "once-only-code", duplicate: false } : {},
  });
  await core.load();
  const result = await core.requestDeletion(["mood"]);
  assert.equal(result.status, "ok");
  assert.equal(core.getView().receipt, "once-only-code");
  core.destroy();

  const again = makeCore({
    postImpl: (path) => path.endsWith("/deletion-requests")
      ? { duplicate: true, request_id: "r-1" } : {},
  });
  await again.core.load();
  await again.core.requestDeletion(["mood"]);
  assert.equal(again.core.getView().receipt, null);
  assert.match(again.core.getView().receiptNote || "", /yêu cầu đang mở/);
  again.core.destroy();
});

test("destroy: response muộn không đổi state; subscribe bị gỡ", async () => {
  let release;
  const core = createPrivacyPageCore({
    api: {
      async get() {
        if (!release) {
          return new Promise((resolve) => { release = resolve; });
        }
        return OVERVIEW_OK;
      },
      async post() { return {}; },
    },
    getToken: async () => "tok",
  });
  const seen = [];
  core.subscribe((v) => seen.push(v.status));
  const loading = core.load();
  await wait(1); // cho load đi tới api.get (promise đang treo)
  core.destroy();
  release(OVERVIEW_OK);
  await loading;
  assert.ok(core.destroyed);
  const statusesAfter = seen.slice(seen.lastIndexOf("loading") + 1);
  assert.deepEqual(statusesAfter, [], "response muộn không được phát event mới");
  assert.equal(core.getView().status, "loading",
    "state giữ nguyên như lúc destroy");
});

test("load lỗi 5xx -> offline; lỗi 401 -> no_session (phiên hết hạn)", async () => {
  const offline = makeCore({ overview: () => { throw new ZaloApiError("x", 503, "http"); } });
  await offline.core.load();
  assert.equal(offline.core.getView().status, "offline");
  offline.core.destroy();

  const expired = makeCore({ overview: () => { throw new ZaloApiError("x", 401, "http"); } });
  await expired.core.load();
  assert.equal(expired.core.getView().status, "no_session");
  assert.match(expired.core.getView().statusText, /hết hạn/);
  expired.core.destroy();
});

test("withdrawConsent wired -> note rõ ràng; hủy confirm -> không gọi API", async () => {
  const { core, calls, confirmCalls } = makeCore({
    postImpl: () => ({ purpose: "research", withdrawn: true }),
  });
  await core.load();
  const result = await core.withdrawConsent("research", "Nghiên cứu");
  assert.equal(result.status, "ok");
  assert.match(core.getView().consentNote, /Đã rút đồng ý/);
  assert.ok(confirmCalls.length >= 1);
  core.destroy();

  const declined = makeCore({ postImpl: () => { throw new Error("must not be called"); } });
  declined.core.destroy(); // không dùng
  const core2 = createPrivacyPageCore({
    api: {
      async get() { return OVERVIEW_OK; },
      async post() { throw new Error("must not be called"); },
    },
    getToken: async () => "tok",
    confirm: () => false,
  });
  await core2.load();
  const cancelled = await core2.withdrawConsent("research", "Nghiên cứu");
  assert.equal(cancelled.status, "cancelled");
  core2.destroy();
});
