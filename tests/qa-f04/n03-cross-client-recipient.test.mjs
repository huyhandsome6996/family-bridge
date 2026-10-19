// tests/qa-f04/n03-cross-client-recipient.test.mjs — A5 độc lập (F04R2-A5).
//
// Mục đích: probe regression cho N03 (QA F04 19/10, P1 "UI duyệt A nhưng
// thực gửi B sau khi client kia đổi recipient") theo ĐÚNG chuỗi audit:
//   client B đổi recipient + lưu → client A bấm Xem trước → Django trả
//   preview.recipient_id=B → UI vẫn bind tên người nhận CŨ → confirm 200 →
//   thư tới B (wrongRecipientReceived=true — cross-client-recipient.json
//   của audit, 2/2 chiều).
//
// Hợp đồng SAU FIX (worklog F04R2-LEAD-1, "Contract chốt"):
//   preview sheet bind TỪ preview response (recipient_id/revision/body);
//   lệch snapshot server → invalidate + refresh + note trung thực;
//   fail-closed khi recipient không resolve được. Backend (ec29abb) ĐÃ có
//   preview trả recipient_id/revision/body và confirm chặn preview cũ
//   (preview_stale 409) — phần UI (A3/A4) là phần còn thiếu.
//
// Hai mức bằng chứng:
//   1) CONTRACT (HTTP + Django thật, spawn ephemeral): chuỗi audit thật —
//      preview cũ sau khi recipient đổi → 409 preview_stale, KHÔNG message
//      nào nhận marker; preview MỚI phải giữ recipient_id/revision/body
//      (nguồn bind cho UI) và confirm với preview mới là đường gửi hợp lệ.
//   2) UI (happy-dom + module page THẬT web/mini — mẫu n01): cross-client
//      recipient đổi trước preview → sheet KHÔNG mở, KHÔNG nút "Gửi cho
//      <tên cũ>", note invalidate trung thực, KHÔNG confirmDraftSend,
//      compose mở khóa; control: không lệch → sheet mở bind preview.body.
//
// LỊCH SỬ PROBE (trung thực): chạy TRƯỚC fix (repo @ ec29abb) → ĐỎ ở mức UI
// (web + mini đều mở sheet "Gửi cho <tên cũ>" — xem
// f04-fix-evidence/a5/red-repo-probes.log). Phần HTTP là rào chặn mức
// contract (đã xanh tại ec29abb nhờ N01-fix, giữ để không thụt lùi).
//
// CANH CHỈNH SAU FIX (F04R2-A5, KHÔNG hạ assertion): implementation đặt note
// invalidate cho nhánh SERVER-DRIFT là "Bản nháp đã thay đổi ở nơi khác
// (nội dung/người nhận). Đã tải bản mới — hãy xem lại trước khi gửi."
// (web PREVIEW_STALE_SERVER_NOTE dòng ~70; mini PREVIEW_SERVER_CHANGED_NOTE
// dòng ~115) — còn "đã thay đổi trong khi lấy bản xem trước" là note nhánh
// N01 (snapshot CỤC BỘ đổi khi preview đang bay), không phải nhánh cross-client
// này. Fixture adapter được bổ sung getDraft ĐỂ probe đi ĐỦ vòng đời thật:
// preview lệch → invalidate → await getDraft refresh → note (probe viết trước
// fix nên thiếu method này; việc refresh xong rồi note mới xuất hiện là đúng
// hợp đồng). Assert vẫn giữ: sheet KHÔNG mở, không nút "Gửi cho <tên cũ>",
// note invalidate trung thực (thêm: chứng minh refresh xong — "Đã tải bản mới"),
// không confirm, compose mở khóa.
//
// Giới hạn trung thực: happy-dom KHÔNG phải browser thật — bằng chứng browser
// end-to-end (Playwright + Chromium + Django thật) nằm ở
// f04-fix-evidence/a5/red/ (cross_client_recipient.mjs tái hiện tại redbase).
//
// Chạy (từ repo root):
//   node --test tests/qa-f04/n03-cross-client-recipient.test.mjs
// Yêu cầu: python venv Django (F04_PROBE_PYTHON) + web/node_modules +
// zalo-mini-app/node_modules (happy-dom) cho phần UI.

import { register } from "node:module";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

// Hook asset (ảnh) — như n01, đăng ký TRƯỚC import động của src.
await register(
  pathToFileURL(new URL("../../web/tests/asset-hook.mjs", import.meta.url).pathname),
);

const requireFromWeb = createRequire(
  new URL("../../web/package.json", import.meta.url),
);
const { Window } = requireFromWeb("happy-dom");

// --------------------------------------------------------------- DOM globals
const domWindow = new Window({ url: "https://localhost/" });
globalThis.window = domWindow;
globalThis.document = domWindow.document;
globalThis.Node = domWindow.Node;
globalThis.Element = domWindow.Element;
globalThis.HTMLElement = domWindow.HTMLElement;
globalThis.DocumentFragment = domWindow.DocumentFragment;
globalThis.Event = domWindow.Event;
globalThis.CustomEvent = domWindow.CustomEvent;
globalThis.location = domWindow.location;

import { after, describe, it } from "node:test";
import assert from "node:assert/strict";

// ------------------------------------------------- HTTP contract (Django thật)
const {
  startProbeBackend,
  makeApi,
  setupPair,
} = await import(new URL("./helpers/spawn-backend.mjs", import.meta.url).href);

const backend = await startProbeBackend();
after(() => backend.stop());
const api = makeApi(backend.base);

const MARKER = "A5_N03_MARKER_THU_DUYET_MOT_CLIENT_DUOC_GUI_NHAN_SAI";

/** Kịch bản N03 đúng chuỗi audit bằng HTTP thuần trên Django thật:
 * 1) author tạo draft gửi P1 → 2) author preview (preview CŨ bind P1) →
 * 3) "client B" đổi recipient sang P2 (backup invite/claim/confirm như audit)
 * → 4) author confirm preview cũ → PHẢI 409 preview_stale + không ai nhận
 * marker → 5) preview MỚI bind P2 (recipient_id/revision/body) → 6) confirm
 * mới = đường gửi hợp lệ tới P2 hiện hành. */
async function runRecipientChainContract(label) {
  const { hsToken: author, phToken: primary, peerId: primaryId } =
    await setupPair(api, backend.password, 943);

  // Kết nối thứ hai (backup) — đúng cách audit tạo "người nhận khác".
  const invite = await api("/connections/invites", {
    method: "POST", token: author, body: { relationship_kind: "backup" },
  });
  assert.ok(invite.status === 200 || invite.status === 201,
    `tạo invite → 2xx (nhận ${invite.status})`);
  const secondary = await api("/auth/class-session", {
    method: "POST", body: { code: "PH944", password: backend.password },
  });
  assert.equal(secondary.status, 200);
  const phTokenSecondary = secondary.data.token;
  // Consent cho secondary (parity browser_e2e của audit: MỌI actor đăng nhập
  // đều được cấp consent service/ai trước khi thao tác).
  for (const [purpose, policy_version] of [["service", "service-v1"], ["ai_processing", "ai-v1"]]) {
    const c = await api("/consents", {
      method: "POST", token: phTokenSecondary,
      body: { purpose, policy_version, decision: "accepted" },
    });
    assert.ok(c.status === 200 || c.status === 201,
      `consent secondary ${purpose} → 2xx (nhận ${c.status})`);
  }
  const claim = await api("/connections/invites/claim", {
    method: "POST", token: phTokenSecondary, body: { code: invite.data.code },
  });
  assert.ok(claim.status === 200 || claim.status === 201,
    `claim invite → 2xx (nhận ${claim.status})`);
  const confirm = await api(`/connections/invites/${invite.data.invite_id}/confirm`, {
    method: "POST", token: author, body: {},
  });
  assert.ok(confirm.status >= 200 && confirm.status < 300,
    `confirm invite → 2xx (nhận ${confirm.status})`);
  const conns = await api("/connections", { token: author });
  const secondaryConn = (conns.data.results || [])
    .find((c) => c.other_party_id !== primaryId);
  assert.ok(secondaryConn, "phải có kết nối thứ hai sau claim/confirm");
  const secondaryId = secondaryConn.other_party_id;

  // Draft gửi P1.
  const draft = await api("/drafts", {
    method: "POST", token: author,
    body: { kind: "text", body: MARKER, recipient_id: primaryId },
  });
  assert.equal(draft.status, 201);
  const draftId = draft.data.draft_id;

  // Client A preview (preview CŨ bind P1).
  const stalePreview = await api(`/drafts/${draftId}/preview`, {
    method: "POST", token: author, body: {},
  });
  assert.equal(stalePreview.status, 200);
  assert.equal(stalePreview.data.recipient_id, primaryId,
    "preview cũ bind recipient P1");

  // Client B đổi recipient sang P2 và lưu. Hợp đồng mới: edit kèm
  // expected_revision; máy chủ CHƯA fix trả 400 unknown_fields → fallback
  // legacy edit (không expected_revision) để tiếp tục chuỗi đúng kịch bản.
  // Đây là HARNESS (cách tạo trạng thái server), không phải nới assertion.
  let editPayload = {
    body: MARKER, recipient_id: secondaryId, expected_revision: draft.data.revision,
  };
  let edited = await api(`/drafts/${draftId}`, {
    method: "POST", token: author, body: editPayload,
  });
  let legacyEditFallback = false;
  if (edited.status === 400
      && edited.data?.error?.details?.reason === "unknown_fields") {
    legacyEditFallback = true;
    edited = await api(`/drafts/${draftId}`, {
      method: "POST", token: author,
      body: { body: MARKER, recipient_id: secondaryId },
    });
  }
  assert.equal(edited.status, 200, `client B lưu recipient mới → 200 (nhận ${edited.status})`);
  assert.equal(edited.data.recipient_id, secondaryId,
    "máy chủ ghi nhận recipient mới = P2");

  // Client A confirm với preview CŨ → máy chủ PHẢI chặn (preview_stale).
  const staleConfirm = await api(`/drafts/${draftId}/confirm-send`, {
    method: "POST", token: author, body: { preview_id: stalePreview.data.preview_id },
  });
  assert.equal(staleConfirm.status, 409,
    "N03 contract: confirm với preview cũ sau khi recipient đổi → 409 " +
    `(nhận ${staleConfirm.status} — ${JSON.stringify(staleConfirm.data)})`);
  assert.equal(staleConfirm.data?.error?.code, "preview_stale",
    "mã lỗi phải preview_stale");

  // Không được có message nào nhận marker (KHÔNG gửi nhầm).
  for (const [who, token] of [["primary(PH943)", primary], ["secondary(PH944)", phTokenSecondary]]) {
    const rows = await api("/messages", { token });
    const ids = (rows.data.results || []).map((r) => r.message_id);
    for (const id of ids) {
      const d = await api(`/messages/${id}`, { token });
      assert.notEqual(d.data?.body, MARKER,
        `N03: ${who} KHÔNG được nhận thư sau confirm-preview-cũ (409)`);
    }
  }

  // Preview MỚI = nguồn bind cho UI: giữ recipient_id/revision/body.
  const freshPreview = await api(`/drafts/${draftId}/preview`, {
    method: "POST", token: author, body: {},
  });
  assert.equal(freshPreview.status, 200);
  for (const key of ["preview_id", "revision", "recipient_id", "body"]) {
    assert.ok(key in freshPreview.data,
      `N03 contract: preview response phải giữ "${key}" để UI bind (hợp đồng lead)`);
  }
  assert.equal(freshPreview.data.recipient_id, secondaryId,
    "N03 contract: preview MỚI phải mang recipient_id = P2 (server truth)");
  assert.equal(freshPreview.data.body, MARKER,
    "N03 contract: preview giữ body máy chủ đã chốt");
  assert.equal(freshPreview.data.revision, edited.data.revision,
    "N03 contract: preview revision khớp draft hiện hành");

  // Đường gửi hợp lệ duy nhất: confirm với preview mới (UI fixed sẽ present
  // đúng tên P2 lấy từ preview) → message tới P2, KHÔNG tới P1.
  const freshConfirm = await api(`/drafts/${draftId}/confirm-send`, {
    method: "POST", token: author,
    body: { preview_id: freshPreview.data.preview_id },
  });
  assert.equal(freshConfirm.status, 200,
    `confirm với preview mới (bind P2) → 200 (nhận ${freshConfirm.status})`);

  async function markerCount(token) {
    const rows = await api("/messages", { token });
    let count = 0;
    for (const row of rows.data.results || []) {
      const d = await api(`/messages/${row.message_id}`, { token });
      if (d.data?.body === MARKER) count += 1;
    }
    return count;
  }
  const atPrimary = await markerCount(primary);
  const atSecondary = await markerCount(phTokenSecondary);
  assert.equal(atPrimary, 0, "P1 (đã bị client B thay) KHÔNG nhận thư");
  assert.equal(atSecondary, 1, "P2 (recipient hiện hành sau preview mới) nhận đúng 1 thư");

  return { label, legacyEditFallback, secondaryId,
           staleConfirmHttp: staleConfirm.status, freshConfirmHttp: freshConfirm.status };
}

// ----------------------------------------------------- UI probe (happy-dom)
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(predicate, label, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await wait(10);
  }
  throw new Error(`waitFor timeout: ${label}`);
}

const PRIMARY_ID = "9f1d2c3e-0000-4a5a-9d1f-a5a5a5a5a5a1";
const SECONDARY_ID = "9f1d2c3e-0000-4a5a-9d1f-a5a5a5a5a5a2";
const UNKNOWN_ID = "9f1d2c3e-0000-4a5a-9d1f-a5a5a5a5a5af";
const UI_DRAFT_ID = "d1a7b8c2-0000-4b6b-8e2c-a5a5a5a5a5a2";
const UI_BODY = "A5_N03_UI_MARKER";
const PRIMARY_NAME = "Mẹ A5 (fixture)";
const SECONDARY_NAME = "Bác A5 (fixture)";

/** Adapter 2 trạng thái: server state riêng (client B có thể đổi trước),
 * preview trả snapshot hiện hành của server như Django thật. */
function makeTwoClientAdapter() {
  const server = {
    draftId: UI_DRAFT_ID, body: UI_BODY, revision: 1, recipientId: PRIMARY_ID,
  };
  const calls = { preview: 0, confirm: [], edit: [], getDraft: [] };
  const draftView = () => ({
    draft_id: server.draftId, kind: "text", status: "editing",
    body: server.body, revision: server.revision,
    recipient_id: server.recipientId,
  });
  const adapter = {
    mode: "synthetic",
    async listConnections() {
      return {
        results: [
          {
            connection_id: "conn-a5-p1", other_party_id: PRIMARY_ID,
            status: "active", relationship_kind: "primary",
            counterpart: { display_name: PRIMARY_NAME },
          },
          {
            connection_id: "conn-a5-p2", other_party_id: SECONDARY_ID,
            status: "active", relationship_kind: "backup",
            counterpart: { display_name: SECONDARY_NAME },
          },
        ],
      };
    },
    async listDrafts() {
      return {
        results: [draftView()],
        serverTime: "2026-10-19T00:00:00+00:00",
      };
    },
    // N03 vòng đời thật sau fix: invalidate → GET draft mới từ server →
    // áp vào state → note "Đã tải bản mới". Adapter thiếu getDraft sẽ làm
    // refresh hỏng (note rơi vào biến thể "chưa tải được bản mới").
    async getDraft(draftId) {
      calls.getDraft.push(draftId);
      if (draftId !== server.draftId) {
        const error = new Error("draft_not_found");
        error.code = "draft_not_found";
        throw error;
      }
      return { ...draftView(), server_time: "2026-10-19T00:00:03+00:00" };
    },
    async editDraft(draftId, patch) {
      calls.edit.push({ draftId, patch });
      server.body = patch.body ?? server.body;
      server.recipientId = patch.recipientId ?? server.recipientId;
      server.revision += 1;
      return { ...draftView(), server_time: "2026-10-19T00:00:01+00:00" };
    },
    async previewDraft(_draftId) {
      calls.preview += 1;
      return {
        preview_id: `pv-a5-${calls.preview}`,
        revision: server.revision,
        recipient_id: server.recipientId,
        body: server.body,
        deadline: null,
        server_time: "2026-10-19T00:00:02+00:00",
      };
    },
    async confirmDraftSend(draftId, previewId) {
      calls.confirm.push({ draftId, previewId });
      return { status: "sent", message_id: `m-a5-${calls.confirm.length}` };
    },
  };
  return {
    adapter, server, calls,
    /** "Client B" lưu từ client khác: recipient đổi + revision bump. */
    clientBChangesRecipient(newRecipientId) {
      server.recipientId = newRecipientId;
      server.revision += 1;
    },
  };
}

function makeCtx(adapter) {
  return {
    store: { getState: () => ({ role: "student", demoMode: false }) },
    adapter,
    navigate: () => {},
  };
}

const noteEl = (root) => root.querySelector(".fb-page__note");
const buttonLabels = (root) =>
  [...root.querySelectorAll("button")].map((b) => (b.textContent || "").trim());

async function setSessions() {
  const webSession = await import("../../web/src/core/session.js");
  const miniSession = await import("../../zalo-mini-app/src/core/session.js");
  for (const mod of [webSession, miniSession]) {
    mod.clearSession();
    mod.setSession({
      token: "a5-synthetic-token",
      userId: "u-a5-author",
      expiresAt: Date.now() + 60_000,
    });
  }
  return { webSession, miniSession };
}

/** Chạy 1 kịch bản N03 UI trên 1 module page. crossClientChange:
 *  - "recipient"  : client B đổi recipient sang P2 trước lúc preview;
 *  - "unresolvable": recipient mới không resolve được trong connections;
 *  - null          : control — không đổi gì (sheet phải mở, bind preview.body). */
async function runCrossClientScenario({ pageModuleUrl, crossClientChange }) {
  const harness = makeTwoClientAdapter();
  const root = document.createElement("div");
  document.body.appendChild(root);

  const { page } = await import(pageModuleUrl);
  const ctx = makeCtx(harness.adapter);
  const rendered = page.render(ctx);
  root.appendChild(rendered);

  const textarea = await waitFor(
    () => root.querySelector("textarea.fb-compose__textarea"),
    "textarea compose render",
  );
  assert.equal(textarea.value, UI_BODY, "textarea khởi tạo từ draft máy chủ");

  // Người nhận ban đầu (client A state cũ): P1.
  await waitFor(
    () => (root.querySelector(".fb-compose__recipient-name")?.textContent || "")
      .includes(PRIMARY_NAME),
    "recipient name hiển thị P1",
  );

  // Client B (client khác) lưu recipient mới — client A KHÔNG biết.
  if (crossClientChange === "recipient") {
    harness.clientBChangesRecipient(SECONDARY_ID);
  } else if (crossClientChange === "unresolvable") {
    harness.clientBChangesRecipient(UNKNOWN_ID);
  }

  const previewBtn = await waitFor(() => {
    const buttons = [...root.querySelectorAll("button")];
    return buttons.find((b) => (b.textContent || "").trim() === "Xem trước nội dung") || null;
  }, "nút xem trước");
  previewBtn.click();

  await waitFor(() => harness.calls.preview > 0, "previewDraft được gọi");
  // Chờ KẾT QUẢ preview: hoặc sheet mở (code cũ/lượt hợp lệ) hoặc note
  // invalidate xuất hiện — không đánh giá sớm theo timing. Note nhánh N03
  // server-drift (cả web lẫn mini) chứa "đã thay đổi ở nơi khác"; note chỉ
  // xuất hiện SAU khi refresh getDraft xong (await) → poll đủ lâu.
  await waitFor(
    () => root.querySelector(".fb-compose__preview-body")
      || (noteEl(root)?.textContent || "").includes("đã thay đổi ở nơi khác"),
    "sheet hoặc note invalidate (đã thay đổi ở nơi khác) xuất hiện sau preview",
    5000,
  );

  const evidence = {
    crossClientChange: crossClientChange || null,
    serverPreviewRecipientId: harness.server.recipientId,
    serverPreviewRevision: harness.server.revision,
    sheetOpened: !!root.querySelector(".fb-compose__preview-body"),
    confirmButtonLabels: buttonLabels(root).filter((l) => l.startsWith("Gửi cho ")),
    confirmCalls: harness.calls.confirm.length,
    noteText: [...document.querySelectorAll(".fb-page__note")]
      .map((n) => n.textContent || "").join(" | "),
    textareaUnlocked: !textarea.disabled && !textarea.readOnly,
  };
  return { evidence, root, page, harness };
}

await setSessions();

const WEB_COMPOSE = new URL("../../web/src/pages/compose/index.js", import.meta.url).href;
const MINI_COMPOSE = new URL("../../zalo-mini-app/src/pages/compose/index.js", import.meta.url).href;

describe("A5 N03 — cross-client đổi recipient: UI không được duyệt gửi theo tên cũ", () => {
  // ---------------- HTTP contract (Django thật) ----------------
  it("contract HTTP: confirm preview cũ sau khi recipient đổi → 409 preview_stale, không gửi nhầm; preview mới giữ recipient_id/revision/body", async () => {
    const result = await runRecipientChainContract("http-contract");
    console.log("A5_N03_HTTP_EVIDENCE", JSON.stringify(result));
  });

  // ---------------- UI: web ----------------
  it("web: client B đổi recipient → preview trả P2 → sheet KHÔNG mở theo tên cũ, note invalidate, không confirm", async () => {
    const { evidence, root, page } = await runCrossClientScenario({
      pageModuleUrl: WEB_COMPOSE, crossClientChange: "recipient",
    });
    console.log("A5_N03_UI_EVIDENCE", JSON.stringify(evidence));
    assert.equal(evidence.sheetOpened, false,
      "N03: server preview bind P2 (khác state cũ P1) → sheet KHÔNG được mở " +
      "với người nhận cũ (code cũ mở sheet 'Gửi cho " + PRIMARY_NAME + "')");
    assert.deepEqual(evidence.confirmButtonLabels, [],
      "N03: KHÔNG được có nút 'Gửi cho <tên cũ>' sau khi server đã đổi recipient");
    assert.ok(
      (evidence.noteText || "").includes("đã thay đổi ở nơi khác"),
      "N03: phải có note trung thực về invalidate (bản nháp đã đổi ở nơi khác)");
    assert.ok(
      (evidence.noteText || "").includes("Đã tải bản mới"),
      "N03: note xác nhận đã refresh draft từ máy chủ xong (getDraft) — "
        + `thực tế: "${evidence.noteText}"`);
    assert.equal(evidence.confirmCalls, 0,
      "N03: không được gọi confirmDraftSend khi lệch snapshot server");
    assert.equal(evidence.textareaUnlocked, true,
      "N03: compose mở khóa lại sau invalidate");
    if (typeof page.destroy === "function") page.destroy();
    root.remove();
  });

  it("web: recipient mới không resolve được → fail-closed (không sheet gửi, không confirm)", async () => {
    const { evidence, root, page } = await runCrossClientScenario({
      pageModuleUrl: WEB_COMPOSE, crossClientChange: "unresolvable",
    });
    console.log("A5_N03_UI_EVIDENCE", JSON.stringify(evidence));
    assert.equal(evidence.sheetOpened, false,
      "N03 fail-closed: recipient không resolve được → không mở sheet gửi");
    assert.deepEqual(evidence.confirmButtonLabels, [],
      "N03 fail-closed: không có nút Gửi theo tên cũ");
    assert.equal(evidence.confirmCalls, 0,
      "N03 fail-closed: không confirmDraftSend");
    if (typeof page.destroy === "function") page.destroy();
    root.remove();
  });

  it("web (control): không lệch server → sheet mở và bind ĐÚNG preview.body", async () => {
    const { evidence, root, page } = await runCrossClientScenario({
      pageModuleUrl: WEB_COMPOSE, crossClientChange: null,
    });
    console.log("A5_N03_UI_EVIDENCE", JSON.stringify(evidence));
    assert.equal(evidence.sheetOpened, true,
      "N03 control: không lệch → sheet vẫn mở (không over-invalidate)");
    const previewBody = root.querySelector(".fb-compose__preview-body");
    assert.equal(previewBody?.textContent, UI_BODY,
      "N03 control: sheet bind từ preview.body máy chủ");
    assert.ok(evidence.confirmButtonLabels.some((l) => l.includes(PRIMARY_NAME)),
      "N03 control: nút Gửi đúng người nhận hiện hành (P1)");
    assert.equal(evidence.confirmCalls, 0, "không auto-confirm");
    if (typeof page.destroy === "function") page.destroy();
    root.remove();
  });

  // ---------------- UI: mini (parity) ----------------
  it("mini: client B đổi recipient → preview trả P2 → sheet KHÔNG mở theo tên cũ, note invalidate, không confirm", async () => {
    const { evidence, root, page } = await runCrossClientScenario({
      pageModuleUrl: MINI_COMPOSE, crossClientChange: "recipient",
    });
    console.log("A5_N03_UI_EVIDENCE", JSON.stringify(evidence));
    assert.equal(evidence.sheetOpened, false,
      "N03 mini: server preview bind P2 → sheet KHÔNG mở với người nhận cũ");
    assert.deepEqual(evidence.confirmButtonLabels, [],
      "N03 mini: KHÔNG có nút 'Gửi cho <tên cũ>'");
    assert.ok(
      (evidence.noteText || "").includes("đã thay đổi ở nơi khác"),
      "N03 mini: note invalidate trung thực (bản nháp đã đổi ở nơi khác)");
    assert.ok(
      (evidence.noteText || "").includes("Đã tải bản mới"),
      "N03 mini: note xác nhận đã refresh draft từ máy chủ xong (getDraft) — "
        + `thực tế: "${evidence.noteText}"`);
    assert.equal(evidence.confirmCalls, 0, "N03 mini: không confirmDraftSend");
    assert.equal(evidence.textareaUnlocked, true,
      "N03 mini: compose mở khóa lại sau invalidate");
    if (typeof page.destroy === "function") page.destroy();
    root.remove();
  });

  it("mini: recipient mới không resolve được → fail-closed (không sheet gửi, không confirm)", async () => {
    const { evidence, root, page } = await runCrossClientScenario({
      pageModuleUrl: MINI_COMPOSE, crossClientChange: "unresolvable",
    });
    console.log("A5_N03_UI_EVIDENCE", JSON.stringify(evidence));
    assert.equal(evidence.sheetOpened, false,
      "N03 mini fail-closed: recipient lạ → không mở sheet gửi");
    assert.deepEqual(evidence.confirmButtonLabels, [],
      "N03 mini fail-closed: không có nút Gửi theo tên cũ");
    assert.equal(evidence.confirmCalls, 0,
      "N03 mini fail-closed: không confirmDraftSend");
    if (typeof page.destroy === "function") page.destroy();
    root.remove();
  });

  it("mini (control): không lệch server → sheet mở và bind ĐÚNG preview.body", async () => {
    const { evidence, root, page } = await runCrossClientScenario({
      pageModuleUrl: MINI_COMPOSE, crossClientChange: null,
    });
    console.log("A5_N03_UI_EVIDENCE", JSON.stringify(evidence));
    assert.equal(evidence.sheetOpened, true,
      "N03 mini control: không lệch → sheet vẫn mở");
    const previewBody = root.querySelector(".fb-compose__preview-body");
    assert.equal(previewBody?.textContent, UI_BODY,
      "N03 mini control: sheet bind từ preview.body máy chủ");
    assert.ok(evidence.confirmButtonLabels.some((l) => l.includes(PRIMARY_NAME)),
      "N03 mini control: nút Gửi đúng người nhận hiện hành (P1)");
    assert.equal(evidence.confirmCalls, 0, "không auto-confirm");
    if (typeof page.destroy === "function") page.destroy();
    root.remove();
  });
});
