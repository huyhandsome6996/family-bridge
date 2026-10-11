import { test } from "node:test";
import assert from "node:assert/strict";
import { createSurveysApi } from "../api.js";

function fakeApi() {
  const calls = [];
  return {
    calls,
    async post(path, opts) { calls.push(["POST", path, opts]); return { ok: 1 }; },
    async get(path, opts) { calls.push(["GET", path, opts]); return { results: [] }; },
  };
}

test("surveys api wrappers hit contract paths", async () => {
  const api = fakeApi();
  const surveys = createSurveysApi({ api });
  await surveys.forms();
  await surveys.setConsent({ purpose: "pre_post_study", decision: "grant" });
  await surveys.submit({ formKey: "wellbeing-pre", formRevision: 1,
    phase: "pre", answers: { mood_scale: 3 } });
  await surveys.report("wellbeing-pre", 1, "pre");

  assert.equal(api.calls[0][1], "/api/v1/surveys/forms");
  assert.equal(api.calls[1][2].body.decision, "grant");
  assert.equal(api.calls[2][2].body.form_revision, 1);
  assert.equal(api.calls[3][2].query.revision, "1");
  assert.equal(api.calls[3][2].query.phase, "pre");
});

test("page modules export factories", async () => {
  const surveys = await import("../pages/surveys.js");
  assert.equal(typeof surveys.createPage, "function");
});

test("voluntary wording + no free-text inputs; textContent rendering", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../pages/surveys.js", import.meta.url), "utf8");
  assert.match(source, /KHÔNG ảnh hưởng bất kỳ\s*\n?\s*tính năng nào khác/);
  assert.match(source, /textarea/i === null ? /x/ : /input\.type = "number"/);
  assert.doesNotMatch(source, /<textarea/i);
  assert.doesNotMatch(source, /innerHTML\s*=\s*[^`]*\$\{/);
});
