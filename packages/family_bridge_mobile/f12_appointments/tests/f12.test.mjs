import { test } from "node:test";
import assert from "node:assert/strict";
import { createAppointmentsApi } from "../api.js";

function fakeApi() {
  const calls = [];
  return {
    calls,
    async post(path, opts) { calls.push(["POST", path, opts]); return { ok: 1 }; },
    async get(path, opts) { calls.push(["GET", path, opts]); return { results: [] }; },
  };
}

test("appointments api wrappers hit contract paths", async () => {
  const api = fakeApi();
  const ap = createAppointmentsApi({ api });
  await ap.directory();
  await ap.create({ topic: "tinh_cam", note: "lời nhắn" });
  await ap.propose("11111111-1111-1111-1111-111111111111",
    "2026-10-12T09:00:00+00:00");
  await ap.accept("11111111-1111-1111-1111-111111111111",
    "22222222-2222-2222-2222-222222222222");
  await ap.decline("11111111-1111-1111-1111-111111111111",
    "22222222-2222-2222-2222-222222222222");
  await ap.cancel("11111111-1111-1111-1111-111111111111");
  await ap.queue();

  assert.equal(api.calls[0][1], "/api/v1/appointments/directory");
  assert.equal(api.calls[1][2].body.topic, "tinh_cam");
  assert.equal(api.calls[2][2].body.start_at, "2026-10-12T09:00:00+00:00");
  assert.match(api.calls[3][1], /\/accept$/);
  assert.match(api.calls[4][1], /\/decline$/);
  assert.match(api.calls[5][1], /\/cancel$/);
  assert.equal(api.calls[6][1], "/api/v1/appointments/queue");
});

test("page modules export factories", async () => {
  const ap = await import("../pages/appointments.js");
  assert.equal(typeof ap.createPage, "function");
});

test("honest scheduling wording; call on tap only; textContent", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../pages/appointments.js", import.meta.url), "utf8");
  assert.match(source, /Chưa có lịch hẹn nào cho tới khi thầy cô đề xuất và bạn xác nhận/);
  assert.match(source, /scheduling_no_staff/);
  assert.match(source, /addEventListener\("click"[\s\S]{0,160}openPhone/);
  assert.doesNotMatch(source, /innerHTML\s*=\s*[^`]*\$\{/);
});
