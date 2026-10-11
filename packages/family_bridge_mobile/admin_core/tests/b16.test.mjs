import { test } from "node:test";
import assert from "node:assert/strict";
import { createAdminApi } from "../api.js";

function fakeApi() {
  const calls = [];
  return {
    calls,
    async post(path, opts) { calls.push(["POST", path, opts]); return { ok: 1 }; },
    async get(path, opts) { calls.push(["GET", path, opts]); return { results: [] }; },
  };
}

test("admin api wrappers hit contract paths", async () => {
  const api = fakeApi();
  const admin = createAdminApi({ api });
  await admin.myCaps();
  await admin.createDraft({ kind: "card", title: "Thẻ", body: "Nội dung" });
  await admin.publish("11111111-1111-1111-1111-111111111111", 1);
  await admin.retire("11111111-1111-1111-1111-111111111111", 1, "lý do quản trị");
  await admin.updateSetting("default_page_size", 20);
  await admin.audit();

  assert.equal(api.calls[0][1], "/api/v1/admin/capabilities");
  assert.equal(api.calls[2][2].body.expected_revision, 1);
  assert.match(api.calls[3][1], /\/retire$/);
  assert.equal(api.calls[3][2].body.reason, "lý do quản trị");
  assert.match(api.calls[4][1], /settings\/default_page_size$/);
  assert.equal(api.calls[5][1], "/api/v1/admin/audit");
});

test("page modules export factories", async () => {
  const admin = await import("../pages/admin.js");
  assert.equal(typeof admin.createPage, "function");
});

test("server-enforced wording; immutable settings read-only; textContent", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../pages/admin.js", import.meta.url), "utf8");
  assert.match(source, /bất biến — đọc thôi/);
  assert.match(source, /server-enforced|server-side/i === null ? /x/ : /SERVER-enforced|server-enforced|chỉ mirrors|only mirrors/i);
  assert.match(source, /Tài khoản này không có quyền quản trị/);
  assert.doesNotMatch(source, /innerHTML\s*=\s*[^`]*\$\{/);
});
