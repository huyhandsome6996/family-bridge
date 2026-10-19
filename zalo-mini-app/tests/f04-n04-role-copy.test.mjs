// tests/f04-n04-role-copy.test.mjs — N04 (QA 19/10, P2): Mini đăng nhập
// caregiver (role MÁY CHỦ xác minh) vẫn hiện copy học sinh hardcode:
//   label "Lời con muốn gửi" + placeholder "Chia sẻ suy nghĩ chân thật nhất
//   của con lúc này..." (~dòng 424/438 cũ).
//
// Hợp đồng fix (F04R2-LEAD-1):
// - Copy chọn theo role SERVER trong store của mini (nguồn role: đăng nhập
//   lớp trả result.role -> ctx.setRole — zalo-mini-app/src/pages/login;
//   role-select chỉ là lựa chọn xem trước demo). KHÔNG dùng role tự khai
//   để cấp quyền — đây CHỈ là copy UI, quyền vẫn backend.
// - Chuỗi parity TUYỆT ĐỐI với web/src/pages/compose/index.js (editorCopy):
//   caregiver  = "Lời bạn muốn gửi" + "Chia sẻ điều bạn muốn nhắn gửi một
//   cách nhẹ nhàng…"; student giữ nguyên chuỗi cũ.
// - Không mặc định mẹ/bố/xưng thay; không đổi copy trang khác (message/reply
//   đã trung tính — grep toàn src chỉ compose còn label theo vai).
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

/** Adapter stub tối giản — trang compose chỉ cần load Connections/Drafts. */
function createAdapter() {
  return {
    listConnections: async () => ({ results: [] }),
    listDrafts: async () => ({ results: [] }),
    aiStatus: async () => ({ ai_enabled: false }),
  };
}

function makeCtx({ role = "student" } = {}) {
  initStore({ demoMode: true });
  resetState();
  setRole(role);
  return {
    ctx: {
      store: { getState: () => ({ demoMode: true, role }) },
      adapter: createAdapter(),
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

/** Đọc chuỗi editorCopy (caregiver, student) NGUỒN CHUẨN từ web compose. */
function webEditorCopy() {
  const webSource = readFileSync(
    resolve(ROOT, "../web/src/pages/compose/index.js"),
    "utf8",
  );
  const start = webSource.indexOf("const editorCopy = isCaregiver");
  assert.ok(start !== -1, "web compose phải có editorCopy theo vai");
  const end = webSource.indexOf("};", start);
  const block = webSource.slice(start, end);
  const pairs = [...block.matchAll(/label:\s*"([^"]+)"\s*,\s*placeholder:\s*"([^"]+)"/g)]
    .map((m) => ({ label: m[1], placeholder: m[2] }));
  assert.equal(pairs.length, 2, "web editorCopy phải có đúng 2 nhánh vai");
  // Thứ tự trong web: nhánh caregiver (?) trước, student (:) sau.
  return { caregiver: pairs[0], student: pairs[1] };
}

function editorLabelOf(el) {
  const label = el.querySelector("label.fb-compose__label span");
  return label ? textOf(label) : null;
}

/* ========================= N04: copy theo role server ========================= */

describe("N04 (US-029/033): copy vùng soạn theo vai trò MÁY CHỦ — parity chuỗi tuyệt đối với web", () => {
  it("(a) caregiver (role server) -> đúng chuỗi web: 'Lời bạn muốn gửi' + placeholder trung tính", async () => {
    const web = webEditorCopy();
    const { ctx } = makeCtx({ role: "caregiver" });
    const { host, el } = mount(ctx);
    await wait(80);

    const textarea = el.querySelector("#fb-compose-body");
    assert.ok(textarea, "ô soạn phải tồn tại");
    assert.equal(
      editorLabelOf(el),
      web.caregiver.label,
      `label caregiver phải là "${web.caregiver.label}" (parity web) — thực tế: "${editorLabelOf(el)}"`,
    );
    assert.equal(
      textarea.getAttribute("placeholder"),
      web.caregiver.placeholder,
      `placeholder caregiver phải là "${web.caregiver.placeholder}" (parity web) — thực tế: "${textarea.getAttribute("placeholder")}"`,
    );
    cleanup(host);
  });

  it("(b) student giữ nguyên chuỗi cũ: 'Lời con muốn gửi' + placeholder hiện tại", async () => {
    const web = webEditorCopy();
    const { ctx } = makeCtx({ role: "student" });
    const { host, el } = mount(ctx);
    await wait(80);

    const textarea = el.querySelector("#fb-compose-body");
    assert.equal(editorLabelOf(el), web.student.label);
    assert.equal(textarea.getAttribute("placeholder"), web.student.placeholder);
    cleanup(host);
  });

  it("(c) source-level: mini compose chứa ĐÚNG chuỗi caregiver web (không hardcode lệch)", () => {
    const web = webEditorCopy();
    const miniSource = readFileSync(
      resolve(ROOT, "src/pages/compose/index.js"),
      "utf8",
    );
    assert.ok(
      miniSource.includes(web.caregiver.label)
        && miniSource.includes(web.caregiver.placeholder),
      "mini compose phải chứa chuỗi caregiver y hệt web (label + placeholder)",
    );
    assert.ok(
      miniSource.includes(web.student.label)
        && miniSource.includes(web.student.placeholder),
      "chuỗi student cũ phải giữ nguyên",
    );
  });

  it("(d) role thiếu/không hợp lệ -> mặc định student (an toàn như web: state.role || 'student')", async () => {
    initStore({ demoMode: true });
    resetState();
    const { ctx } = {
      ctx: {
        store: { getState: () => ({ demoMode: true, role: null }) },
        adapter: createAdapter(),
        navigate: () => {},
        setRole: () => {},
        rebuildAdapter: () => {},
        params: new URLSearchParams(""),
      },
    };
    const { host, el } = mount(ctx);
    await wait(80);
    assert.equal(editorLabelOf(el), "Lời con muốn gửi");
    cleanup(host);
  });
});
