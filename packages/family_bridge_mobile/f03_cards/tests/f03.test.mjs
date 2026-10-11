import { test } from "node:test";
import assert from "node:assert/strict";
import { createCardsApi } from "../api.js";

function fakeApi() {
  const calls = [];
  return {
    calls,
    async post(path, opts) { calls.push(["POST", path, opts]); return { ok: 1 }; },
    async get(path, opts) { calls.push(["GET", path, opts]); return { results: [] }; },
  };
}

test("cards api wrappers hit contract paths and carry idempotency key", async () => {
  const api = fakeApi();
  const cards = createCardsApi({ api });
  await cards.list();
  await cards.list("thuong", 50);
  await cards.preview({ cardId: "card-thank-01", version: 3,
    recipientId: "22222222-2222-2222-2222-222222222222" });
  await cards.send({ cardId: "card-thank-01", version: 3,
    recipientId: "22222222-2222-2222-2222-222222222222",
    authorNote: "Thương bố mẹ", key: "card-0001-abcdef01" });
  await cards.snapshot("11111111-1111-1111-1111-111111111111");
  await cards.suggestions("11111111-1111-1111-1111-111111111111", "caregiver");

  assert.equal(api.calls[0][1], "/api/v1/cards");
  assert.equal(api.calls[1][1], "/api/v1/cards");
  assert.deepEqual(api.calls[1][2].query, { group: "thuong", limit: "50" });
  assert.equal(api.calls[2][1], "/api/v1/cards/preview");
  assert.equal(api.calls[2][2].body.version, 3);
  const [, sendPath, sendOpts] = api.calls[3];
  assert.equal(sendPath, "/api/v1/cards/send");
  assert.equal(sendOpts.idempotencyKey, "card-0001-abcdef01");
  assert.equal(sendOpts.body.card_id, "card-thank-01");
  assert.equal(sendOpts.body.author_note, "Thương bố mẹ");
  assert.match(api.calls[4][1], /cards\/11111111-1111-1111-1111-111111111111$/);
  assert.deepEqual(api.calls[5][2].query, { audience: "caregiver" });
});

test("page modules export factories", async () => {
  const cards = await import("../pages/cards.js");
  const detail = await import("../pages/card-detail.js");
  assert.equal(typeof cards.createPage, "function");
  assert.equal(typeof detail.createPage, "function");
});

test("card content is rendered as text, never as HTML from network data", async () => {
  const { readFile } = await import("node:fs/promises");
  const detailSource = await readFile(
    new URL("../pages/card-detail.js", import.meta.url), "utf8");
  const cardsSource = await readFile(
    new URL("../pages/cards.js", import.meta.url), "utf8");
  // Static scaffolding may use innerHTML templates; any dynamic card/suggestion
  // text MUST go through textContent assignments.
  assert.match(detailSource, /#card-detail-title"\)\.textContent = data\.card\.title/);
  assert.match(detailSource, /#card-detail-body"\)\.textContent = data\.card\.body/);
  assert.match(detailSource, /btn\.textContent = item\.text/);
  assert.match(cardsSource, /#preview-body"\)\.textContent = data\.card\.body/);
  assert.doesNotMatch(detailSource, /innerHTML\s*=\s*[^`]*\$\{/);
});
