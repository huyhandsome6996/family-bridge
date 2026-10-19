// tests/qa-f04/n01-preview-inflight-a5.test.mjs — A5 độc lập (F04-A5).
//
// Mục đích: probe MỨC UNIT cho N01 (QA F04 19/10, P1 "gửi sai bản đã duyệt")
// chạy TRỰC TIẾP trên 2 module page thật (web + zalo-mini-app), KHÔNG copy
// test của A3/A4 (khác cách dựng: adapter tự viết có DEFERRED promise —
// preview chỉ resolve khi test cho phép, mô phỏng request đang bay).
//
// LỊCH SỬ PROBE (trung thực):
//   - Phiên trước (e0ee388, chưa sửa): probe ghim "sheet phải hiển thị
//     preview.body (A) dù user sửa trong lúc bay" → ĐỎ vì sheet render
//     live textarea B (web:836, mini:1228). Bằng chứng ĐỎ giữ nguyên:
//     f04-fix-evidence/a5/a5-n01-unit-RED.log.
//   - Sau fix: A1 chốt hợp đồng docs/features/f04/web-zalo-parity.md §6.3
//     và A4/A3 hiện thực theo đúng (d): lệch snapshot sau await → KHÔNG mở
//     sheet + note trung thực + mở khóa (hướng "invalidate", an toàn hơn
//     hướng "hiển thị snapshot cũ"). Do đó probe được TINH CHỈNH để ghim
//     ĐÚNG hợp đồng theo 2 chiều, vẫn đỏ-by-construction trên e0ee388
//     (kịch bản 1: sheet cũ VẪN mở — xem a5-n01-unit-RED.log — nên assert
//     "sheet KHÔNG mở" chắc chắn fail trên code chưa sửa):
//       1) sửa trong lúc preview bay → textarea bị KHÓA khi bay (rào cản 1),
//          resolve preview xong sheet KHÔNG mở (rào cản 2), note invalidate
//          trung thực, KHÔNG confirmDraftSend, compose mở khóa lại;
//       2) KHÔNG sửa → sheet mở và hiển thị ĐÚNG preview.body máy chủ (A).
//
// Giới hạn trung thực: happy-dom KHÔNG phải browser thật (không layout, không
// network) — bằng chứng trình duyệt end-to-end (Playwright + Chromium, Django
// thật) nằm ở repro/preview_race.mjs; probe này ghim CONTRACT của client.
//
// Chạy (từ repo root):
//   node --test tests/qa-f04/n01-preview-inflight-a5.test.mjs
// Yêu cầu: web/node_modules + zalo-mini-app/node_modules (npm ci) cho happy-dom.

import { register } from "node:module";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

// Hook asset (ảnh .png/.svg) dùng chung infra repo web/tests/asset-hook.mjs —
// đăng ký TRƯỚC mọi import động của src (URL TUYỆT ĐỐI vì register resolve
// trong loader worker, không relative theo file test này).
await register(
  pathToFileURL(new URL("../../web/tests/asset-hook.mjs", import.meta.url).pathname),
);

// happy-dom resolve từ web/node_modules (devDependency pin 20.14.6).
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

const { describe, it } = await import("node:test");
const assert = (await import("node:assert/strict")).default;

// ---------------------------------------------------------------- fixtures
const SERVER_BODY = "BẢN MÁY CHỦ ĐÃ CHỐT LÚC PREVIEW (A5)";
const TAMPERED_BODY = "BẢN USER GÕ THÊM KHI PREVIEW ĐANG BAY (A5)";
const RECIPIENT_ID = "9f1d2c3e-0000-4a5a-9d1f-a5a5a5a5a5a1";
const DRAFT_ID = "d1a7b8c2-0000-4b6b-8e2c-a5a5a5a5a5a2";
const PREVIEW_ID = "p3e4f5a6-0000-4c7c-9d3d-a5a5a5a5a5a3";
const REVISION = 4;

const INVALIDATE_NOTE =
  "Nội dung hoặc người nhận đã thay đổi trong khi lấy bản xem trước — hãy bấm “Xem trước nội dung” lại.";

/** Adapter tự viết: list connections/drafts tối giản + previewDraft DEFERRED.
 * previewDraft() không resolve cho tới khi test gọi releasePreview(payload). */
function makeDeferredPreviewAdapter() {
  let releasePreview = null;
  let previewCalls = 0;
  const confirmCalls = [];
  const editCalls = [];
  const adapter = {
    mode: "synthetic",
    async listConnections() {
      return {
        results: [{
          connection_id: "conn-a5-1",
          other_party_id: RECIPIENT_ID,
          status: "active",
          relationship_kind: "primary",
          counterpart: { display_name: "Mẹ (A5 fixture)" },
        }],
      };
    },
    async listDrafts() {
      return {
        results: [{
          draft_id: DRAFT_ID,
          kind: "text",
          status: "editing",
          body: SERVER_BODY,
          revision: REVISION,
          recipient_id: RECIPIENT_ID,
        }],
        serverTime: "2026-10-19T00:00:00+00:00",
      };
    },
    async editDraft(draftId, patch) {
      editCalls.push({ draftId, patch });
      return {
        draft_id: draftId, status: "editing",
        revision: REVISION + editCalls.length,
        body: patch.body, recipient_id: RECIPIENT_ID,
        server_time: "2026-10-19T00:00:01+00:00",
      };
    },
    previewDraft(_draftId) {
      previewCalls += 1;
      return new Promise((resolve) => {
        releasePreview = (payload) => resolve(payload);
      });
    },
    async confirmDraftSend(draftId, previewId) {
      confirmCalls.push({ draftId, previewId });
      return { status: "sent", message_id: "m-a5-1" };
    },
  };
  return {
    adapter,
    get previewCalls() { return previewCalls; },
    get confirmCalls() { return confirmCalls; },
    get editCalls() { return editCalls; },
    releasePreview(payload) {
      if (!releasePreview) throw new Error("previewDraft chưa được gọi");
      releasePreview(payload);
    },
  };
}

/** Server preview payload theo hợp đồng N01 (snapshot máy chủ). */
function serverPreviewPayload() {
  return {
    preview_id: PREVIEW_ID,
    revision: REVISION,
    recipient_id: RECIPIENT_ID,
    body: SERVER_BODY,
    deadline: null,
    server_time: "2026-10-19T00:00:02+00:00",
  };
}

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

/** Fake ctx dùng chung: store tĩnh + navigate no-op. */
function makeCtx(adapter) {
  return {
    store: { getState: () => ({ role: "student", demoMode: false }) },
    adapter,
    navigate: () => {},
  };
}

/** Status note element (.fb-page__note) của root. */
const noteEl = (root) => root.querySelector(".fb-page__note");

/**
 * Chạy 1 kịch bản N01 trên 1 module page.
 *  - tamperDuringFlight=true  : sửa textarea khi preview đang bay (rào cản 1+2).
 *  - tamperDuringFlight=false : không sửa → sheet mở, hiển thị snapshot máy chủ.
 * Trả về bằng chứng dữ liệu.
 */
async function runPreviewInflightScenario({ label, pageModuleUrl, tamperDuringFlight }) {
  const harness = makeDeferredPreviewAdapter();
  const root = document.createElement("div");
  document.body.appendChild(root);

  const { page } = await import(pageModuleUrl);
  const ctx = makeCtx(harness.adapter);
  const rendered = page.render(ctx);
  root.appendChild(rendered);

  // Chờ renderCompose (list connections/drafts resolve) → textarea có body A.
  const textarea = await waitFor(
    () => root.querySelector("textarea.fb-compose__textarea"),
    `${label}: textarea compose render`,
  );
  assert.equal(textarea.value, SERVER_BODY,
    `${label}: textarea khởi tạo từ draft máy chủ (body A)`);

  // Bấm "Xem trước nội dung" → previewDraft gọi và TREO.
  const previewBtn = await waitFor(() => {
    const buttons = [...root.querySelectorAll("button")];
    return buttons.find((b) => (b.textContent || "").trim() === "Xem trước nội dung") || null;
  }, `${label}: nút xem trước`);
  previewBtn.click();
  await waitFor(() => harness.previewCalls > 0,
    `${label}: previewDraft được gọi`);
  await wait(30); // nhường microtask onPreview chạy tới await previewDraft

  // Trong lúc request đang bay: ghi nhận trạng thái khóa của compose.
  const editableDuringPreview = !textarea.disabled && !textarea.readOnly;

  let sheetShownText = null;
  if (tamperDuringFlight) {
    // Author "gõ thêm" (mô phỏng cả đường xuyên rào cản 1: ghi programmatic).
    textarea.value = TAMPERED_BODY;
    textarea.dispatchEvent(new domWindow.Event("input", { bubbles: true }));
  }

  // Máy chủ trả snapshot A (đã chốt lúc preview).
  harness.releasePreview(serverPreviewPayload());

  const evidence = {
    label,
    tamperDuringFlight,
    editableDuringPreview,
    serverBoundBody: SERVER_BODY,
    tamperedBody: TAMPERED_BODY,
  };

  if (tamperDuringFlight) {
    // Hợp đồng §6.3(d): lệch snapshot sau await → KHÔNG mở sheet; note trung
    // thực; KHÔNG confirmDraftSend; compose mở khóa lại cho lượt preview sau.
    await waitFor(
      () => (noteEl(root)?.textContent || "").includes("đã thay đổi trong khi lấy bản xem trước"),
      `${label}: note invalidate trung thực sau khi lệch snapshot`,
    );
    evidence.invalidateNoteShown = true;
    await wait(150); // grace: nếu code lỗi, sheet sẽ kịp mở trong khoảng này
    evidence.sheetOpenedAfterInvalidate = !!root.querySelector(".fb-compose__preview-body");
    evidence.sheetShownText = null;
    evidence.confirmCalledAfterInvalidate = harness.confirmCalls.length;
    evidence.textareaUnlockedAfter = !textarea.disabled && !textarea.readOnly;
  } else {
    // Hợp đồng §6.3(e): không lệch → sheet mở, hiển thị ĐÚNG preview.body.
    const previewBodyEl = await waitFor(
      () => root.querySelector(".fb-compose__preview-body"),
      `${label}: sheet xác nhận (.fb-compose__preview-body) mở`,
    );
    sheetShownText = previewBodyEl.textContent || "";
    evidence.sheetShownText = sheetShownText;
    evidence.sheetShowsServerSnapshot = sheetShownText === SERVER_BODY;
    evidence.sheetShowsLiveEdit = sheetShownText === TAMPERED_BODY;
    evidence.confirmCalledBeforeUserAction = harness.confirmCalls.length;
  }

  if (typeof page.destroy === "function") page.destroy();
  root.remove();
  return evidence;
}

// ---------------------------------------------------------------- sessions
await setSessions();

// ---------------------------------------------------------------- page modules
const WEB_COMPOSE = new URL("../../web/src/pages/compose/index.js", import.meta.url).href;
const MINI_COMPOSE = new URL("../../zalo-mini-app/src/pages/compose/index.js", import.meta.url).href;

describe("A5 N01 — preview đang bay: không bao giờ gửi/hiển thị bản khác snapshot máy chủ", () => {
  it("web: sửa nội dung khi preview đang bay → KHÔNG mở sheet, note invalidate, không confirm, mở khóa (hợp đồng §6.3d)", async () => {
    const evidence = await runPreviewInflightScenario({
      label: "web", pageModuleUrl: WEB_COMPOSE, tamperDuringFlight: true,
    });
    console.log("A5_N01_EVIDENCE", JSON.stringify(evidence));
    // Rào cản 1: trong lúc bay, compose phải khóa nhập (không cho gõ mới).
    assert.equal(evidence.editableDuringPreview, false,
      "N01 rào cản 1: textarea phải bị khóa khi preview đang bay");
    // Rào cản 2: lệch snapshot sau await → sheet KHÔNG được mở.
    assert.equal(evidence.invalidateNoteShown, true,
      "N01: phải có note trung thực 'nội dung đã thay đổi trong khi lấy bản xem trước'");
    assert.equal(evidence.sheetOpenedAfterInvalidate, false,
      "N01 rào cản 2: sheet xác nhận KHÔNG được mở khi nội dung lệch snapshot sau await " +
      "(code cũ mở sheet hiển thị live edit — xem a5-n01-unit-RED.log)");
    assert.equal(evidence.confirmCalledAfterInvalidate, 0,
      "N01: không được gọi confirmDraftSend sau invalidate");
    assert.equal(evidence.textareaUnlockedAfter, true,
      "N01: compose phải mở khóa lại sau invalidate (cho lượt xem trước kế tiếp)");
  });

  it("mini: sửa nội dung khi preview đang bay → KHÔNG mở sheet, note invalidate, không confirm, mở khóa (hợp đồng §6.3d)", async () => {
    const evidence = await runPreviewInflightScenario({
      label: "mini", pageModuleUrl: MINI_COMPOSE, tamperDuringFlight: true,
    });
    console.log("A5_N01_EVIDENCE", JSON.stringify(evidence));
    assert.equal(evidence.editableDuringPreview, false,
      "N01 rào cản 1: textarea phải bị khóa khi preview đang bay");
    assert.equal(evidence.invalidateNoteShown, true,
      "N01: phải có note trung thực 'nội dung đã thay đổi trong khi lấy bản xem trước'");
    assert.equal(evidence.sheetOpenedAfterInvalidate, false,
      "N01 rào cản 2: sheet xác nhận KHÔNG được mở khi nội dung lệch snapshot sau await");
    assert.equal(evidence.confirmCalledAfterInvalidate, 0,
      "N01: không được gọi confirmDraftSend sau invalidate");
    assert.equal(evidence.textareaUnlockedAfter, true,
      "N01: compose phải mở khóa lại sau invalidate");
  });

  it("web: không sửa gì → sheet hiển thị ĐÚNG preview.body máy chủ (A), không phải live textarea (§6.3e)", async () => {
    const evidence = await runPreviewInflightScenario({
      label: "web", pageModuleUrl: WEB_COMPOSE, tamperDuringFlight: false,
    });
    console.log("A5_N01_EVIDENCE", JSON.stringify(evidence));
    assert.equal(evidence.sheetShowsServerSnapshot, true,
      "N01: sheet xác nhận phải hiển thị ĐÚNG snapshot preview.body của máy chủ " +
      `(nhận: "${evidence.sheetShownText}") — không được lấy live textarea`);
    assert.equal(evidence.sheetShowsLiveEdit, false,
      "N01: sheet không được hiển thị nội dung khác snapshot máy chủ");
    assert.equal(evidence.confirmCalledBeforeUserAction, 0,
      "N01: không auto-confirm — gửi chỉ xảy ra khi user bấm Gửi trong sheet");
  });

  it("mini: không sửa gì → sheet hiển thị ĐÚNG preview.body máy chủ (A), không phải live textarea (§6.3e)", async () => {
    const evidence = await runPreviewInflightScenario({
      label: "mini", pageModuleUrl: MINI_COMPOSE, tamperDuringFlight: false,
    });
    console.log("A5_N01_EVIDENCE", JSON.stringify(evidence));
    assert.equal(evidence.sheetShowsServerSnapshot, true,
      "N01: sheet xác nhận phải hiển thị ĐÚNG snapshot preview.body của máy chủ " +
      `(nhận: "${evidence.sheetShownText}")`);
    assert.equal(evidence.sheetShowsLiveEdit, false,
      "N01: sheet không được hiển thị nội dung khác snapshot máy chủ");
    assert.equal(evidence.confirmCalledBeforeUserAction, 0,
      "N01: không auto-confirm — gửi chỉ xảy ra khi user bấm Gửi trong sheet");
  });
});
