import { test } from "node:test";
import assert from "node:assert/strict";
import { createSupportersApi } from "../api.js";
import { readFile } from "node:fs/promises";

function sourceOf() {
  return readFile(new URL("../pages/supporters.js", import.meta.url), "utf8");
}

function fakeApi() {
  const calls = [];
  return {
    calls,
    async post(path, opts) { calls.push(["POST", path, opts]); return { ok: 1 }; },
    async get(path, opts) { calls.push(["GET", path, opts]); return { results: [] }; },
  };
}

test("supporters api wrappers hit contract paths, contact carries key", async () => {
  const api = fakeApi();
  const sup = createSupportersApi({ api });
  await sup.list();
  await sup.invite({ supporterId: "22222222-2222-2222-2222-222222222222",
    relationshipKind: "family" });
  await sup.respond("33333333-3333-3333-3333-333333333333", "accept");
  await sup.contact({ roleId: "33333333-3333-3333-3333-333333333333",
    body: "lời nhắn mới", key: "sup-0001-abcdef01" });
  await sup.commitments();

  assert.equal(api.calls[0][1], "/api/v1/supporters/roles");
  assert.equal(api.calls[1][2].body.relationship_kind, "family");
  assert.match(api.calls[2][1], /\/respond$/);
  const [, contactPath, contactOpts] = api.calls[3];
  assert.match(contactPath, /\/contact$/);
  assert.equal(contactOpts.idempotencyKey, "sup-0001-abcdef01");
  assert.deepEqual(Object.keys(contactOpts.body).sort(), ["body"]);
  assert.equal(api.calls[4][1], "/api/v1/supporters/commitments");
});

test("page modules export factories", async () => {
  const supporters = await import("../pages/supporters.js");
  assert.equal(typeof supporters.createPage, "function");
});

test("no-context wording + help link present; textContent rendering", async () => {
  const source = await sourceOf();
  assert.match(source, /href="#\/help"/);
  assert.match(source, /không\s+đính\s+kèm\s+thư/);
  assert.match(source, /Chờ\s+người\s+đó\s+tự\s+đồng\s+ý/);
  assert.match(source, /Điểm\s+tựa\s+này\s+chưa\s+nhận\s+lời\s+hoặc\s+đã\s+hết\s+hiệu\s+lực/);
  assert.match(source, /Dừng\s+đồng\s+hành/);
  assert.match(source, /sup-contact-cancel/);
  assert.match(source, /Lời\s+mời\s+làm\s+điểm\s+tựa\s+cho\s+người\s+khác/);
  assert.doesNotMatch(source, /innerHTML\s*=\s*[^`]*\$\{/);
});

test("contact DTO whitelists only `body` — rejects quoted_letter/journal_page/draft_id/original", async () => {
  const api = fakeApi();
  const sup = createSupportersApi({ api });
  await sup.contact({ roleId: "33333333-3333-3333-3333-333333333333",
    body: "lời nhắn mới",
    key: "sup-0001-abcdef01" });
  const [, contactPath, contactOpts] = api.calls[0];
  assert.deepEqual(Object.keys(contactOpts.body).sort(), ["body"]);
  assert.equal(contactOpts.body.body, "lời nhắn mới");
  assert.equal(Object.keys(contactOpts.body).length, 1);
  assert.ok(!("quoted_letter" in contactOpts.body));
  assert.ok(!("journal_page" in contactOpts.body));
  assert.ok(!("draft_id" in contactOpts.body));
  assert.ok(!("original" in contactOpts.body));
  assert.equal(contactPath, "/api/v1/supporters/roles/33333333-3333-3333-3333-333333333333/contact");
});

test("contact form source renders no attachment/upload/file input — fresh text only", async () => {
  const source = await sourceOf();
  assert.doesNotMatch(source, /<input[^>]*type=["']file["']/);
  assert.doesNotMatch(source, /<input[^>]*accept=["'][^"']*["']/);
  assert.match(source, /<textarea id="sup-body"/);
  assert.match(source, /maxlength="4000"/);
  // Disclaimer present: no legacy data attached
  assert.match(source, /không\s+đính\s+kèm\s+thư\s+hay\s+nhật\s+ký\s+cũ/);
});

test("renderRoles source filters to active-only rows — non-active completely removed from DOM", async () => {
  const source = await sourceOf();
  // Client filter: only active + can_contact rows are rendered
  assert.match(source, /rows\.filter\(\(row\)\s*=>\s*row\.status\s*===\s*"active"\s*&&\s*row\.can_contact\)/);
  // No disabled/hidden placeholder rendering for non-active rows
  assert.doesNotMatch(source, /disabled\s*=.*["']true["']/);
  // Non-active rows are not iterated for rendering — only activeRows
  assert.match(source, /for\s+\(const\s+row\s+of\s+activeRows\)/);
});

test("no auto-send or auto-forward timers in page source — user must explicitly confirm", async () => {
  const source = await sourceOf();
  assert.doesNotMatch(source, /setInterval\b/);
  assert.doesNotMatch(source, /setTimeout\b/);
  assert.doesNotMatch(source, /autoForward|autoSend|auto-forward|auto-send/i);
  assert.match(source, /sending\s*=\s*true/); // manual send guard
});

test("disclaimer static text present on contact form — no 24/7 commitment", async () => {
  const source = await sourceOf();
  assert.match(source, /Người hỗ trợ đã đồng ý tiếp nhận/);
  assert.match(source, /không cam kết trực 24 giờ hay hỗ trợ ngay mọi lúc/);
  // Manual suggestion options present
  assert.match(source, /Chọn điểm tựa khác|Mở Trang tìm trợ giúp|#\/help/);
});

