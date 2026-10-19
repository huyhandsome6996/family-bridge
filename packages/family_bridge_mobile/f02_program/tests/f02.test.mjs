import { test } from "node:test";
import assert from "node:assert/strict";
import { createProgramApi } from "../api.js";

function fakeApi() {
  const calls = [];
  return {
    calls,
    async post(path, opts) { calls.push(["POST", path, opts]); return { ok: 1 }; },
    async get(path, opts) { calls.push(["GET", path, opts]); return { results: [] }; },
  };
}

test("program api wrappers hit contract paths", async () => {
  const api = fakeApi();
  const program = createProgramApi({ api });
  await program.catalog();
  await program.enroll({ programKey: "family-4w", programRevision: 2 });
  await program.optOut("family-4w");
  await program.weeks("family-4w");
  await program.progress({ programKey: "family-4w", weekNo: 1,
    activityKey: "act-chat-5", status: "done" });
  await program.acceptAgreement("family-4w");

  assert.equal(api.calls[0][1], "/api/v1/program/catalog");
  assert.equal(api.calls[1][2].body.program_revision, 2);
  assert.match(api.calls[2][1], /opt-out$/);
  assert.match(api.calls[3][1], /weeks\/family-4w$/);
  assert.equal(api.calls[4][2].body.week_no, 1);
  assert.match(api.calls[5][1], /agreement\/accept$/);
});

test("page modules export factories", async () => {
  const program = await import("../pages/program.js");
  assert.equal(typeof program.createPage, "function");
});

test("voluntary wording + per-person agreement + paper notebook option", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../pages/program.js", import.meta.url), "utf8");
  assert.match(source, /hoàn toàn tự nguyện/);
  assert.match(source, /mỗi người tự đồng ý/);
  assert.match(source, /sổ giấy/);
  assert.match(source, /\(gợi ý\)/);
  assert.doesNotMatch(source, /innerHTML\s*=\s*[^`]*\$\{/);
});

test("family agreement instance wrappers hit pair-bound contract paths", async () => {
  const api = fakeApi();
  const program = createProgramApi({ api });
  await program.agreementOverview("family-4w");
  await program.proposeAgreement("family-4w");
  await program.confirmAgreement("ag-1");
  await program.withdrawAgreement("ag-1");

  assert.match(api.calls[0][1], /^\/api\/v1\/program\/agreement$/);
  assert.equal(api.calls[0][2].query.program_key, "family-4w");
  assert.match(api.calls[1][1], /agreement\/propose$/);
  assert.match(api.calls[2][1], /agreement\/ag-1\/confirm$/);
  assert.match(api.calls[3][1], /agreement\/ag-1\/withdraw$/);
});
