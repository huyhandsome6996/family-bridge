import { register } from "node:module";
register(new URL("./asset-hook.mjs", import.meta.url));
// F15 privacy — DOM/integration tests ĐÃ THÍCH ỨNG SANG TRANG NATIVE /privacy
// (quyết định cây tích hợp: trang native id "privacy", chrome "app" là trang
// chính thức, parity 1:1 với web/src/pages/privacy/index.js; page-core cũ
// id "f15-privacy" không còn là điểm chặn UI). Ý NGHĨA từng assertion giữ
// nguyên — chỉ đổi ĐIỂM CHẶN UI + cách inject (ctx.adapter thay vì
// ctx.privacyApi.get/post, theo pattern privacyAdapter của web-screens.test.mjs):
//   1. page contract: id "privacy" + chrome "app" (thay id "f15-privacy").
//   2. chưa có phiên → trạng thái trung thực, KHÔNG gọi API riêng tư.
//   3. có phiên + dữ liệu → mục đang chia sẻ + nút Thu hồi (mở rộng: nút
//      "Tải thêm" cursor v2 — click truyền cursor thật, dedup theo khóa
//      item_type|item_id|share_id, dừng CÓ TRẦN khi không còn mục mới).
//   4. lỗi mạng → trạng thái lỗi thật + nút tải lại ("Thử lại" của native;
//      kiểm thêm: bấm phải tải lại thật sự, không ném lỗi).
//   5. double-click xác nhận Thu hồi → đúng MỘT mutation (trang native có
//      dialog confirm ở giữa: click Thu hồi → nút xác nhận .fb-dialog-root;
//      guard double-submit là tính năng MỚI port từ page-core).
//   6. mutation mất response (timeout) → đọc lại đúng MỘT lần, không tự
//      retry POST (tính năng MỚI port từ page-core: reconcile sau unknown).
//   7. destroy() dọn dẹp: response muộn không cập nhật lại nội dung.
//   8. kind=configuration → thông báo cấu hình (tính năng MỚI port từ
//      page-core: không nuốt lỗi cấu hình thành lỗi mạng chung).
//   9. Task 3-b (cursor v2 THẬT trên shared adapter): test MỚI — lần-2 "Tải
//      thêm" truyền ĐÚNG cursor trang-1 vào privacyOverview, dedup giữ nguyên,
//      has_more=false → nút ẨN THẬT (bị gỡ khỏi DOM). Không xóa assertion
//      nào của Task 3-a.
//  10. Task 3-c (P2-2/QA-3 — listDeletionRequests nối UI): test MỚI — mở trang
//      phải gọi listDeletionRequests; yêu cầu status "requested" từ máy chủ
//      hiện với nhãn trung thực + nút hủy trong danh sách (mở dialog confirm
//      của luồng hủy có sẵn); list lỗi → báo thật, không bịa rỗng;
//      has_more=true → nói thật là còn yêu cầu cũ hơn trên máy chủ và status
//      đã vào xử lý thì KHÔNG có nút hủy (kèm giải thích trung thực).
//      Không xóa assertion nào của các Task trước.
// Chạy: node --test tests/f15-privacy.test.mjs (happy-dom — không framework mới).

import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";

// happy-dom globals PHẢI gắn TRƯỚC khi import động pages (pattern US-003).
const window = new Window({ url: "https://localhost/" });
const { document } = window;
globalThis.window = window;
globalThis.document = document;
globalThis.Node = window.Node;
globalThis.Element = window.Element;
globalThis.HTMLElement = window.HTMLElement;
globalThis.DocumentFragment = window.DocumentFragment;
globalThis.Event = window.Event;
globalThis.CustomEvent = window.CustomEvent;
globalThis.HashChangeEvent = window.HashChangeEvent;
globalThis.location = window.location;
window.confirm = () => true;

const { page } = await import("../src/pages/privacy/index.js");
const { ApiError } = await import("../src/core/api/client.mjs");
const { setSession, clearSession } = await import("../src/core/session.js");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function textOf(el) {
  return (el && el.textContent ? el.textContent : "").replace(/\s+/g, " ").trim();
}

function mount(ctx) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const el = page.render(ctx || {});
  host.appendChild(el);
  return { host, el };
}

function withSession() {
  clearSession();
  setSession({ token: "token-x", userId: "u-f15", expiresAt: Date.now() + 3600_000 });
}

function ctxOf(adapter) {
  return {
    store: { getState: () => ({ demoMode: false }) },
    adapter,
    navigate: () => {},
  };
}

function grantsCard(root) {
  return Array.from(root.querySelectorAll(".fb-card"))
    .find((card) => textOf(card).includes("Đang chia sẻ"));
}

/** Nút xác nhận trong dialog (giữa luồng Thu hồi của trang native). */
function dialogButton(label) {
  const dialogRoot = document.body.querySelector(".fb-dialog-root");
  assert.ok(dialogRoot, "confirm dialog phải mở");
  const action = Array.from(dialogRoot.querySelectorAll("button"))
    .find((btn) => textOf(btn) === label);
  assert.ok(action, `dialog phải có nút ${label}`);
  return action;
}

/**
 * Grant mẫu: CÙNG item_id, KHÁC share_id — đúng hình dạng cursor v2 của
 * backend (dedup phía client phải dựa share_id, không chỉ item_id).
 */
function grant(shareId) {
  return {
    item_type: "mood_entry",
    item_id: "11111111-1111-1111-1111-111111111111",
    share_id: shareId,
    recipient_id: "22222222-2222-2222-2222-222222222222",
    approved_revision: 2,
    revoked: false,
  };
}

/**
 * Adapter theo pattern web-screens.test.mjs (privacyAdapter) — mở rộng cho
 * cursor v2: `pages` là các trang overview; lần gọi KHÔNG cursor trả
 * pages[0], lần gọi với cursor = next_cursor của trang i trả pages[i+1].
 * Task 3-c: mở rộng thêm nhóm deletion — `deletionRequests` là trang kết quả
 * listDeletionRequests (mặc định rỗng trung thực khi test cũ không truyền).
 */
function privacyAdapter({
  behavior = {}, pages = [], consents = null, deletionRequests = [],
  deletionHasMore = false,
} = {}) {
  const consentsState = consents === null
    ? [
      { purpose: "service", decision: "accepted", policy_version: "service-v1", withdrawn: false, current: true },
      { purpose: "ai_processing", decision: "none", policy_version: null, withdrawn: false, current: true },
      { purpose: "research", decision: "declined", policy_version: "research-v1", withdrawn: false, current: true },
    ]
    : JSON.parse(JSON.stringify(consents));
  const deletionState = JSON.parse(JSON.stringify(deletionRequests));
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const emptyPage = { shared_by_me: [], connections: [], next_cursor: null, has_more: false };
  return {
    mode: "zalo",
    privacyOverview: async ({ cursor = null } = {}) => {
      behavior.overviewCursors = behavior.overviewCursors || [];
      behavior.overviewCursors.push(cursor || null);
      if (behavior.overviewError) throw behavior.overviewError;
      if (!cursor) return clone(pages[0] || emptyPage);
      const idx = pages.findIndex((p) => p && p.next_cursor === cursor);
      if (idx === -1 || idx + 1 >= pages.length) return clone(emptyPage);
      return clone(pages[idx + 1]);
    },
    revokeGrant: async (args) => {
      behavior.revokeCalls = behavior.revokeCalls || [];
      behavior.revokeCalls.push(args);
      if (behavior.revokeDelayMs) await wait(behavior.revokeDelayMs);
      if (behavior.revokeError) throw behavior.revokeError;
      for (const pageData of pages) {
        for (const row of pageData.shared_by_me || []) {
          if (row.item_type === args.itemType && row.item_id === args.itemId) {
            row.revoked = true;
          }
        }
      }
      return { item_type: args.itemType, item_id: args.itemId, revoked: true };
    },
    listConsents: async () => {
      behavior.consentsCalls = behavior.consentsCalls || [];
      behavior.consentsCalls.push(true);
      return clone(consentsState);
    },
    // ---- Task 3-c: nhóm deletion (đúng shape shared adapter Task 3-b) ----
    listDeletionRequests: async () => {
      behavior.deletionListCalls = behavior.deletionListCalls || [];
      behavior.deletionListCalls.push(true);
      if (behavior.deletionListError) throw behavior.deletionListError;
      return {
        results: clone(deletionState),
        next_cursor: null,
        has_more: deletionHasMore === true,
      };
    },
    getDeletionRequest: async (requestId) => {
      behavior.detailCalls = behavior.detailCalls || [];
      behavior.detailCalls.push(requestId);
      if (behavior.detailError) throw behavior.detailError;
      const row = deletionState.find((r) => r && r.request_id === requestId);
      return row ? clone(row) : null;
    },
    cancelDeletionRequest: async (requestId, args = {}) => {
      behavior.cancelCalls = behavior.cancelCalls || [];
      behavior.cancelCalls.push({ requestId, args });
      if (behavior.cancelError) throw behavior.cancelError;
      const row = deletionState.find((r) => r && r.request_id === requestId);
      if (row) row.status = "cancelled";
      return { request_id: requestId, status: "cancelled" };
    },
  };
}

test("page contract: id/chrome/requiresRole + render trả HTMLElement", () => {
  clearSession();
  assert.equal(page.id, "privacy", "điểm chặn UI native (page-core cũ: f15-privacy)");
  assert.equal(page.title, "Riêng tư & đồng ý");
  assert.equal(page.requiresRole, true);
  assert.equal(page.requiresAuth, true);
  assert.equal(page.chrome, "app");
  assert.equal(page.showBottomNav, true, "hợp đồng trang native (page-core cũ: false)");
  const { host, el } = mount(ctxOf(privacyAdapter({})));
  assert.ok(el instanceof HTMLElement);
  assert.equal(el.dataset.page, "privacy");
  host.remove();
  page.destroy();
});

test("chưa có phiên đăng nhập -> trạng thái trung thực, không gọi API riêng tư", async () => {
  clearSession();
  const behavior = {};
  const api = privacyAdapter({ behavior });
  const { host } = mount(ctxOf(api)); // không có phiên (session rỗng)
  await wait(20);
  assert.match(textOf(host), /Cần đăng nhập để mở trang riêng tư/,
    "trạng thái không phiên phải trung thực (copy của trang native)");
  assert.equal((behavior.overviewCursors || []).length, 0,
    "không được gọi API riêng tư khi chưa có phiên");
  assert.equal((behavior.consentsCalls || []).length, 0,
    "không được gọi API đồng ý khi chưa có phiên");
  host.remove();
  page.destroy();
});

test("có phiên + API trả dữ liệu -> mục đang chia sẻ + nút thu hồi; Tải thêm cursor v2 + dedup + bounded", async () => {
  withSession();
  const behavior = {};
  const pages = [
    { shared_by_me: [grant("s1")], connections: [],
      next_cursor: "ov2|2026-10-19T01:00:00+00:00|s1", has_more: true },
    { shared_by_me: [grant("s1"), grant("s2")], connections: [],
      next_cursor: "ov2|2026-10-19T02:00:00+00:00|s2", has_more: true },
    { shared_by_me: [grant("s1"), grant("s2")], connections: [],
      next_cursor: "ov2|2026-10-19T03:00:00+00:00|s3", has_more: true },
  ];
  const api = privacyAdapter({ behavior, pages });
  const { host, el } = mount(ctxOf(api));
  await wait(30);
  const shared = grantsCard(el);
  assert.match(textOf(shared), /Ghi nhận tâm trạng/);
  assert.match(textOf(shared), /đang chia sẻ/);
  const revokeBtn = Array.from(shared.querySelectorAll("button"))
    .find((b) => /Thu hồi/.test(b.textContent));
  assert.ok(revokeBtn, "mục đang chia sẻ phải có nút Thu hồi");

  // (a) has_more=true -> nút "Tải thêm" có mặt (cursor v2, port R09)
  const loadMore = Array.from(shared.querySelectorAll("button"))
    .find((b) => /Tải thêm/.test(b.textContent));
  assert.ok(loadMore, "has_more=true phải có nút Tải thêm");

  // (b) click -> GET với cursor thật; dedup theo item_type|item_id|share_id
  loadMore.click();
  await wait(20);
  assert.equal(behavior.overviewCursors[1], "ov2|2026-10-19T01:00:00+00:00|s1",
    "click Tải thêm phải truyền đúng cursor v2 xuống GET");
  assert.equal(shared.querySelectorAll("[data-share-id]").length, 2,
    "s1 trùng không append; s2 mới được nối vào danh sách");
  assert.ok(shared.querySelector('[data-share-id="s2"]'),
    "share_id phải gắn theo từng item");

  // (c) trang kế không còn mục mới -> dừng CÓ TRẦN + nói thật
  Array.from(shared.querySelectorAll("button"))
    .find((b) => /Tải thêm/.test(b.textContent)).click();
  await wait(20);
  assert.equal(behavior.overviewCursors[2], "ov2|2026-10-19T02:00:00+00:00|s2");
  assert.equal(
    Array.from(shared.querySelectorAll("button"))
      .filter((b) => /Tải thêm/.test(b.textContent)).length,
    0,
    "0 mục mới -> ẩn nút Tải thêm (bounded, không lặp vô hạn cùng một trang)",
  );
  assert.match(textOf(shared), /Chưa tải thêm được mục mới nào/,
    "phải nói thật thay vì im lặng hoặc bịa thêm mục");
  host.remove();
  page.destroy();
  clearSession();
});

test("Task 3-b: Tải thêm lần 2 privacyOverview nhận cursor trang-1; append không trùng; has_more=false → ẩn nút thật", async () => {
  withSession();
  const behavior = {};
  const pages = [
    { shared_by_me: [grant("s1")], connections: [],
      next_cursor: "ov2|2026-10-19T01:00:00+00:00|s1", has_more: true },
    { shared_by_me: [grant("s1"), grant("s2")], connections: [],
      next_cursor: null, has_more: false },
  ];
  const api = privacyAdapter({ behavior, pages });
  const { host, el } = mount(ctxOf(api));
  await wait(30);
  const shared = grantsCard(el);

  // (1) trang-1 has_more=true → nút Tải thêm hiện thật (không hidden)
  const loadMore1 = Array.from(shared.querySelectorAll("button"))
    .find((b) => /Tải thêm/.test(b.textContent));
  assert.ok(loadMore1, "trang-1 has_more=true phải có nút Tải thêm");
  assert.ok(!loadMore1.hidden, "nút Tải thêm phải hiện thật (không hidden)");

  // (2) click lần 1 → lần gọi privacyOverview THỨ HAI phải nhận ĐÚNG cursor
  // trang-1 trả về (không phải null, không phải cursor khác)
  loadMore1.click();
  await wait(20);
  assert.equal(behavior.overviewCursors.length, 2,
    "lần gọi thứ hai phải xảy ra sau click Tải thêm");
  assert.equal(behavior.overviewCursors[1], "ov2|2026-10-19T01:00:00+00:00|s1",
    "lần 2 privacyOverview phải nhận đúng cursor trang-1 trả về");

  // (3) append KHÔNG TRÙNG (dedup share_id): s1 trùng không lặp, s2 mới nối vào
  assert.equal(shared.querySelectorAll('[data-share-id="s1"]').length, 1,
    "s1 trùng không được append lần hai (dedup theo share_id)");
  assert.ok(shared.querySelector('[data-share-id="s2"]'),
    "s2 mới phải được nối vào danh sách");
  assert.equal(shared.querySelectorAll("[data-share-id]").length, 2,
    "tổng mục hiển thị = trang-1 + đúng 1 mục mới");

  // (4) trang-2 has_more=false → nút ẨN THẬT: bị gỡ khỏi DOM (không chỉ disabled)
  const loadMore2 = Array.from(shared.querySelectorAll("button"))
    .find((b) => /Tải thêm/.test(b.textContent));
  assert.equal(loadMore2, undefined,
    "has_more=false → nút Tải thêm phải biến mất khỏi DOM (ẩn thật)");

  host.remove();
  page.destroy();
  clearSession();
});

test("API lỗi mạng -> trạng thái lỗi thật + nút tải lại, không ném lỗi", async () => {
  withSession();
  const behavior = { overviewError: new ApiError("mạng lỗi", 0, "network") };
  const api = privacyAdapter({ behavior, pages: [] });
  const { host, el } = mount(ctxOf(api));
  await wait(30);
  assert.match(textOf(el), /Không tải được trạng thái riêng tư/,
    "trạng thái lỗi mạng phải hiển thị thật (native copy)");
  // "Tải lại" của page-core F15 = "Thử lại" của trang native — cùng ý nghĩa.
  const reloadBtn = Array.from(el.querySelectorAll("button"))
    .find((b) => /Thử lại/.test(b.textContent));
  assert.ok(reloadBtn, "phải có nút tải lại ở trạng thái lỗi");
  // Bấm phải tải lại THẬT: bỏ lỗi -> trang render dữ liệu thật trở lại.
  behavior.overviewError = null;
  reloadBtn.click();
  await wait(30);
  assert.match(textOf(el), /Bạn chưa chia sẻ mục nào/,
    "nút tải lại phải gọi lại API và render trạng thái mới");
  host.remove();
  page.destroy();
  clearSession();
});

test("double-click xác nhận Thu hồi chỉ tạo MỘT mutation (guard double-submit)", async () => {
  withSession();
  const behavior = { revokeDelayMs: 25 }; // mutation chậm -> click sau rơi vào guard
  const api = privacyAdapter({
    behavior,
    pages: [{ shared_by_me: [grant("s1")], connections: [] }],
  });
  const { host, el } = mount(ctxOf(api));
  await wait(30);
  const revokeBtn = Array.from(grantsCard(el).querySelectorAll("button"))
    .find((b) => /Thu hồi/.test(b.textContent));
  revokeBtn.click(); // mở dialog confirm (giữa luồng thu hồi của trang native)
  const confirmBtn = dialogButton("Thu hồi");
  confirmBtn.click();
  confirmBtn.click(); // double-click
  confirmBtn.click(); // triple-click
  await wait(80);
  assert.equal(behavior.revokeCalls.length, 1,
    "double/triple click không được tạo mutation thứ hai");
  host.remove();
  page.destroy();
  clearSession();
});

test("mutation mất response (timeout) -> đọc lại đúng MỘT lần, không tự retry POST", async () => {
  withSession();
  const behavior = { revokeError: new ApiError("timeout", 0, "timeout") };
  const api = privacyAdapter({
    behavior,
    pages: [{ shared_by_me: [grant("s1")], connections: [] }],
  });
  const { host, el } = mount(ctxOf(api));
  await wait(30);
  Array.from(grantsCard(el).querySelectorAll("button"))
    .find((b) => /Thu hồi/.test(b.textContent)).click();
  dialogButton("Thu hồi").click();
  await wait(60);
  assert.equal(behavior.revokeCalls.length, 1, "không tự retry mutation");
  assert.equal(behavior.overviewCursors.length, 2,
    "phải đọc lại overview đúng MỘT lần sau unknown outcome "
    + "(1 lần tải đầu + 1 lần đối chiếu)");
  assert.match(textOf(el), /CHƯA XÁC ĐỊNH/,
    "note phải nói thật: kết quả chưa rõ, không tự gửi lại yêu cầu");
  host.remove();
  page.destroy();
  clearSession();
});

test("destroy() dọn dẹp: response muộn không cập nhật lại nội dung", async () => {
  withSession();
  let releaseLate;
  const late = new Promise((resolve) => { releaseLate = resolve; });
  const api = {
    mode: "zalo",
    privacyOverview: async () => late,
    listConsents: async () => [],
    revokeGrant: async () => ({}),
  };
  const { host } = mount(ctxOf(api));
  await wait(20);
  const before = textOf(host);
  page.destroy(); // rời trang
  releaseLate({
    shared_by_me: [grant("s-late")],
    connections: [], next_cursor: null, has_more: false,
  });
  await wait(30);
  assert.equal(textOf(host), before,
    "response muộn sau destroy không được render lại");
  host.remove();
  page.destroy(); // destroy lần hai phải an toàn
  clearSession();
});

test("lỗi cấu hình (kind=configuration) -> thông báo cấu hình, không nuốt thành lỗi mạng chung", async () => {
  withSession();
  const behavior = { overviewError: new ApiError("Chưa cấu hình", 0, "configuration") };
  const api = privacyAdapter({ behavior, pages: [] });
  const { host, el } = mount(ctxOf(api));
  await wait(30);
  assert.match(textOf(el), /chưa cấu hình địa chỉ máy chủ/i,
    "lỗi cấu hình phải có thông báo riêng, đúng thật");
  host.remove();
  page.destroy();
  clearSession();
});

test("Task 3-c: mở trang đọc lại yêu cầu xóa từ máy chủ; yêu cầu 'requested' hiện kèm nút Hủy nối vào luồng hủy có sẵn", async () => {
  withSession();
  const behavior = {};
  const api = privacyAdapter({
    behavior,
    pages: [{ shared_by_me: [grant("s1")], connections: [] }],
    deletionRequests: [{
      request_id: "9d2f0a10-1111-4111-8111-111111111111",
      status: "requested",
      scope_categories: ["journal", "mood"],
      requested_at: "2026-10-19T01:00:00+00:00",
      revision: 3,
    }],
  });
  const { host, el } = mount(ctxOf(api));
  await wait(30);
  assert.equal((behavior.deletionListCalls || []).length, 1,
    "mở trang phải gọi listDeletionRequests đúng 1 lần (phục hồi trạng thái sau reload)");

  const deletionCard = Array.from(el.querySelectorAll(".fb-card"))
    .find((card) => textOf(card).includes("Yêu cầu xóa dữ liệu"));
  assert.ok(deletionCard, "card yêu cầu xóa dữ liệu phải tồn tại");
  // Trạng thái TRUNG THỰC từ máy chủ — nhãn đúng DeletionRequest.STATUS_REQUESTED.
  assert.match(textOf(deletionCard), /Đã tiếp nhận — chờ xác minh/,
    "yêu cầu 'requested' phải hiện đúng nhãn trung thực của máy chủ");
  assert.match(textOf(deletionCard), /Nhật ký/,
    "phạm vi categories phải hiện nhãn tiếng Việt đúng models.py");

  // Nút hủy trong danh sách nối vào LUỒNG HỸ CÓ: click phải mở dialog confirm
  // (chưa mutation — chỉ xác nhận mở đúng dialog của luồng hủy hiện có).
  const cancelBtn = Array.from(deletionCard.querySelectorAll("button"))
    .find((b) => /Hủy yêu cầu xóa/.test(b.textContent));
  assert.ok(cancelBtn, "yêu cầu 'requested' phải có nút hủy trong danh sách");
  assert.equal((behavior.cancelCalls || []).length, 0,
    "chưa xác nhận qua dialog thì chưa được gọi cancelDeletionRequest");
  cancelBtn.click();
  dialogButton("Hủy yêu cầu");
  assert.equal((behavior.cancelCalls || []).length, 0,
    "mở dialog chưa tạo mutation; mutation chỉ chạy sau khi xác nhận");

  // Xác nhận hủy → đúng 1 lần cancelDeletionRequest với đúng request_id.
  dialogButton("Hủy yêu cầu").click();
  await wait(20);
  assert.equal((behavior.cancelCalls || []).length, 1,
    "xác nhận hủy phải tạo đúng 1 lần cancelDeletionRequest");
  assert.equal(behavior.cancelCalls[0].requestId,
    "9d2f0a10-1111-4111-8111-111111111111",
    "hủy đúng yêu cầu trong danh sách");
  assert.match(textOf(deletionCard), /Đã hủy/,
    "sau hủy thành công, hàng trong danh sách phải phản ánh trạng thái máy chủ trả về");

  host.remove();
  page.destroy();
  clearSession();
});

test("Task 3-c: listDeletionRequests lỗi -> card báo thật, không bịa thành 'chưa có yêu cầu nào'", async () => {
  withSession();
  const behavior = { deletionListError: new ApiError("mạng lỗi", 0, "network") };
  const api = privacyAdapter({
    behavior,
    pages: [{ shared_by_me: [], connections: [] }],
  });
  const { host, el } = mount(ctxOf(api));
  await wait(30);
  const deletionCard = Array.from(el.querySelectorAll(".fb-card"))
    .find((card) => textOf(card).includes("Yêu cầu xóa dữ liệu"));
  assert.ok(deletionCard, "card yêu cầu xóa dữ liệu vẫn render");
  assert.match(textOf(deletionCard), /Chưa tải được danh sách yêu cầu xóa từ máy chủ/,
    "lỗi tải danh sách phải báo thật trong card");
  assert.doesNotMatch(textOf(deletionCard), /Chưa có yêu cầu xóa nào được ghi nhận/,
    "KHÔNG được bịa danh sách rỗng khi chưa tải được dữ liệu");
  host.remove();
  page.destroy();
  clearSession();
});

test("Task 3-c: has_more=true phải nói thật là còn yêu cầu cũ hơn; status đã vào xử lý thì không nút hủy", async () => {
  withSession();
  const behavior = {};
  const api = privacyAdapter({
    behavior,
    pages: [{ shared_by_me: [], connections: [] }],
    deletionRequests: [{
      request_id: "9d2f0a10-2222-4222-8222-222222222222",
      status: "processing",
      scope_categories: ["journal"],
      requested_at: "2026-10-18T01:00:00+00:00",
      revision: 5,
    }],
    deletionHasMore: true,
  });
  const { host, el } = mount(ctxOf(api));
  await wait(30);
  const deletionCard = Array.from(el.querySelectorAll(".fb-card"))
    .find((card) => textOf(card).includes("Yêu cầu xóa dữ liệu"));
  assert.ok(deletionCard, "card yêu cầu xóa dữ liệu phải tồn tại");
  // Máy chủ cắt danh sách theo trang — UI phải nói thật, không giả vờ đủ.
  assert.match(textOf(deletionCard), /vẫn còn yêu cầu cũ hơn/,
    "has_more=true phải nói thật rằng còn yêu cầu cũ hơn trên máy chủ");
  // "processing" ĐÚNG models.py STATUS_PROCESSING: đã vào xử lý → không hủy.
  assert.match(textOf(deletionCard), /Đang xử lý/,
    "status 'processing' phải hiện đúng nhãn trung thực của máy chủ");
  const cancelBtn = Array.from(deletionCard.querySelectorAll("button"))
    .find((b) => /Hủy yêu cầu xóa/.test(b.textContent));
  assert.equal(cancelBtn, undefined,
    "yêu cầu đã vào xử lý KHÔNG được có nút hủy trong danh sách");
  assert.match(textOf(deletionCard), /không thể hủy/,
    "trạng thái không hủy được phải kèm giải thích trung thực");
  assert.equal((behavior.cancelCalls || []).length, 0,
    "không được có mutation hủy nào cho yêu cầu đã vào xử lý");
  host.remove();
  page.destroy();
  clearSession();
});
