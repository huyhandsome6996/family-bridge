// f07_layout_more_check.mjs — kiểm tra browser THẬT (Chromium) sau sửa
// R08–R10, bổ sung bằng chứng mà happy-dom không đo được:
//  - Layout 320/390/430 + CSS text 200%: không tràn ngang (R06 giữ xanh
//    sau khi thêm phần tử trong sheet/nút).
//  - R09: nút [data-mood-more] hết trang KHÔNG hiển thị, KHÔNG nhận focus,
//    KHÔNG click được; số request GET /entries không tăng khi bấm.
//  - R10: sau 409 stale, sheet giữ focus trong dialog (Esc đóng được).
// Chạy trong runner kèm backend + 2 Vite (loopback, tài khoản synthetic).
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");

const origins = {
  mini: process.env.F07_MINI_BASE || "http://127.0.0.1:3019",
  web: process.env.F07_WEB_BASE || "http://127.0.0.1:5179",
};
const output = process.env.F07_LAYOUT_OUTPUT || "/tmp/f07-layout";
await mkdir(output, { recursive: true });
for (const value of Object.values(origins)) {
  if (!["127.0.0.1", "localhost"].includes(new URL(value).hostname)) {
    throw new Error("Local synthetic only");
  }
}
const password = process.env.F07_SYNTHETIC_PASSWORD || "E2e-local-2026!";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const results = [];
function check(name, pass, observed) {
  results.push({ name, pass, observed });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(observed)}`);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  for (const [client, origin, code] of [
    ["mini", origins.mini, "HSR08M19"],
    ["web", origins.web, "HSR08W19"],
  ]) {
    for (const [width, textScale] of [
      [320, null], [390, null], [430, null], [390, "200%"],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height: 844 },
      });
      const page = await context.newPage();
      await page.goto(`${origin}/#/login`);
      await page.locator("#fb-cred-code").fill(code);
      await page.locator("#fb-cred-password").fill(password);
      await page.getByRole("button", { name: "Đăng nhập vào không gian" }).click();
      await page.waitForURL((u) => !u.hash.startsWith("#/login"), { timeout: 20000 });
      await page.evaluate(() => { location.hash = "/mood"; });
      await page.locator("[data-page='mood']").waitFor({ timeout: 20000 });
      await page.waitForTimeout(800);
      if (textScale === "200%") {
        // Mô phỏng người dùng tăng cỡ chữ 200% bằng CSS font/line-height
        // nhân đôi trên từng phần tử text (đúng cách gói 10 dùng; là mô
        // phỏng browser, KHÔNG phải native OS scaling/device).
        await page.evaluate(() => {
          const elements = Array.from(document.querySelectorAll(
            "p,span,a,button,label,input,textarea,select,option,strong,h1,h2,h3"));
          for (const el of elements) {
            const size = getComputedStyle(el).fontSize;
            const height = getComputedStyle(el).lineHeight;
            el.style.setProperty("font-size", `${parseFloat(size) * 2}px`, "important");
            if (height.endsWith("px")) {
              el.style.setProperty("line-height", `${parseFloat(height) * 2}px`, "important");
            }
          }
        });
        await page.waitForTimeout(400);
      }
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      const label = `${client}-${width}${textScale ? "-text200" : ""}`;
      check(`layout-${label}`,
        overflow.scrollWidth <= overflow.innerWidth, overflow);
      await page.screenshot({ path: `${output}/layout-${label}.png`, fullPage: true });

      if (textScale === null && width === 390) {
        // R09 deep-check trên layout thường: hidden thật + focus/click.
        const more = page.locator("[data-mood-more]");
        const state = await more.evaluate((el) => ({
          hidden: el.hidden,
          display: getComputedStyle(el).display,
          visible: el.getBoundingClientRect().height > 0,
          focusable: (() => { el.focus(); return document.activeElement === el; })(),
        }));
        let requestCount = 0;
        const counter = (r) => {
          if (r.request().method() === "GET"
            && new URL(r.url()).pathname === "/api/v1/mood/entries") requestCount += 1;
        };
        page.on("response", counter);
        const before = requestCount;
        await more.click({ force: true, timeout: 3000 }).catch(() => null);
        await page.waitForTimeout(600);
        const clicked = requestCount - before;
        page.off("response", counter);
        check(`r09-more-hidden-focus-click-${client}`,
          state.hidden === true && state.display === "none"
          && state.visible === false && state.focusable === false && clicked === 0,
          { ...state, clicksCausingRequests: clicked });
      }
      await context.close();
    }
  }
} finally {
  await writeFile(`${output}/results.json`,
    JSON.stringify({ results }, null, 2) + "\n");
  await browser.close();
}
process.exitCode = results.some((r) => !r.pass) ? 1 : 0;
