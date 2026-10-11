import { test } from "node:test";
import assert from "node:assert/strict";
import { createJournalApi } from "../api.js";

function fakeApi() {
  const calls = [];
  return {
    calls,
    async post(path, opts) { calls.push(["POST", path, opts]); return { ok: 1 }; },
    async get(path, opts) { calls.push(["GET", path, opts]); return { results: [] }; },
    async patch(path, opts) { calls.push(["PATCH", path, opts]); return { ok: 1 }; },
    async delete(path, opts) { calls.push(["DELETE", path, opts]); return { ok: 1 }; },
  };
}

test("journal api wrappers hit contract paths with revision guard", async () => {
  const api = fakeApi();
  const journal = createJournalApi({ api });
  await journal.prompts();
  await journal.list(null, "góc phòng");
  await journal.create({ topicCode: "thu_nhap", title: "Trang", content: "nội dung" });
  await journal.edit("11111111-1111-1111-1111-111111111111",
    { content: "sửa", expectedRevision: 2 });
  await journal.share("11111111-1111-1111-1111-111111111111",
    "22222222-2222-2222-2222-222222222222");
  await journal.sharedDetail("33333333-3333-3333-3333-333333333333");
  await journal.reply("33333333-3333-3333-3333-333333333333", "phản hồi");
  await journal.revoke("33333333-3333-3333-3333-333333333333");
  await journal.discard("11111111-1111-1111-1111-111111111111");

  assert.deepEqual(api.calls[1][2].query, { search: "góc phòng" });
  const [, editPath, editOpts] = api.calls[3];
  assert.equal(api.calls[3][0], "PATCH");
  assert.equal(editOpts.body.expected_revision, 2);
  assert.match(api.calls[4][1], /\/share$/);
  assert.equal(api.calls[4][2].body.recipient_id,
    "22222222-2222-2222-2222-222222222222");
  assert.match(api.calls[5][1], /shared\/33333333-3333-3333-3333-333333333333$/);
  assert.match(api.calls[6][1], /\/replies$/);
  assert.equal(api.calls[6][2].body.body, "phản hồi");
  assert.match(api.calls[7][1], /shares\/33333333-3333-3333-3333-333333333333\/revoke$/);
  assert.equal(api.calls[8][0], "DELETE");
});

test("page modules export factories", async () => {
  const journal = await import("../pages/journal.js");
  const shared = await import("../pages/journal-shared.js");
  assert.equal(typeof journal.createPage, "function");
  assert.equal(typeof shared.createPage, "function");
});

test("pages render dynamic text via textContent; conflict wording present", async () => {
  const { readFile } = await import("node:fs/promises");
  const journalSrc = await readFile(
    new URL("../pages/journal.js", import.meta.url), "utf8");
  const sharedSrc = await readFile(
    new URL("../pages/journal-shared.js", import.meta.url), "utf8");
  assert.match(journalSrc, /#j-share-page"\)\.textContent =/);
  assert.match(journalSrc, /revision_conflict/);
  assert.match(journalSrc, /Tải lại trang mới nhất/);
  assert.match(sharedSrc, /#js-content"\)\.textContent = data\.page\.content/);
  assert.match(sharedSrc, /li\.textContent = row\.body/);
  assert.doesNotMatch(sharedSrc, /innerHTML\s*=\s*[^`]*\$\{/);
});
