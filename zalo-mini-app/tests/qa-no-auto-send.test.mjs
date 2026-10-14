// tests/qa-no-auto-send.test.mjs — QA Task 4: không tự gửi, không timer tự hành động.
//  1) src/** không chứa setInterval (DSA-10: không polling/timer tự hành động).
//  2) src/** không chứa tuyên bố thành công chưa có thật ("Đã gửi"/"Đã lưu").
//  3) connection-check: destroy() khi demo đang chạy phải chặn mọi cập nhật DOM
//     sau khi rời trang (đối chiếu với case KHÔNG destroy để chứng minh destroy
//     thực sự chặn thứ gì đó).
//  4) Nút "Con cần được lắng nghe" chỉ mở sheet xem trước — KHÔNG gửi, không
//     báo "đã gửi".
//
// Pattern happy-dom giống tests/pages.test.mjs: gắn globals TRƯỚC import động.

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

const { describe, it } = await import("node:test");
const assert = (await import("node:assert/strict")).default;
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";

const { initStore, setRole, resetState, getState } = await import("../src/app/store.js");
const { createMockAdapter } = await import("../src/core/adapter/mock-adapter.js");
const connectionCheck = (await import("../src/pages/connection-check/index.js")).page;
const home = (await import("../src/pages/home/index.js")).page;

const ROOT = resolve(import.meta.dirname, "..");
const SRC = join(ROOT, "src");

function listFilesRecursively(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFilesRecursively(full));
    else out.push(full);
  }
  return out;
}

function rel(filePath) {
  return filePath.slice(ROOT.length + 1).split(sep).join("/");
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function textOf(el) {
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

function findButton(root, needle) {
  return Array.from(root.querySelectorAll("button")).find(
    (btn) => textOf(btn).includes(needle),
  );
}

function makeCtx({ demo = true, role = "student" } = {}) {
  initStore({ demoMode: demo });
  resetState();
  if (role) setRole(role);
  const adapter = createMockAdapter({ scenario: null });
  const navigateCalls = [];
  return {
    ctx: {
      store: { getState }, // store thật (module src/app/store.js), không phải snapshot
      adapter,
      navigate: (path) => navigateCalls.push(path),
      setRole: (nextRole) => setRole(nextRole),
      rebuildAdapter: (scenario) => {
        Object.assign(adapter, createMockAdapter({ scenario }));
      },
      params: new URLSearchParams(""),
    },
    adapter,
    navigateCalls,
  };
}

function mount(pageModule, ctx) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const el = pageModule.render(ctx);
  host.appendChild(el);
  return { host, el };
}

describe("QA: không tự gửi / không timer tự hành động (DSA-10, SEC-07)", () => {
  it("src/** không chứa setInterval (không polling, không timer tự gửi)", () => {
    const hits = listFilesRecursively(SRC).filter((file) =>
      readFileSync(file, "utf8").includes("setInterval"),
    );
    assert.deepEqual(hits.map(rel), [], "setInterval bị cấm trong src");
  });

  it("src/** không chứa autoSend / tự retry gửi", () => {
    const offenders = [];
    for (const file of listFilesRecursively(SRC)) {
      const content = readFileSync(file, "utf8");
      if (/autoSend|auto-send|autosubmit|autoSubmit/i.test(content)) {
        offenders.push(rel(file));
      }
    }
    assert.deepEqual(offenders, [], "không được có cơ chế auto-send/auto-submit");
  });

  it("src/** không tuyên bố 'Đã gửi'/'Đã lưu' (chỉ báo thành công chỉ sau server xác nhận)", () => {
    const offenders = [];
    for (const file of listFilesRecursively(SRC)) {
      const content = readFileSync(file, "utf8");
      if (/Đã gửi|Đã lưu|Đã chia sẻ/.test(content)) offenders.push(rel(file));
    }
    assert.deepEqual(offenders, [], `tuyên bố thành công không có thật: ${offenders.join(", ")}`);
  });
});

describe("QA: connection-check destroy chặn cập nhật sau khi rời trang", () => {
  it("CONTROL (không destroy): demo chạy xong phải hiện 'Đã kết nối tới máy chủ'", async () => {
    const { ctx } = makeCtx({ demo: true });
    const { host, el } = mount(connectionCheck, ctx);
    await wait(2200);
    assert.ok(
      textOf(el).includes("Đã kết nối tới máy chủ"),
      "mock demo phải kịp hoàn tất khi KHÔNG destroy",
    );
    unmountAndReset(host);
  });

  it("destroy() ngay sau render: DOM không đổi sau 2.2s (không còn cập nhật)", async () => {
    const { ctx } = makeCtx({ demo: true });
    const { host, el } = mount(connectionCheck, ctx);
    const snapshot = el.innerHTML;
    connectionCheck.destroy(); // router gọi destroy khi rời trang
    await wait(2200);
    assert.equal(el.innerHTML, snapshot, "không được thay đổi DOM sau destroy");
    assert.ok(textOf(el).includes("Đang kiểm tra kết nối với máy chủ…"));
    assert.ok(!textOf(el).includes("Đã kết nối tới máy chủ"));
    assert.ok(!textOf(el).includes("Không kiểm tra được kết nối"));
    unmountAndReset(host);
  });
});

describe("QA: nút tín hiệu chỉ xem trước, KHÔNG gửi", () => {
  it("mở sheet, chọn người nhận -> chỉ thông báo 'sẽ sớm có', không 'Đã gửi'", async () => {
    const { ctx } = makeCtx({ demo: true, role: "student" });
    const { host, el } = mount(home, ctx);
    await wait(1200); // mock latency: getConnectionStatus + getProfile

    // Stitch upgrade: CTA amber có nhãn "Mở lời chia sẻ an toàn" (kicker
    // "Con cần được lắng nghe" là tiêu đề thẻ). Quy tắc nghiệp vụ giữ nguyên:
    // bấm CHỈ mở sheet xem trước — không gửi, không báo "đã gửi".
    const signalBtn = findButton(el, "Mở lời chia sẻ an toàn");
    assert.ok(signalBtn, "CTA tín hiệu phải tồn tại");
    signalBtn.click();

    const sheet = el.querySelector(".fb-sheet");
    assert.ok(sheet, "chỉ được mở sheet xem trước");
    const sheetText = textOf(sheet);
    assert.ok(
      sheetText.includes("chưa có tín hiệu nào được gửi đi"),
      "sheet phải nói rõ chưa gửi gì",
    );

    const recipientBtn = Array.from(sheet.querySelectorAll("button")).find((btn) =>
      textOf(btn).includes("Người đồng hành"),
    );
    if (recipientBtn) recipientBtn.click();
    const after = textOf(el);
    assert.ok(after.includes("sẽ sớm có ở bản đầy đủ"), "phải là thông báo sắp có");
    assert.doesNotMatch(after, /đã gửi/i, "không được báo đã gửi");
    // Stitch: tile "Gửi thẻ cảm xúc" (disabled, trung thực) chứa chữ "Gửi" —
    // rule nghiệp vụ là KHÔNG có nút gửi BẬT nào sau sheet tín hiệu.
    const activeSendButtons = Array.from(el.querySelectorAll("button"))
      .filter((btn) => !btn.disabled && textOf(btn).includes("Gửi"));
    assert.equal(activeSendButtons.length, 0, "không được có nút Gửi đang bật");
    unmountAndReset(host);
  });
});

function unmountAndReset(host) {
  host.remove();
  // Dọn sheet/overlay còn sót trên document.body (component sheet tự gắn body)
  document.body.querySelectorAll(".fb-sheet-root, .fb-dialog-root").forEach((el) => el.remove());
  resetState();
}
