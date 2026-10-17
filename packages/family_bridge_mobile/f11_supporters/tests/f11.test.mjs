import { test } from "node:test";
import assert from "node:assert/strict";
import { createSupportersApi } from "../api.js";

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
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../pages/supporters.js", import.meta.url), "utf8");
  assert.match(source, /href="#\/help"/);
  assert.match(source, /không đính kèm thư/);
  assert.match(source, /Chờ người đó tự đồng ý/);
  assert.match(source, /Điểm tựa này chưa nhận lời hoặc đã hết hiệu lực/);
  assert.match(source, /Dừng đồng hành/);
  assert.match(source, /sup-contact-cancel/);
  assert.match(source, /Lời mời làm điểm tựa cho người khác/);
  assert.doesNotMatch(source, /innerHTML\s*=\s*[^`]*\$\{/);
});

