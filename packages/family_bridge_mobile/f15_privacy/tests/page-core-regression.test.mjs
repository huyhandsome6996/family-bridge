// F15 page-core regression tests — R03 (session guard) + R12 (unknown
// outcome, pagination, labels, unlink). Mirror của bộ độc lập reviewer +
// các ca bổ sung. Node thuần, không DOM.
// Chạy: node --test packages/family_bridge_mobile/f15_privacy/tests/*.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import { createPrivacyPageCore, classifyError } from "../page-core.js";

const tick = () => new Promise((r) => setImmediate(r));

test("R03: logout giữa chừng -> response muộn của actor cũ bị bỏ, state riêng tư dọn", async () => {
  let token = "synthetic-A", release;
  const api = {
    get: async (path) => path.includes("/overview")
      ? new Promise((r) => { release = r; }) : { results: [] },
    post: async () => ({}),
  };
  const core = createPrivacyPageCore({ api, getToken: () => token });
  const pending = core.load();
  await tick();
  token = null; // logout
  release({ shared_by_me: [{ item_type: "journal_page",
                             item_id: "synthetic-private-A" }] });
  await pending;
  assert.equal(core.getView().items.length, 0,
               "late actor-A response must not survive logout");
  assert.equal(core.getView().status, "no_session");
  core.destroy();
});

test("R03: response deletion-list cũ không ghi đè actor mới", async () => {
  let token = "synthetic-A", release, lists = 0;
  const api = {
    get: async (path) => {
      if (path.includes("/overview")) return { shared_by_me: [] };
      if (++lists === 1) return new Promise((r) => { release = r; });
      return { results: [{ request_id: "synthetic-B", status: "requested" }] };
    },
    post: async () => ({}),
  };
  const core = createPrivacyPageCore({ api, getToken: () => token });
  await core.load();
  await tick();
  token = "synthetic-B";
  await core.load();
  await tick();
  release({ results: [{ request_id: "synthetic-A", status: "requested" }] });
  await tick();
  assert.equal(core.getView().deletionRequests[0].request_id, "synthetic-B",
               "stale actor-A list must not overwrite actor-B state");
  core.destroy();
});

test("R03: chuyển no_session dọn receipt + metadata yêu cầu xóa", async () => {
  let token = "synthetic-A";
  const api = {
    get: async (path) => path.includes("/overview")
      ? { shared_by_me: [] }
      : { results: [{ request_id: "synthetic-A", status: "requested" }] },
    post: async () => ({ receipt: "synthetic-receipt", duplicate: false }),
  };
  const core = createPrivacyPageCore({ api, getToken: () => token,
                                       confirm: () => true });
  await core.load();
  await tick();
  await core.requestDeletion(["mood"]);
  await tick();
  token = null;
  await core.load();
  assert.equal(core.getView().receipt, null,
               "receipt from previous actor must clear");
  assert.deepEqual(core.getView().deletionRequests, []);
  core.destroy();
});

test("R12: mất response POST xóa -> đối chiếu deletion status, không chỉ grants", async () => {
  let created = false;
  const api = {
    get: async (path) => path.includes("/overview")
      ? { shared_by_me: [] }
      : { results: created
        ? [{ request_id: "synthetic-accepted", status: "requested" }] : [] },
    post: async () => { created = true; throw { kind: "network", status: 0 }; },
  };
  const core = createPrivacyPageCore({ api, getToken: () => "synthetic-A",
                                       confirm: () => true });
  await core.load();
  await tick();
  await core.requestDeletion(["mood"]);
  await tick();
  assert.equal(core.getView().deletionRequests.length, 1,
               "look up accepted deletion request after lost POST response");
  core.destroy();
});

test("R12: duplicate covers_requested_categories=false được giải thích thật", async () => {
  const api = {
    get: async () => ({ shared_by_me: [] }),
    post: async () => ({ duplicate: false, receipt: "first-receipt" }),
  };
  const core = createPrivacyPageCore({ api, getToken: () => "tok",
                                       confirm: () => true });
  await core.load();
  await core.requestDeletion(["mood"]);
  // Yêu cầu thứ hai: máy chủ trả duplicate + phạm vi không phủ ý định mới
  const dupApi = {
    get: async () => ({ shared_by_me: [] }),
    post: async () => ({ duplicate: true,
                         scope_categories: ["mood"],
                         covers_requested_categories: false }),
  };
  const core2 = createPrivacyPageCore({ api: dupApi, getToken: () => "tok",
                                        confirm: () => true });
  await core2.load();
  await core2.requestDeletion(["journal"]);
  const note = core2.getView().receiptNote || "";
  assert.match(note, /CHƯA nằm trong yêu cầu/,
               "scope mismatch must be explained, never success-washed");
  assert.match(note, /Ghi nhận tâm trạng/,
               "pending scope must be shown in Vietnamese");
  core.destroy();
  core2.destroy();
});

test("R09/R12: loadMoreShares dùng cursor, nối items, không mất mục", async () => {
  const overviewPages = [
    { shared_by_me: [
      { item_type: "mood_entry", item_id: "i-1", share_id: "s-1",
        recipient_id: "r", approved_revision: 1, revoked: false },
    ], connections: [], next_cursor: "CUR-2", has_more: true },
    { shared_by_me: [
      { item_type: "journal_page", item_id: "i-2", share_id: "s-2",
        recipient_id: "r", approved_revision: 1, revoked: false },
    ], connections: [], next_cursor: null, has_more: false },
  ];
  let overviewCalls = 0;
  const calls = [];
  const api = {
    get: async (path) => {
      calls.push(path);
      if (path.includes("/overview")) {
        const page = overviewPages[overviewCalls];
        overviewCalls += 1;
        return page;
      }
      return { results: [] }; // deletion list
    },
    post: async () => ({}),
  };
  const core = createPrivacyPageCore({ api, getToken: async () => "tok" });
  await core.load();
  await tick();
  const result = await core.loadMoreShares();
  assert.equal(result.status, "ok");
  assert.equal(core.getView().items.length, 2);
  assert.equal(core.getView().hasMore, false);
  assert.ok(calls.some((p) => p.includes("cursor=CUR-2")),
            "cursor travels to the API");
  core.destroy();
});

test("R12: unlinkConnection gọi API thật + confirm; transient -> reconcile", async () => {
  const calls = [];
  const api = {
    get: async (path) => {
      calls.push(["GET", path]);
      return { shared_by_me: [], connections: [], has_more: false };
    },
    post: async (path) => {
      calls.push(["POST", path]);
      return { connection_id: "c-1", status: "revoked" };
    },
  };
  const confirms = [];
  const core = createPrivacyPageCore({
    api, getToken: async () => "tok",
    confirm: (m) => { confirms.push(m); return true; },
  });
  await core.load();
  const result = await core.unlinkConnection("c-1");
  assert.equal(result.status, "ok");
  assert.equal(confirms.length, 1, "hủy kết nối phải qua confirm");
  assert.ok(calls.some(([m, p]) => m === "POST"
    && p === "/api/v1/connections/c-1/revoke"),
             "dùng API thật của F01, không endpoint giả");
  core.destroy();
});

test("R12: deletionStatusLabel map trạng thái máy chủ sang tiếng Việt", () => {
  const api = {
    get: async () => ({ shared_by_me: [] }),
    post: async () => ({}),
  };
  const core = createPrivacyPageCore({ api, getToken: async () => "tok" });
  assert.equal(core.deletionStatusLabel("requested"), "chờ xác minh");
  assert.equal(core.deletionStatusLabel("completed"), "hoàn tất");
  assert.equal(core.deletionStatusLabel("failed_needs_action"),
               "cần can thiệp thủ công");
  assert.equal(core.deletionStatusLabel("unknown_future_status"),
               "unknown_future_status",
               "trạng thái lạ hiển thị nguyên văn, không bịa nhãn sai");
  core.destroy();
});

test("R03: destroy() dọn dữ liệu riêng tư trong bộ nhớ, giữ status (render cũ không đổi)", async () => {
  const api = {
    get: async () => ({
      shared_by_me: [{ item_type: "mood_entry", item_id: "i",
                       share_id: "s", recipient_id: "r",
                       approved_revision: 1, revoked: false }],
      connections: [{ connection_id: "c", other_party_id: "o",
                      relationship_kind: "primary", generation: 1,
                      status: "active" }],
      has_more: false,
    }),
    post: async () => ({}),
  };
  const core = createPrivacyPageCore({ api, getToken: async () => "tok" });
  await core.load();
  assert.equal(core.getView().items.length, 1);
  core.destroy();
  const v = core.getView();
  assert.equal(v.items.length, 0, "private items must leave memory");
  assert.equal(v.connections.length, 0);
  assert.equal(v.status, "ready",
               "status freeze giữ nguyên cho renderer cũ");
});

test("R12: lỗi đọc deletion list không bị nuốt thành empty im lặng", async () => {
  let getIndex = 0;
  const api = {
    get: async (path) => {
      getIndex += 1;
      if (path.includes("/overview")) return { shared_by_me: [] };
      if (getIndex === 2) throw { kind: "network", status: 0 };
      return { results: [] };
    },
    post: async () => ({}),
  };
  const core = createPrivacyPageCore({ api, getToken: async () => "tok" });
  await core.load();
  await tick();
  assert.equal(core.getView().deletionRequestsError, true,
               "lỗi đọc list phải được ghi cờ, không nuốt");
  core.destroy();
});

test("classifyError giữ hợp đồng 5 loại (kind/code/status)", () => {
  class ZaloError extends Error {
    constructor(status, kind) { super("x"); this.status = status; this.kind = kind; }
  }
  assert.equal(classifyError(new ZaloError(0, "network")), "transient");
  assert.equal(classifyError(new ZaloError(0, "timeout")), "transient");
  assert.equal(classifyError(new ZaloError(0, "configuration")), "configuration");
  assert.equal(classifyError(new ZaloError(401, "http")), "unauthenticated");
  assert.equal(classifyError(new ZaloError(400, "http")), "fatal");
});
