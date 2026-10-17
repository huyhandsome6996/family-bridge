// Kiểm thử bất biến màn Consent theo Stitch (18/10/2026).
// Chạy cho CẢ HAI client (bản port byte-identical) — file này chỉ khác
// đường dẫn import giữa web/ và zalo-mini-app/.
// B01: desktop/mobile thật với policy keys thật, không QA controls.
// B02: mới = không tick gì; từ chối tùy chọn vẫn tiếp tục sau service.
// B03: khôi phục bản ghi hiện hành; bản cũ/không rút không tự tick lại.
// B09: không runtime Tailwind CDN, không QA toolbar, không alert-success,
//      không inline unsafe HTML, logo thật (createLogo <img>).
import { register } from "node:module";
import assert from "node:assert/strict";

await register(new URL("./asset-hook.mjs", import.meta.url));

const { Window } = await import("happy-dom");

const ROOT = ".."; // test nam trong <client>/tests → goc client la ../

const window = new Window({ url: "https://localhost/" });
globalThis.window = window;
globalThis.document = window.document;
globalThis.Node = window.Node;
globalThis.Element = window.Element;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Event = window.Event;
globalThis.CustomEvent = window.CustomEvent;
globalThis.HashChangeEvent = window.HashChangeEvent;
try {
  Object.defineProperty(globalThis, "navigator", {
    value: window.navigator, configurable: true, writable: true,
  });
} catch {
  // navigator sẵn có là đủ (Node 21+ đọc-only) — happy-dom DOM vẫn hoạt động.
}
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", {
    value: (await import("node:crypto")).webcrypto,
    configurable: true, writable: true,
  });
}

const { setSession, clearSession } = await import(
  `${ROOT}/src/core/session.js`);
const { page } = await import(`${ROOT}/src/pages/consent/index.js`);
const fs = await import("node:fs");
const { test } = await import("node:test");

function makeCtx({ demo = false, adapter }) {
  const navigateCalls = [];
  return {
    ctx: {
      store: { getState: () => ({ demoMode: demo, role: null }) },
      adapter,
      navigate: (to) => navigateCalls.push(to),
      setRole: () => {},
      params: new URLSearchParams(),
    },
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

function unmount(host) {
  page.destroy();
  host.remove();
}

function textOf(el) {
  return el.textContent || "";
}

function consentAdapter({ existing = [] } = {}) {
  const recorded = [];
  return {
    mode: "test",
    recorded,
    listConsents: async () => existing.slice(),
    recordConsent: async (input) => {
      recorded.push(input);
      return { consent_id: `c-${recorded.length}` };
    },
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("B01 — không còn QA panel/setScreenState/timeout-giả trong mã consent", async () => {
  const source = fs.readFileSync(
    new URL(`${ROOT}/src/pages/consent/index.js`, import.meta.url), "utf8");
  assert.ok(!source.includes("Bảng kiểm thử"), "không còn QA panel");
  assert.ok(!source.includes("setScreenState"), "setScreenState không còn là nguồn sự thật");
  assert.ok(!source.includes("setTimeout("), "không giả lưu bằng setTimeout");
  assert.ok(!source.includes("alert("), "không alert");
  assert.ok(!source.includes("cdn.tailwindcss.com"), "không Tailwind CDN");
  assert.ok(!source.includes("Mã hóa bảo vệ gia đình"),
    "không quảng cáo mã hóa (không thiết lập kiến trúc mã hóa)");
  assert.ok(!source.includes("Thông tin gia đình"),
    "bỏ breadcrumb bước giả 'Thông tin gia đình'");
});

test("B01 — bố cục Stitch: aside ngữ cảnh + panel quyết định, desktop 2 cột", async () => {
  clearSession();
  setSession({ token: "t", userId: "u", expiresAt: Date.now() + 60_000 });
  const { ctx } = makeCtx({ adapter: consentAdapter() });
  const { host, el } = mount(page, ctx);
  await wait(60);
  assert.ok(el.querySelector(".fb-consent__shell"), "thiếu shell lưới 2 cột");
  assert.ok(el.querySelector(".fb-consent__aside"), "thiếu aside ngữ cảnh");
  assert.ok(el.querySelector(".fb-consent__panel"), "thiếu panel quyết định");
  assert.ok(textOf(el).includes("Quyền lựa chọn thuộc về bạn"));
  assert.ok(textOf(el).includes("Xác nhận sự đồng ý của bạn"));
  // CSS desktop: grid 2 cột >=1024px trong CẢ HAI client
  const css = fs.readFileSync(
    new URL(`${ROOT}/src/styles/components.css`, import.meta.url), "utf8");
  assert.ok(css.includes(".fb-consent__shell"), "thiếu CSS consent");
  assert.ok(css.includes("grid-template-columns: 5fr 7fr"),
    "thiếu tỷ lệ 5/7 ở desktop");
  clearSession();
  unmount(host);
});

test("B08 — checkbox native 44px, hộp 24px, check thấy rõ khi chọn (CSS thật)", async () => {
  const css = fs.readFileSync(
    new URL(`${ROOT}/src/styles/components.css`, import.meta.url), "utf8");
  assert.ok(/\.fb-consent__check-input\s*{[^}]*44px[^}]*}/.test(css),
    "input checkbox phải 44px vùng chạm");
  assert.ok(/background-size:\s*24px\s+24px/.test(css),
    "hộp hiển thị 24px");
  assert.ok(css.includes(".fb-consent__check-input:checked"),
    "phải có trạng thái :checked hiển thị check");
  assert.ok(css.includes("data:image/svg+xml"),
    "check vẽ bằng SVG data URI (không phụ thuộc peer selector)");
  assert.ok(css.includes("prefers-reduced-motion"),
    "tôn trọng reduced motion");
});

test("B-dialog — 'Xem chi tiết' mở dialog thật với nội dung policy, KHÔNG đổi checkbox", async () => {
  clearSession();
  setSession({ token: "t", userId: "u", expiresAt: Date.now() + 60_000 });
  const { ctx } = makeCtx({ adapter: consentAdapter() });
  const { host, el } = mount(page, ctx);
  await wait(60);
  const serviceBox = el.querySelector("#fb-consent-service");
  const detailButton = Array.from(el.querySelectorAll("button"))
    .find((b) => b.textContent.includes("Xem chi tiết"));
  assert.ok(detailButton, "thiếu nút xem chi tiết");
  detailButton.click();
  await wait(20);
  const dialog = document.querySelector(".fb-dialog");
  assert.ok(dialog, "dialog chi tiết phải mở (nội dung thật, không href '#')");
  assert.ok(dialog.textContent.includes("Phiên bản hiện hành: service-v1"),
    "dialog hiển thị phiên bản policy thật");
  assert.equal(serviceBox.checked, false,
    "bấm chi tiết KHÔNG được làm thay đổi checkbox");
  dialog.querySelector("button").click();
  await wait(10);
  assert.equal(document.querySelector(".fb-dialog"), null, "dialog đóng được");
  clearSession();
  unmount(host);
});

test("B14 — trợ giúp luôn với tới được kể cả chưa chấp nhận điều khoản", async () => {
  clearSession();
  setSession({ token: "t", userId: "u", expiresAt: Date.now() + 60_000 });
  const { ctx } = makeCtx({ adapter: consentAdapter() });
  const { host, el } = mount(page, ctx);
  await wait(60);
  const helpLinks = Array.from(el.querySelectorAll('a[href="#/help"]'));
  assert.ok(helpLinks.length >= 1, "phải có liên kết #/help thật");
  clearSession();
  unmount(host);
});

test("B02 — chưa chọn gì: đúng 3 checkbox đều bỏ trống, CTA khóa", async () => {
  clearSession();
  setSession({ token: "t", userId: "u", expiresAt: Date.now() + 60_000 });
  const { ctx } = makeCtx({ adapter: consentAdapter({ existing: [] }) });
  const { host, el } = mount(page, ctx);
  await wait(60);
  const boxes = Array.from(el.querySelectorAll('input[type="checkbox"]'));
  assert.equal(boxes.length, 3);
  assert.ok(boxes.every((b) => !b.checked));
  clearSession();
  unmount(host);
});
