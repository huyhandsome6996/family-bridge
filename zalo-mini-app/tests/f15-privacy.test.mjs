// F15 privacy — DOM/integration tests cho trang chính thức /privacy
// (router contract render(ctx) + destroy). Chạy: node --test tests/f15-privacy.test.mjs
// trong zalo-mini-app (happy-dom đã có sẵn — KHÔNG thêm framework mới).

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

function deferredApi({ overview, onPost } = {}) {
  const calls = [];
  let resolveFirstGet;
  const firstGet = new Promise((resolve) => { resolveFirstGet = resolve; });
  let getIndex = 0;
  return {
    calls,
    firstGetReady: firstGet,
    resolveFirstGet: () => resolveFirstGet({
      shared_by_me: [{
        item_type: "mood_entry", item_id: "11111111-1111-1111-1111-111111111111",
        share_id: "s1", recipient_id: "22222222-2222-2222-2222-222222222222",
        approved_revision: 2, revoked: false,
      }],
      connections: [], next_cursor: null, has_more: false,
    }),
    async get(path) {
      calls.push(["GET", path]);
      getIndex += 1;
      if (getIndex === 1) return firstGet;
      if (overview) return overview();
      return { shared_by_me: [], connections: [], next_cursor: null, has_more: false };
    },
    async post(path, opts) {
      calls.push(["POST", path, opts]);
      if (onPost) return onPost(path, opts);
      return { revoked: true };
    },
  };
}

test("page contract: id/title/requiresRole + render trả HTMLElement", () => {
  assert.equal(page.id, "f15-privacy");
  assert.equal(page.title, "Quyền riêng tư");
  assert.equal(page.requiresRole, true);
  assert.equal(page.showBottomNav, false);
  const { host, el } = mount({});
  assert.ok(el instanceof HTMLElement);
  assert.equal(el.dataset.page, "f15-privacy");
  host.remove();
  page.destroy();
});

test("chưa có phiên đăng nhập -> trạng thái trung thực, không gọi API riêng tư", async () => {
  const api = deferredApi();
  const { host } = mount({ privacyApi: api }); // không có ctx.getToken
  await wait(20);
  const status = host.querySelector("[data-role=page-status]");
  assert.match(textOf(status), /chưa có phiên đăng nhập/i);
  assert.deepEqual(api.calls.filter((c) => c[0] === "GET").length, 0,
    "không được gọi API riêng tư khi chưa có token");
  host.remove();
  page.destroy();
});

test("có phiên + API trả dữ liệu -> hiện mục đang chia sẻ + nút thu hồi", async () => {
  const api = deferredApi();
  const { host } = mount({
    privacyApi: api,
    getToken: () => "token-x",
  });
  api.resolveFirstGet();
  await wait(30);
  const shared = host.querySelector("[data-role=shared-list]");
  assert.match(textOf(shared), /Tâm trạng/);
  assert.match(textOf(shared), /đang chia sẻ/);
  const revokeBtn = [...shared.querySelectorAll("button")]
    .find((b) => /Thu hồi/.test(b.textContent));
  assert.ok(revokeBtn, "mục đang chia sẻ phải có nút Thu hồi");
  host.remove();
  page.destroy();
});

test("API lỗi mạng -> trạng thái offline + nút Tải lại, không ném lỗi", async () => {
  let getIndex = 0;
  const api = {
    calls: [],
    async get() {
      getIndex += 1;
      if (getIndex === 1) throw new ApiError("mạng lỗi", 0, "network");
      return { shared_by_me: [], connections: [], has_more: false };
    },
    async post() { return {}; },
  };
  const { host } = mount({ privacyApi: api, getToken: () => "token-x" });
  await wait(30);
  const status = host.querySelector("[data-role=page-status]");
  assert.match(textOf(status), /Mạng không ổn định/i);
  const reload = [...host.querySelectorAll("button")]
    .find((b) => /Tải lại/.test(b.textContent));
  assert.ok(reload, "phải có nút Tải lại ở trạng thái offline");
  host.remove();
  page.destroy();
});

test("double-click Thu hồi chỉ tạo MỘT mutation (guard double-submit)", async () => {
  let postCount = 0;
  const api = deferredApi({
    onPost: async () => {
      postCount += 1;
      await wait(25); // mutation chậm -> click thứ hai rơi vào guard
      return { revoked: true };
    },
  });
  const { host } = mount({ privacyApi: api, getToken: () => "token-x" });
  api.resolveFirstGet();
  await wait(30);
  const shared = host.querySelector("[data-role=shared-list]");
  const revokeBtn = [...shared.querySelectorAll("button")]
    .find((b) => /Thu hồi/.test(b.textContent));
  revokeBtn.click();
  revokeBtn.click(); // double-click
  revokeBtn.click();
  await wait(80);
  assert.equal(postCount, 1, "double/triple click không được tạo mutation thứ hai");
  host.remove();
  page.destroy();
});

test("mutation mất response (timeout) -> đọc lại đúng MỘT lần, không tự retry POST", async () => {
  const api = deferredApi({
    onPost: async () => { throw new ApiError("timeout", 0, "timeout"); },
    overview: () => ({
      shared_by_me: [], connections: [], has_more: false,
    }),
  });
  const { host } = mount({ privacyApi: api, getToken: () => "token-x" });
  api.resolveFirstGet();
  await wait(30);
  const shared = host.querySelector("[data-role=shared-list]");
  const revokeBtn = [...shared.querySelectorAll("button")]
    .find((b) => /Thu hồi/.test(b.textContent));
  revokeBtn.click();
  await wait(60);
  const posts = api.calls.filter((c) => c[0] === "POST");
  const gets = api.calls.filter((c) => c[0] === "GET");
  assert.equal(posts.length, 1, "không tự retry mutation");
  assert.ok(gets.length >= 2, "phải có GET đọc lại sau unknown outcome");
  host.remove();
  page.destroy();
});

test("destroy() dọn dẹp: response muộn không cập nhật lại nội dung", async () => {
  let getIndex = 0;
  let releaseLate;
  const late = new Promise((resolve) => { releaseLate = resolve; });
  const api = {
    calls: [],
    async get() {
      getIndex += 1;
      if (getIndex === 1) return { shared_by_me: [], connections: [], has_more: false };
      return late;
    },
    async post() { return {}; },
  };
  const { host } = mount({ privacyApi: api, getToken: () => "token-x" });
  await wait(20);
  const statusBefore = textOf(host.querySelector("[data-role=page-status]"));
  page.destroy(); // rời trang
  releaseLate({
    shared_by_me: [{
      item_type: "mood_entry", item_id: "11111111-1111-1111-1111-111111111111",
      recipient_id: "r", approved_revision: 1, revoked: false,
    }],
    connections: [], has_more: false,
  });
  await wait(30);
  assert.equal(textOf(host.querySelector("[data-role=page-status]")), statusBefore,
    "response muộn sau destroy không được render lại");
  host.remove();
  page.destroy(); // destroy lần hai phải an toàn
});

test("offline error của client.mjs (kind=configuration) -> thông báo cấu hình", async () => {
  const api = {
    calls: [],
    async get() { throw new ApiError("Chưa cấu hình", 0, "configuration"); },
    async post() { return {}; },
  };
  const { host } = mount({ privacyApi: api, getToken: () => "token-x" });
  await wait(30);
  assert.match(textOf(host.querySelector("[data-role=page-status]")),
    /chưa cấu hình địa chỉ máy chủ/i);
  host.remove();
  page.destroy();
});
