// tests/f04-n06-conflict.test.mjs — N06 (QA 19/10, P2): mọi editDraft của
// Mini chưa gửi expected_revision -> stale save ghi đè im lặng khi bản nháp
// đã đổi ở nơi khác (hai client cùng sửa).
//
// Hợp đồng fix (F04R2-LEAD-1):
// - MỌI editDraft (lưu nháp thủ công, auto-sync trước preview, AI apply)
//   truyền expectedRevision: state.revision.
// - Server 409 revision_conflict {details:{reason:"draft_conflict",
//   current_revision}} -> panel xung đột: GIỮ text người dùng; fetch bản
//   server (getDraft); 2 lựa chọn rõ:
//     "Cập nhật theo bản trên máy chủ" (adopt — nạp bản server vào ô soạn)
//     "Ghi đè bằng bản của tôi" (deliberate — gọi lại editDraft với
//      expectedRevision = current_revision);
//   KHÔNG auto-retry, KHÔNG merge, KHÔNG mất text.
// - Kèm N05 (cùng vòng fix): touch target source-level — nút "Đổi" ≥44x44,
//   nút nháp/pause min-size hợp lý, override adaptive ≥1024px + ghi chú
//   stress probe large-text 200%.
//
// Pattern happy-dom giống tests/f04-preview-snapshot.test.mjs.
import { register } from "node:module";
await register(new URL("./asset-hook.mjs", import.meta.url));
const { Window } = await import("happy-dom");
const domWindow = new Window({ url: "https://localhost/?demo=1" });

globalThis.window = domWindow;
globalThis.document = domWindow.document;
globalThis.Node = domWindow.Node;
globalThis.Element = domWindow.Element;
globalThis.HTMLElement = domWindow.HTMLElement;
globalThis.DocumentFragment = domWindow.DocumentFragment;
globalThis.Event = domWindow.Event;
globalThis.CustomEvent = domWindow.CustomEvent;
globalThis.KeyboardEvent = domWindow.KeyboardEvent;
globalThis.MouseEvent = domWindow.MouseEvent;
globalThis.location = domWindow.location;

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const { describe, it } = await import("node:test");
const assert = (await import("node:assert/strict")).default;

const { initStore, setRole, resetState } = await import("../src/app/store.js");
const compose = (await import("../src/pages/compose/index.js")).page;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function textOf(el) {
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

function findButton(root, needle) {
  return Array.from(root.querySelectorAll("button")).find(
    (btn) => textOf(btn).includes(needle),
  );
}

function type(el, value) {
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function conflictError(currentRevision) {
  // Đúng shape hợp đồng lead freeze: 409 + code revision_conflict.
  return {
    status: 409,
    code: "revision_conflict",
    details: { reason: "draft_conflict", current_revision: currentRevision },
  };
}

/* ------------------------------ Fixture ------------------------------ */

const BODY_A = "Bản A đã nằm trên máy chủ.";
const SERVER_DRAFT = {
  draft_id: "d-n06",
  revision: 2,
  status: "editing",
  pause: null,
  recipient_id: "u-care-1",
  body: BODY_A,
};

const CONNECTIONS = [{
  connection_id: "c-1",
  other_party_id: "u-care-1",
  status: "active",
  relationship_kind: "primary",
  counterpart: { display_name: "Bố" },
}];

function createAdapter(behavior = {}) {
  const calls = { editDraft: [], preview: [], getDraft: [], confirmSend: [] };
  // currentRevision = revision máy chủ HIỆN TẠI (mô phỏng server truth).
  let currentRevision = SERVER_DRAFT.revision;
  const adapter = {
    listConnections: async () => ({ results: CONNECTIONS }),
    listDrafts: async () => ({
      results: [{ ...SERVER_DRAFT }],
      serverTime: "2026-10-19T00:00:00Z",
    }),
    aiStatus: async () => ({ ai_enabled: false }),
    getDraft: async (id) => {
      calls.getDraft.push(id);
      return {
        ...SERVER_DRAFT,
        revision: currentRevision,
        body: behavior.serverBody ?? SERVER_DRAFT.body,
        server_time: "2026-10-19T00:01:00Z",
      };
    },
    editDraft: async (id, args) => {
      calls.editDraft.push({ id, ...args });
      const callIndex = calls.editDraft.length;
      const throwAlways = behavior.editThrowsAlways;
      // FIX fixture (A3-tiếp 19/10, ghi trong f04-fix-evidence/a3/notes.md):
      // bản cũ viết `behavior.editThrowsFirst && callIndex === 1` — do thứ tự
      // toán tử, kết quả là boolean `true` thay vì ĐỐI TƯỢNG lỗi, khiến
      // `thrown.details` văng TypeError và 5 test (d1..d4, d6) đỏ vì fixture
      // chứ không phải implement (fixture `editThrowsAlways` ở d5 — cùng
      // shape, cùng đường catch — chứng minh implement đúng). Đảo thứ tự để
      // `throwFirst` giữ nguyên ĐỐI TƯỢNG conflictError; KHÔNG đổi assertion.
      const throwFirst = callIndex === 1 && behavior.editThrowsFirst;
      const thrown = throwAlways || throwFirst;
      if (thrown) {
        // Máy chủ đang ở revision N (theo 409) — getDraft sau đó phải phản
        // ánh đúng server truth này.
        currentRevision = thrown.details.current_revision;
        throw thrown;
      }
      currentRevision = args.expectedRevision
        ? args.expectedRevision + 1
        : currentRevision + 1;
      return {
        ...SERVER_DRAFT,
        revision: currentRevision,
        body: String(args.body || ""),
        server_time: "2026-10-19T00:01:00Z",
      };
    },
    previewDraft: async (id) => {
      calls.preview.push(id);
      return {
        preview_id: "pv-n06",
        revision: currentRevision,
        recipient_id: SERVER_DRAFT.recipient_id,
        body: SERVER_DRAFT.body,
        deadline: null,
        server_time: "2026-10-19T00:01:00Z",
      };
    },
    confirmDraftSend: async (id, previewId) => {
      calls.confirmSend.push({ id, previewId });
      return { message_id: "m-1", state: "sent" };
    },
  };
  return { adapter, calls };
}

function makeCtx() {
  initStore({ demoMode: true });
  resetState();
  setRole("student");
  return {
    ctx: {
      store: { getState: () => ({ demoMode: true, role: "student" }) },
      adapter: null,
      navigate: () => {},
      setRole: () => {},
      rebuildAdapter: () => {},
      params: new URLSearchParams(""),
    },
  };
}

function mount(ctx) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const el = compose.render(ctx);
  host.appendChild(el);
  return { host, el };
}

function cleanup(host) {
  host.remove();
  document.body.querySelectorAll(".fb-sheet-root, .fb-dialog-root").forEach((el) => el.remove());
  resetState();
}

/* ==================== N06: expectedRevision + panel xung đột ==================== */

describe("N06 (US-033): mọi editDraft gửi expectedRevision; 409 -> panel 2 lựa chọn, không mất text", () => {
  it("(d1) Lưu nháp thủ công gửi expectedRevision: state.revision; 409 revision_conflict -> mở panel xung đột + GIỮ text người dùng", async () => {
    const { adapter, calls } = createAdapter({
      editThrowsFirst: conflictError(5),
      serverBody: "Mẹ đã sửa từ nơi khác.",
    });
    const { ctx } = makeCtx();
    ctx.adapter = adapter;
    const { host, el } = mount(ctx);
    await wait(80);

    const textarea = el.querySelector("#fb-compose-body");
    type(textarea, "Bản của con viết lúc tối.");
    findButton(el, "Lưu nháp riêng").click();
    await wait(100);

    assert.equal(calls.editDraft.length, 1, "editDraft đã được gọi");
    assert.equal(
      calls.editDraft[0].expectedRevision,
      SERVER_DRAFT.revision,
      "N06: editDraft phải mang expectedRevision = state.revision",
    );
    const sheet = document.body.querySelector(".fb-sheet-root");
    assert.ok(
      sheet,
      "409 revision_conflict -> phải mở panel xung đột (không ghi đè im lặng)",
    );
    assert.ok(
      textOf(sheet).includes("Bản nháp đã thay đổi trên máy chủ"),
      "panel phải nói rõ xung đột với máy chủ",
    );
    assert.equal(
      textarea.value,
      "Bản của con viết lúc tối.",
      "N06: text người dùng phải được GIỮ NGUYÊN trong ô soạn",
    );
    cleanup(host);
  });

  it("(d2) panel hiển thị bản máy chủ + 2 lựa chọn đúng label/semantics", async () => {
    const { adapter } = createAdapter({
      editThrowsFirst: conflictError(5),
      serverBody: "Mẹ đã sửa từ nơi khác.",
    });
    const { ctx } = makeCtx();
    ctx.adapter = adapter;
    const { host, el } = mount(ctx);
    await wait(80);

    type(el.querySelector("#fb-compose-body"), "Bản của con viết lúc tối.");
    findButton(el, "Lưu nháp riêng").click();
    await wait(100);

    const sheet = document.body.querySelector(".fb-sheet-root");
    assert.ok(sheet, "panel xung đột phải mở");
    const adoptBtn = findButton(sheet, "Cập nhật theo bản trên máy chủ");
    const overwriteBtn = findButton(sheet, "Ghi đè bằng bản của tôi");
    assert.ok(adoptBtn, "phải có lựa chọn 'Cập nhật theo bản trên máy chủ' (adopt)");
    assert.ok(overwriteBtn, "phải có lựa chọn 'Ghi đè bằng bản của tôi' (deliberate)");
    assert.ok(
      textOf(sheet).includes("Mẹ đã sửa từ nơi khác."),
      "panel phải hiển thị nội dung bản máy chủ để đối chiếu",
    );
    assert.ok(
      textOf(sheet).includes("Bản của con viết lúc tối."),
      "panel phải hiển thị nội dung bản của người dùng để đối chiếu",
    );
    cleanup(host);
  });

  it("(d3) adopt 'Cập nhật theo bản trên máy chủ' -> ô soạn nạp bản máy chủ; save lần sau mang expectedRevision mới (current_revision)", async () => {
    const { adapter, calls } = createAdapter({
      editThrowsFirst: conflictError(5),
      serverBody: "Mẹ đã sửa từ nơi khác.",
    });
    const { ctx } = makeCtx();
    ctx.adapter = adapter;
    const { host, el } = mount(ctx);
    await wait(80);

    type(el.querySelector("#fb-compose-body"), "Bản của con viết lúc tối.");
    findButton(el, "Lưu nháp riêng").click();
    await wait(100);

    const sheet = document.body.querySelector(".fb-sheet-root");
    findButton(sheet, "Cập nhật theo bản trên máy chủ").click();
    await wait(120);

    assert.equal(
      el.querySelector("#fb-compose-body").value,
      "Mẹ đã sửa từ nơi khác.",
      "adopt: ô soạn phải nạp bản máy chủ",
    );
    assert.ok(
      !document.body.querySelector(".fb-sheet-root"),
      "adopt xong panel phải đóng",
    );

    // Lưu lần nữa (sau adopt): expectedRevision phải là revision máy chủ
    // vừa nạp (5) — không còn dùng revision cũ (2).
    findButton(el, "Lưu nháp riêng").click();
    await wait(100);
    assert.equal(
      calls.editDraft[1].expectedRevision,
      5,
      `expectedRevision lần sau phải = current_revision (5) — thực tế: ${calls.editDraft[1].expectedRevision}`,
    );
    cleanup(host);
  });

  it("(d4) deliberate 'Ghi đè bằng bản của tôi' -> gọi lại editDraft ĐÚNG 1 lần với expectedRevision = current_revision, giữ text", async () => {
    const { adapter, calls } = createAdapter({
      editThrowsFirst: conflictError(5),
      serverBody: "Mẹ đã sửa từ nơi khác.",
    });
    const { ctx } = makeCtx();
    ctx.adapter = adapter;
    const { host, el } = mount(ctx);
    await wait(80);

    const textarea = el.querySelector("#fb-compose-body");
    type(textarea, "Bản của con viết lúc tối.");
    findButton(el, "Lưu nháp riêng").click();
    await wait(100);

    const sheet = document.body.querySelector(".fb-sheet-root");
    findButton(sheet, "Ghi đè bằng bản của tôi").click();
    await wait(120);

    assert.equal(
      calls.editDraft.length,
      2,
      "ghi đè = ĐÚNG 1 lần gọi lại (không auto-retry)",
    );
    assert.equal(
      calls.editDraft[1].expectedRevision,
      5,
      "lần gọi lại phải mang expectedRevision = current_revision (5)",
    );
    assert.equal(
      calls.editDraft[1].body,
      "Bản của con viết lúc tối.",
      "ghi đè phải gửi ĐÚNG text người dùng",
    );
    assert.equal(
      textarea.value,
      "Bản của con viết lúc tối.",
      "text người dùng giữ nguyên",
    );
    assert.ok(
      !document.body.querySelector(".fb-sheet-root"),
      "ghi đè thành công -> panel đóng",
    );
    cleanup(host);
  });

  it("(d5) ghi đè vấp 409 lần nữa -> KHÔNG tự retry; alert trong panel; text vẫn giữ", async () => {
    const { adapter, calls } = createAdapter({
      // editDraft luôn 409 — cả lần ghi đè chủ động.
      editThrowsAlways: conflictError(8),
      serverBody: "Mẹ lại sửa lần nữa.",
    });
    const { ctx } = makeCtx();
    ctx.adapter = adapter;
    const { host, el } = mount(ctx);
    await wait(80);

    const textarea = el.querySelector("#fb-compose-body");
    type(textarea, "Bản của con viết lúc tối.");
    findButton(el, "Lưu nháp riêng").click();
    await wait(100);

    const sheet = document.body.querySelector(".fb-sheet-root");
    findButton(sheet, "Ghi đè bằng bản của tôi").click();
    await wait(140);

    assert.equal(
      calls.editDraft.length,
      2,
      "KHÔNG được tự retry sau khi lần ghi đè chủ động lại 409",
    );
    assert.ok(
      document.body.querySelector(".fb-sheet-root"),
      "panel vẫn mở để người dùng quyết định tiếp",
    );
    assert.ok(
      textOf(document.body.querySelector(".fb-sheet-root")).includes("thay đổi"),
      "alert trong panel phải báo máy chủ lại thay đổi",
    );
    assert.equal(
      textarea.value,
      "Bản của con viết lúc tối.",
      "text người dùng không bị mất sau 2 lần xung đột",
    );
    cleanup(host);
  });

  it("(d6) auto-sync editDraft TRƯỚC preview vấp 409 -> KHÔNG gọi previewDraft; panel xung đột mở; mở khóa soạn", async () => {
    const { adapter, calls } = createAdapter({
      editThrowsFirst: conflictError(5),
      serverBody: "Mẹ đã sửa từ nơi khác.",
    });
    const { ctx } = makeCtx();
    ctx.adapter = adapter;
    const { host, el } = mount(ctx);
    await wait(80);

    const textarea = el.querySelector("#fb-compose-body");
    type(textarea, "Bản mới chưa từng sync."); // lệch syncedBody -> auto-sync
    findButton(el, "Xem trước nội dung").click();
    await wait(120);

    assert.equal(calls.editDraft.length, 1, "auto-sync đã gọi editDraft");
    assert.equal(
      calls.editDraft[0].expectedRevision,
      SERVER_DRAFT.revision,
      "auto-sync cũng phải mang expectedRevision",
    );
    assert.equal(
      calls.preview.length,
      0,
      "N06: sync vấp xung đột -> KHÔNG được gọi previewDraft",
    );
    const sheet = document.body.querySelector(".fb-sheet-root");
    assert.ok(sheet, "phải mở panel xung đột thay vì preview");
    assert.equal(
      findButton(el, "Xem trước nội dung").disabled,
      false,
      "phải mở khóa nút preview sau khi dừng flow",
    );
    assert.equal(
      textarea.value,
      "Bản mới chưa từng sync.",
      "text người dùng giữ nguyên",
    );
    cleanup(host);
  });
});

/* ================== N05 (kèm vòng fix): touch target source-level ================== */

describe("N05: hit-area ≥44x44 (source-level) + adaptive ≥1024 + stress probe 200%", () => {
  const read = (p) => readFileSync(resolve(ROOT, p), "utf8");

  function cssBlock(source, selector) {
    const idx = source.indexOf(selector);
    assert.ok(idx !== -1, `${selector} phải tồn tại trong CSS`);
    return source.slice(idx, source.indexOf("}", idx));
  }

  it("(f1) nút 'Đổi' người nhận: min-height + min-width 44px (vùng chạm thật, không chỉ khai báo)", () => {
    const components = read("src/styles/components.css");
    const block = cssBlock(components, ".fb-compose__change-btn {");
    assert.match(block, /min-height:\s*44px/, "min-height 44px (audit: 36px)");
    assert.match(block, /min-width:\s*44px/, "min-width 44px — hit-area ngang thật");
  });

  it("(f2) nút nháp/pause: min-width 44px; cho phép wrap khi large-text (reflow 200%)", () => {
    const components = read("src/styles/components.css");
    const block = cssBlock(components, ".fb-compose__pause-btn {");
    assert.match(block, /min-width:\s*44px/, "nút nháp/pause phải có min-width 44px");
    assert.match(block, /white-space:\s*normal/, "large-text 200%: nút phải wrap được, không bóp chữ");
  });

  it("(f3) nút 'Làm mới' (pause info) đạt touch ≥44px", () => {
    const components = read("src/styles/components.css");
    const block = cssBlock(components, ".fb-compose__refresh {");
    assert.match(block, /min-height:\s*44px/, "nút 'Làm mới' phải ≥44px (audit: 32px)");
  });

  it("(f4) shell.css: compose container 480px ở ≥1024 không thể chứa 2 cột 340px -> xếp dọc (adaptive)", () => {
    const shell = read("src/styles/shell.css");
    assert.ok(
      /@media \(min-width: 1024px\)[\s\S]*\.fb-page \.fb-compose-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/.test(shell),
      "phải có override xếp dọc scoped .fb-page .fb-compose-grid ở ≥1024px",
    );
  });

  it("(f5) comment stress probe large-text 200% phải ghi rõ tiêu chí (không tràn ngang + reachable bằng cuộn)", () => {
    const shell = read("src/styles/shell.css");
    const components = read("src/styles/components.css");
    const both = shell + components;
    assert.match(both, /200%/, "phải ghi chú stress probe 200%");
    assert.match(both, /scrollWidth|cuộn dọc/, "tiêu chí: không tràn ngang + reachable bằng cuộn");
  });
});
