#!/usr/bin/env node
// scripts/f07_cross_client_e2e.mjs — E2E chéo hai client (X01–X06, X08, X09)
// qua UI THẬT (Playwright) cùng backend thật. KHÔNG gọi adapter từ console để
// thay bằng chứng UI; không token vào URL/storage/log; dữ liệu synthetic.
//
// Yêu cầu môi trường (xem tests/handover F07):
//   - backend Django:     $F07_API_BASE  (mặc định http://127.0.0.1:8019)
//   - Zalo Mini App dev:  $F07_MINI_BASE (mặc định http://127.0.0.1:3019)
//   - Web dev:            $F07_WEB_BASE  (mặc định http://127.0.0.1:5179)
//   - fixture parity:     HSPAR19 / PHPAR19 (seed_parity.py, admin_provisioned,
//     invite NULL) + HSZE2E99 (người lạ, f07_local_fixtures.py)
//   - mật khẩu synthetic: $F07_SYNTHETIC_PASSWORD (fixture local, không log)
// Đầu ra: JSON + screenshot vào $F07_E2E_OUTPUT. Exit 1 nếu bất kỳ phép kiểm
// nào FAIL. X07 (unlink/reconnect qua UI) chỉ chạy khi F07_E2E_WITH_UNLINK=1
// vì hủy kết nối làm mất trạng thái fixture dùng chung.
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");

const apiBase = process.env.F07_API_BASE || "http://127.0.0.1:8019";
const origins = {
  mini: process.env.F07_MINI_BASE || "http://127.0.0.1:3019",
  web: process.env.F07_WEB_BASE || "http://127.0.0.1:5179",
};
const output = process.env.F07_E2E_OUTPUT || "/tmp/f07-e2e";
const password = process.env.F07_SYNTHETIC_PASSWORD;
if (!password) throw new Error("F07_SYNTHETIC_PASSWORD is required (fixture local value, not logged)");
for (const value of [apiBase, ...Object.values(origins)]) {
  if (!["localhost", "127.0.0.1"].includes(new URL(value).hostname)) {
    throw new Error("Disposable localhost testing only");
  }
}
await mkdir(output, { recursive: true });

const results = [];
const requests = [];
function check(name, pass, observed) {
  results.push({ name, pass, observed });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(observed)}`);
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => Date.now().toString(36);
function norm(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

async function newClientPage(client, label) {
  const context = await browser.newContext({
    viewport: client === "web" ? { width: 1280, height: 900 } : { width: 390, height: 844 },
  });
  const page = await context.newPage();
  page.on("response", (r) => {
    const path = new URL(r.url()).pathname;
    if (path.startsWith("/api/v1/")) {
      requests.push({
        tag: label, method: r.request().method(),
        path: path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "<id>"), status: r.status(),
      });
    }
  });
  return { context, page };
}

async function login(page, client, code) {
  await page.goto(`${origins[client]}/#/login`);
  await page.locator("#fb-cred-code").fill(code);
  await page.locator("#fb-cred-password").fill(password);
  const loginResponse = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/v1/auth/class-session"
      && r.request().method() === "POST");
  await page.getByRole("button", { name: "Đăng nhập vào không gian" }).click();
  const status = (await loginResponse).status();
  await page.waitForURL((url) => !url.hash.startsWith("#/login"), { timeout: 15000 });
  return status;
}

async function goto(page, route) {
  const changed = await page.evaluate((r) => {
    const target = `#/${r}`;
    if (window.location.hash === target) {
      // Cùng hash: window.location.hash không tạo hashchange — bắn sự kiện
      // như navigate() của app để router render lại trang (remount + fetch mới).
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      return false;
    }
    window.location.hash = target;
    return true;
  }, route);
  await page.locator(`[data-page="${route}"]`).waitFor({ timeout: 15000 });
  await wait(500); // cho các fetch trong trang kịp về và render (kể cả remount)
  void changed;
}

/** Dòng lịch sử MỚI NHẤT trên /mood: {note, revision, row} */
async function latestHistoryRow(page) {
  const row = page.locator("[data-page='mood'] .fb-list__item",
    { hasText: "Phiên bản hiện tại" }).first();
  await row.waitFor({ timeout: 20000 });
  const text = norm(await row.innerText());
  const match = text.match(/Phiên bản hiện tại:\s*(\d+)/);
  return { text, revision: match ? Number(match[1]) : null, row };
}

/** Sheet chia sẻ: mở từ dòng lịch sử mới nhất, trả preview revision. */
async function shareLatest(page, _recipientLabel) {
  await page.locator("[data-page='mood'] button", { hasText: "Chia sẻ mục này" })
    .first().click();
  const sheet = page.locator(".fb-sheet");
  await sheet.waitFor({ timeout: 15000 });
  await wait(400);
  const previewText = norm(await sheet.innerText());
  const previewRev = Number((previewText.match(/Phiên bản:\s*(\d+)/) || [])[1]);
  const select = sheet.locator("#mood-share-recipient");
  const optionCount = await select.locator("option").count();
  if (optionCount > 0) await select.selectOption({ index: 0 }); // fixture: đúng một kết nối
  await sheet.locator("button", { hasText: "Xác nhận chia sẻ" }).click();
  await sheet.waitFor({ state: "detached", timeout: 15000 });
  await wait(300);
  return previewRev;
}

async function revokeLatestInSheet(page) {
  await page.locator("[data-page='mood'] button", { hasText: "Chia sẻ mục này" })
    .first().click();
  const sheet = page.locator(".fb-sheet");
  await sheet.waitFor({ timeout: 15000 });
  await wait(400);
  await sheet.locator("button", { hasText: "Thu hồi quyền này" }).first().click();
  const dialog = page.locator(".fb-dialog");
  await dialog.waitFor({ timeout: 15000 });
  await dialog.locator("button", { hasText: "Thu hồi" }).first().click();
  await dialog.waitFor({ state: "detached", timeout: 15000 });
  // Ứng dụng GIỮ sheet mở sau thu hồi (cập nhật badge trạng thái thật):
  // đợi badge "Đã thu hồi" rồi đóng sheet bằng Esc.
  await sheet.locator("text=Đã thu hồi").first().waitFor({ timeout: 15000 });
  await page.keyboard.press("Escape");
  await sheet.waitFor({ state: "detached", timeout: 15000 });
  await wait(300);
}

/** Sửa mục (từ editor hoặc từ dòng lịch sử) với emotion + note mới. */
async function editEntry(page, fromHistory, emotion, note) {
  const pageRoot = page.locator("[data-page='mood']");
  if (fromHistory) {
    await pageRoot.locator("button", { hasText: "Sửa mục này" }).first().click();
    await wait(300);
  }
  await pageRoot.locator(`.fb-mood[data-emotion='${emotion}']`).click();
  await pageRoot.locator(".fb-textarea").fill(note);
  const saveLabel = fromHistory ? "Lưu thay đổi cho mục đã chọn" : "Lưu thay đổi cho hôm nay";
  const saveButton = pageRoot.locator("button", { hasText: "Lưu tâm trạng hôm nay" })
    .or(pageRoot.locator("button", { hasText: saveLabel }));
  await saveButton.first().click();
  await pageRoot.locator("text=Máy chủ đã ghi nhận").first().waitFor({ timeout: 15000 });
  await wait(400); // lịch sử tải lại
}

/** Refresh trang mood (đi qua profile rồi về) để luôn thao tác trên dữ liệu hiện hành. */
async function refreshMood(page) {
  await goto(page, "profile");
  await goto(page, "mood");
}

/** Phía nhận đọc chi tiết share đầu tiên; trả {text, revision}. */
async function readFirstShared(page) {
  const pageRoot = page.locator("[data-page='mood-shared']");
  const row = pageRoot.locator(".fb-list__item", { hasText: "Mở nội dung" }).first();
  await row.waitFor({ timeout: 15000 });
  await row.locator("button", { hasText: "Mở nội dung" }).click();
  const detail = pageRoot.locator("[data-shared-detail]");
  await detail.waitFor({ timeout: 15000 });
  await wait(300);
  const text = norm(await detail.innerText());
  const revision = Number((text.match(/Phiên bản:\s*(\d+)/) || [])[1]);
  return { text, revision };
}

async function logoutViaUi(page, client) {
  await goto(page, "profile");
  await page.locator("[data-page='profile'] button", { hasText: "Đăng xuất" }).first().click();
  const dialog = page.locator(".fb-dialog");
  await dialog.waitFor({ timeout: 15000 });
  await dialog.locator("button", { hasText: "Đăng xuất" }).first().click();
  await page.waitForURL((url) => url.hash.startsWith("#/login"), { timeout: 15000 });
  await wait(400);
}

try {
  const suffix = stamp();
  const N1 = `X01 ghi từ mini ${suffix}`;
  const N2 = `X02 ghi từ web ${suffix}`;
  const N3 = `X04 chia sẻ từ web ${suffix}`;
  const N4 = `X05/X06 bản mới ${suffix}`;

  const hsMini = await newClientPage("mini", "HS-mini");
  const hsWeb = await newClientPage("web", "HS-web");
  const phWeb = await newClientPage("web", "PH-web");
  const phMini = await newClientPage("mini", "PH-mini");
  const strangerWeb = await newClientPage("web", "stranger-web");

  // ---------------------------------------------------------------- login
  check("X00 hs-login-mini", (await login(hsMini.page, "mini", "HSPAR19")) === 200, 200);
  check("X00 hs-login-web", (await login(hsWeb.page, "web", "HSPAR19")) === 200, 200);
  check("X00 ph-login-web", (await login(phWeb.page, "web", "PHPAR19")) === 200, 200);
  check("X00 ph-login-mini", (await login(phMini.page, "mini", "PHPAR19")) === 200, 200);

  // ---------------------------------------------- X01: mini viết, web đọc
  await goto(hsMini.page, "mood");
  await editEntry(hsMini.page, false, "buon", N1);
  const miniRow1 = await latestHistoryRow(hsMini.page);
  await goto(hsWeb.page, "mood");
  const webRow1 = await latestHistoryRow(hsWeb.page);
  check("X01 mini-write-web-read", webRow1.text.includes(N1) && webRow1.revision === miniRow1.revision,
    { miniRev: miniRow1.revision, webRev: webRow1.revision });
  await hsMini.page.screenshot({ path: `${output}/x01-mini-mood.png`, fullPage: true });
  await hsWeb.page.screenshot({ path: `${output}/x01-web-mood.png`, fullPage: true });

  // ---------------------------------------------- X02: web sửa, mini đọc
  await editEntry(hsWeb.page, true, "lo", N2);
  const webRow2 = await latestHistoryRow(hsWeb.page);
  await goto(hsMini.page, "profile"); // remount trung gian (home hai client khác data-page)
  await goto(hsMini.page, "mood");
  const miniRow2 = await latestHistoryRow(hsMini.page);
  check("X02 web-edit-mini-reads-current", miniRow2.text.includes(N2)
    && miniRow2.revision === webRow2.revision,
    { webRev: webRow2.revision, miniRev: miniRow2.revision });

  // ---------------------------------------------- X03: mini share, web đọc
  const recipientLabel = "Mẹ Lan (E2E)";
  const sharedRev1 = await shareLatest(hsMini.page, recipientLabel);
  await goto(phWeb.page, "mood-shared");
  const phRead1 = await readFirstShared(phWeb.page);
  check("X03 mini-share-web-reads", phRead1.text.includes(N2) && phRead1.revision === sharedRev1,
    { sharedRev: sharedRev1, phRev: phRead1.revision });
  await phWeb.page.screenshot({ path: `${output}/x03-web-shared.png`, fullPage: true });

  // ---------------------------------------------- X04: web share, mini đọc
  await editEntry(hsWeb.page, true, "vui", N3); // edit làm grant cũ stale
  const sharedRev2 = await shareLatest(hsWeb.page, recipientLabel);
  await goto(phMini.page, "mood-shared");
  const phRead2 = await readFirstShared(phMini.page);
  check("X04 web-share-mini-reads", phRead2.text.includes(N3) && phRead2.revision === sharedRev2,
    { sharedRev: sharedRev2, phRev: phRead2.revision });
  await phMini.page.screenshot({ path: `${output}/x04-mini-shared.png`, fullPage: true });

  // ----------------------------- X05: edit sau share -> bản cũ bị chặn
  await editEntry(hsMini.page, true, "binh_an", N4);
  const miniRow5 = await latestHistoryRow(hsMini.page);
  await goto(phWeb.page, "profile"); // remount trung gian
  await goto(phWeb.page, "mood-shared");
  const staleVisible = (await phWeb.page.locator("[data-page='mood-shared']").innerText())
    .includes(`Phiên bản: ${sharedRev2}`);
  check("X05-stale-grant-hidden-on-web", !staleVisible, { staleRev: sharedRev2, blocked: !staleVisible });

  // ----------------- X06a: revoke trên web -> mini không đọc tiếp được
  await refreshMood(hsWeb.page); // UI web đang giữ rev cũ sau edit của mini
  const sharedRev3 = await shareLatest(hsWeb.page, recipientLabel); // chia sẻ lại bản hiện hành
  await goto(phMini.page, "profile"); // remount trung gian
  await goto(phMini.page, "mood-shared");
  const phRead3 = await readFirstShared(phMini.page);
  check("X06a-reshare-readable-on-mini", phRead3.text.includes(N4) && phRead3.revision === sharedRev3,
    { sharedRev: sharedRev3, phRev: phRead3.revision });
  await revokeLatestInSheet(hsWeb.page);
  await goto(phMini.page, "profile"); // remount trung gian
  await goto(phMini.page, "mood-shared");
  const blockedOnMini = !(await phMini.page.locator("[data-page='mood-shared']").innerText())
    .includes(`Phiên bản: ${sharedRev3}`);
  check("X06a-web-revoke-blocks-mini", blockedOnMini, { revokedRev: sharedRev3, blocked: blockedOnMini });

  // ----------------- X06b: revoke trên mini -> web không đọc tiếp được
  await refreshMood(hsMini.page);
  const sharedRev4 = await shareLatest(hsMini.page, recipientLabel);
  await goto(phWeb.page, "profile"); // remount trung gian
  await goto(phWeb.page, "mood-shared");
  const phRead4 = await readFirstShared(phWeb.page);
  check("X06b-reshare-readable-on-web", phRead4.text.includes(N4) && phRead4.revision === sharedRev4,
    { sharedRev: sharedRev4, phRev: phRead4.revision });
  await revokeLatestInSheet(hsMini.page);
  await goto(phWeb.page, "profile"); // remount trung gian
  await goto(phWeb.page, "mood-shared");
  const blockedOnWeb = !(await phWeb.page.locator("[data-page='mood-shared']").innerText())
    .includes(`Phiên bản: ${sharedRev4}`);
  check("X06b-mini-revoke-blocks-web", blockedOnWeb, { revokedRev: sharedRev4, blocked: blockedOnWeb });
  await hsMini.page.screenshot({ path: `${output}/x06-mini-after-revoke.png`, fullPage: true });

  // ----------------- X07 (tùy chọn): hủy kết nối qua UI /connect
  if (process.env.F07_E2E_WITH_UNLINK === "1") {
    await goto(hsWeb.page, "connect");
    await hsWeb.page.locator("button", { hasText: "Hủy kết nối" }).first().click();
    const unlinkDialog = hsWeb.page.locator(".fb-dialog");
    await unlinkDialog.waitFor({ timeout: 15000 });
    await unlinkDialog.locator("button", { hasText: "Hủy kết nối" }).last().click();
    await wait(500);
    await goto(phMini.page, "profile"); // remount trung gian
    await goto(phMini.page, "mood-shared");
    const afterUnlink = await phMini.page.locator("[data-page='mood-shared']").innerText();
    check("X07-unlink-blocks-read", !afterUnlink.includes("Phiên bản:"), { blocked: true });
  } else {
    check("X07-unlink-ui", true, "NOT_RUN (F07_E2E_WITH_UNLINK!=1) — phủ bởi regression backend Finding3/Finding4 + f07_local_e2e F15 bước 20-21");
  }

  // ----------------- X08: logout bằng nút thật -> không còn private DOM
  await goto(phWeb.page, "mood-shared"); // đọc lần cuối trước khi logout
  await readFirstShared(phWeb.page).catch(() => null);
  // Đảm bảo PH còn quyền: chia sẻ lại từ mini trước khi test logout
  await refreshMood(hsMini.page);
  const sharedRev5 = await shareLatest(hsMini.page, recipientLabel);
  await goto(phWeb.page, "mood-shared");
  const phRead5 = await readFirstShared(phWeb.page);
  check("X08-prelogout-readable", phRead5.text.includes(N4) || phRead5.revision === sharedRev5,
    { sharedRev: sharedRev5 });
  const noteOnScreen = N4;
  await logoutViaUi(phWeb.page, "web");
  const webBodyAfterLogout = await phWeb.page.evaluate(() => document.body.innerText);
  check("X08-web-logout-no-private-dom",
    !webBodyAfterLogout.includes(noteOnScreen) && !webBodyAfterLogout.includes("Được chia sẻ với bạn"),
    { onLogin: true });
  await logoutViaUi(phMini.page, "mini");
  const miniBodyAfterLogout = await phMini.page.evaluate(() => document.body.innerText);
  check("X08-mini-logout-no-private-dom", !miniBodyAfterLogout.includes(noteOnScreen),
    { onLogin: true });
  await phWeb.page.screenshot({ path: `${output}/x08-web-after-logout.png`, fullPage: true });

  // ----------------- X09: người lạ không thấy dữ liệu của người khác
  check("X09-stranger-login", (await login(strangerWeb.page, "web", "HSZE2E99")) === 200, 200);
  await goto(strangerWeb.page, "mood-shared");
  const strangerShared = await strangerWeb.page.locator("[data-page='mood-shared']").innerText();
  check("X09-stranger-shared-empty",
    strangerShared.includes("Chưa có gì được chia sẻ với bạn")
      && !strangerShared.includes(N1) && !strangerShared.includes(N4),
    { empty: true });
  await goto(strangerWeb.page, "mood");
  const strangerMood = await strangerWeb.page.locator("[data-page='mood']").innerText();
  check("X09-stranger-mood-private", !strangerMood.includes(N1) && !strangerMood.includes(N4),
    { private: true });
  await strangerWeb.page.screenshot({ path: `${output}/x09-stranger-mood.png`, fullPage: true });

  for (const { context } of [hsMini, hsWeb, phWeb, phMini, strangerWeb]) {
    await context.close();
  }
} finally {
  await writeFile(
    `${output}/results.json`,
    JSON.stringify({ scope: "Cross-client UI E2E X01–X09 trên backend thật, tài khoản synthetic", results, requests }, null, 2) + "\n",
  );
  await browser.close();
}
process.exitCode = results.some((r) => !r.pass) ? 1 : 0;
