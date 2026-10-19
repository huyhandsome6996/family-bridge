import { register } from "node:module";
await register(new URL("./asset-hook.mjs", import.meta.url));
// F15 items — 2 test này giữ nguyên ĐIỂM CHẶN trang items.js (id "f15-items",
// route /privacy-items) vì trang đó VẪN SỐNG trong cây tích hợp (quyết định
// ghép F15: giữ page-core family + items.js, nối điều hướng từ /privacy) và
// các assertion của nó (guard double-submit khi lưu ghi chép riêng; lỗi mạng
// giữ bản nháp, không bao giờ tuyên bố "đã lưu") không có tương đương trên
// trang native /privacy — thích ứng chúng sang trang native sẽ phải XÓA
// assertion semantic (bị cấm). Inject vẫn qua ctx.privacyApi theo contract
// của trang items.js. Ý nghĩa mutation-guard trên trang native được pin ở
// tests/f15-privacy.test.mjs (double-click Thu hồi + timeout đọc lại).
import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
const win = new Window({ url: "https://localhost/" });
for (const key of ["window", "document", "Node", "Element", "HTMLElement", "DocumentFragment", "Event"]) globalThis[key] = key === "window" ? win : win[key];
const { page } = await import("../src/pages/privacy/items.js");
const tick = () => new Promise(r => setTimeout(r, 0));
function setup(post) {
  const root = page.render({ navigate: () => {}, privacyApi: { get: async () => ({ results: [] }), post } });
  document.body.replaceChildren(root); root.querySelector("textarea").value = "Synthetic private note";
  const save = [...root.querySelectorAll("button")].find(b => b.textContent === "Lưu ghi chép riêng");
  return { root, save };
}
test("F15 save confirms only after server response; double click is bounded", async () => {
  let resolve, calls = 0;
  const { root, save } = setup(() => { calls++; return new Promise(r => { resolve = r; }); });
  await tick(); save.click(); save.click(); await tick();
  assert.equal(calls, 1); assert.ok(!root.textContent.includes("Đã lưu riêng"));
  resolve({}); await tick(); await tick();
  assert.ok(root.textContent.includes("Đã lưu riêng. Chưa chia sẻ cho ai.")); page.destroy();
});
test("F15 network failure preserves draft and never claims saved", async () => {
  const { root, save } = setup(async () => { const e = new Error(); e.kind = "network"; throw e; });
  await tick(); save.click(); await tick();
  assert.ok(!root.textContent.includes("Đã lưu riêng"));
  assert.ok(root.textContent.includes("Chưa xác định kết quả"));
  assert.equal(root.querySelector("textarea").value, "Synthetic private note"); page.destroy();
});
