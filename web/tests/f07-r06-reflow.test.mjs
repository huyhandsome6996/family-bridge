// tests/f07-r06-reflow.test.mjs — R06 regression: mood grid reflow ở chữ 200%
// trong viewport 320/390/430 (mô phỏng đúng phương pháp reviewer: tăng CSS
// font/line-height, đo scrollWidth — KHÔNG thu chữ, KHÔNG cắt nhãn).
// Chạy: node --test tests/f07-r06-reflow.test.mjs
import { register } from "node:module";
await register(new URL("./asset-hook.mjs", import.meta.url));
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Window } from "happy-dom";

const cssPath = fileURLToPath(new URL("../src/styles/components.css", import.meta.url));

// ---------------------------------------------------------------- globals
const domWindow = new Window({ url: "https://localhost/" });
globalThis.window = domWindow;
globalThis.document = domWindow.document;
globalThis.Node = domWindow.Node;
globalThis.Element = domWindow.Element;
globalThis.HTMLElement = domWindow.HTMLElement;
globalThis.DocumentFragment = domWindow.DocumentFragment;
globalThis.Event = domWindow.Event;
globalThis.KeyboardEvent = domWindow.KeyboardEvent;
globalThis.location = domWindow.location;
if (typeof globalThis.requestAnimationFrame === "undefined") {
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
}

const { initStore, resetState, setRole } = await import("../src/app/store.js");
const { setSession } = await import("../src/core/session.js");

describe("R06 CSS reflow — mood grid (components.css)", () => {
  it("grid dùng minmax(0, 1fr) — nội dung không đẩy rộng lưới", () => {
    const css = readFileSync(cssPath, "utf8").replace(/\r\n/g, "\n");
    assert.ok(
      css.includes(".fb-mood-grid--4 {\n  grid-template-columns: repeat(4, minmax(0, 1fr));"),
      "fb-mood-grid--4 phải dùng minmax(0, 1fr) (R06)",
    );
    assert.ok(
      css.includes(".fb-mood-grid--3 {\n  grid-template-columns: repeat(3, minmax(0, 1fr));"),
      "fb-mood-grid--3 phải dùng minmax(0, 1fr) (R06)",
    );
  });

  it("chip + nhãn + hint được phép xuống dòng; không thu chữ bằng cỡ cố định mới", () => {
    const css = readFileSync(cssPath, "utf8");
    const labelStart = css.indexOf(".fb-mood__label {");
    const labelBlock = css.slice(labelStart, css.indexOf("}", labelStart));
    assert.ok(labelBlock.includes("overflow-wrap: anywhere"), "nhãn phải wrap được (R06)");
    assert.ok(labelBlock.includes("min-width: 0"), "nhãn phải được phép co (R06)");
    assert.ok(labelBlock.includes("text-align: center"), "nhãn wrap vẫn căn giữa");
    const subStart = css.indexOf(".fb-mood .fb-sec__sub {");
    const subBlock = css.slice(subStart, css.indexOf("}", subStart));
    assert.ok(subBlock.includes("overflow-wrap: anywhere"), "hint trong chip phải wrap được (R06)");
    // Không "che" lỗi bằng thu chữ: cỡ nhãn vẫn là token gốc.
    assert.ok(css.includes("font-size: var(--fb-fs-label-sm);"), "không thu nhỏ chữ nhãn");
  });

  it("chữ 200%: chip không đẩy content width vượt container ở 320/390/430", async () => {
    const moodPage = (await import("../src/pages/mood/index.js")).page;
    initStore({ demoMode: false });
    resetState();
    setRole("student");
    setSession({
      token: "tok-r06",
      userId: "6f1c2a34-0000-4000-8000-000000000001",
      displayName: "Lan",
      expiresAt: Date.now() + 60_000,
    });
    const adapter = {
      moodSummary: async () => ({
        results: [],
        emotions: [
          { emotion: "vui", label: "Vui" }, { emotion: "binh_an", label: "Bình an" },
          { emotion: "met", label: "Mệt" }, { emotion: "buon", label: "Buồn" },
          { emotion: "lo", label: "Lo lắng" }, { emotion: "buc", label: "Bực bội" },
          { emotion: "kho_noi", label: "Khó nói thành lời" },
        ],
      }),
      listMoodEntries: async () => ({ results: [], next: null }),
    };
    const host = document.createElement("div");
    document.body.appendChild(host);
    host.appendChild(moodPage.render({
      store: { getState: () => ({ demoMode: false }) },
      adapter,
      navigate: () => {},
      params: new URLSearchParams(""),
    }));
    await new Promise((r) => setTimeout(r, 20));
    const grid = host.querySelector(".fb-mood-grid");
    assert.ok(grid, "grid mood tồn tại");
    // 200% text scaling như reviewer: CSS tăng font/line-height của phần tử chữ.
    const style = document.createElement("style");
    style.textContent =
      ".fb-mood__label, .fb-mood .fb-sec__sub { font-size: 2em !important; line-height: 1.6 !important; }";
    document.head.appendChild(style);
    const pagePadding = 32;
    for (const viewport of [320, 390, 430]) {
      const containerWidth = viewport - pagePadding;
      host.style.width = containerWidth + "px";
      grid.style.width = containerWidth + "px";
      assert.ok(
        grid.scrollWidth <= containerWidth,
        `viewport ${viewport}: grid scrollWidth ${grid.scrollWidth}px > container ${containerWidth}px (tràn ngang R06)`,
      );
    }
    document.head.removeChild(style);
    document.body.removeChild(host);
  });
});
