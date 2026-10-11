import { test } from "node:test";
import assert from "node:assert/strict";
import { createSignalApi } from "../api.js";

function fakeApi() {
  const calls = [];
  return {
    calls,
    async post(path, opts) { calls.push(["POST", path, opts]); return { ok: 1 }; },
    async get(path, opts) { calls.push(["GET", path, opts]); return { results: [] }; },
  };
}

test("signal api wrappers hit contract paths and carry idempotency key", async () => {
  const api = fakeApi();
  const signal = createSignalApi({ api });
  await signal.meta();
  await signal.preview({ need: "muon_tro_chuyen",
    recipientId: "22222222-2222-2222-2222-222222222222" });
  await signal.send({ need: "muon_tro_chuyen",
    recipientId: "22222222-2222-2222-2222-222222222222",
    key: "signal-001-abcdef01" });
  await signal.detail("11111111-1111-1111-1111-111111111111");
  await signal.ack("11111111-1111-1111-1111-111111111111");

  assert.equal(api.calls[0][1], "/api/v1/signals/meta");
  assert.equal(api.calls[1][1], "/api/v1/signals/preview");
  const [, sendPath, sendOpts] = api.calls[2];
  assert.equal(sendPath, "/api/v1/signals/send");
  assert.equal(sendOpts.idempotencyKey, "signal-001-abcdef01");
  assert.equal(sendOpts.body.need, "muon_tro_chuyen");
  assert.equal(Object.keys(sendOpts.body).sort().join(","),
    "need,recipient_id"); // DTO minimal: no draft/AI fields
  assert.match(api.calls[3][1], /signals\/11111111-1111-1111-1111-111111111111$/);
  assert.match(api.calls[4][1], /\/ack$/);
});

test("page modules export factories", async () => {
  const signal = await import("../pages/signal.js");
  assert.equal(typeof signal.createPage, "function");
});

test("help route reachable in failure states; no auto-escalation wording", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../pages/signal.js", import.meta.url), "utf8");
  assert.match(source, /href="#\/help"/);
  assert.match(source, /Gửi chưa thành công[\s\S]{0,80}Trang tìm trợ giúp/);
  assert.match(source, /không ai bảo đảm trả lời ngay/);
  assert.match(source, /tự chọn liên hệ điểm tựa khác/);
  assert.doesNotMatch(source, /innerHTML\s*=\s*[^`]*\$\{/);
});
