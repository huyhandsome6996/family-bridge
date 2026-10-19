#!/usr/bin/env node
// scripts/f07_cross_client_e2e.mjs — E2E chéo hai client (X01–X09) qua UI
// THẬT (Playwright) cùng backend thật. KHÔNG gọi adapter từ console để thay
// bằng chứng UI; không token vào URL/storage/log; dữ liệu synthetic.
//
// Trạng thái kết quả TÁCH RIÊNG: PASS / FAIL / NOT_RUN / BLOCKED (bài học
// audit 19/10: NOT_RUN KHÔNG được cộng vào PASS; "20/20 PASS" cũ thực chất
// là 19 assertion chạy + 1 dòng NOT_RUN). Exit 1 CHỈ khi có FAIL.
//
// Yêu cầu môi trường (xem tests/handover F07):
//   - backend Django:     $F07_API_BASE  (mặc định http://127.0.0.1:8019)
//   - Zalo Mini App dev:  $F07_MINI_BASE (mặc định http://127.0.0.1:3019)
//   - Web dev:            $F07_WEB_BASE  (mặc định http://127.0.0.1:5179)
//   - fixture parity:     HSPAR19 / PHPAR19 (seed_parity.py, admin_provisioned,
//     invite NULL) + HSZE2E99 (người lạ, f07_local_fixtures.py)
//   - mật khẩu synthetic: $F07_SYNTHETIC_PASSWORD (fixture local, không log)
//   - X07 unlink/reconnect: CHỈ chạy trên cặp fixture RIÊNG cho bước này
//     (F07_E2E_WITH_UNLINK=1 + F07_E2E_UNLINK_HS/F07_E2E_UNLINK_PH) vì hủy
//     kết nối phá trạng thái pair dùng chung; KHÔNG hồi sinh grant cũ bằng
//     seed/DB. Không có cặp riêng -> X07 = NOT_RUN (không tính PASS).
// Đầu ra: JSON + screenshot vào $F07_E2E_OUTPUT.
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

const results = [];   // { name, status: PASS|FAIL, observed }
const notRun = [];    // { name, status: "NOT_RUN"|"BLOCKED", reason }
const mappings = [];  // ánh xạ tầng kiểm thử cho X09/X10 — không cộng PASS
const requests = [];
function check(name, pass, observed) {
  results.push({ name, status: pass ? "PASS" : "FAIL", pass, observed });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(observed)}`);
}
function markNotRun(name, reason, status = "NOT_RUN") {
  notRun.push({ name, status, reason });
  console.log(`${status} ${name}: ${reason}`);
}
function mapLayer(name, detail) {
  mappings.push({ name, detail });
  console.log(`MAP ${name}: ${detail}`);
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

/** Mở sheet chia sẻ từ dòng lịch sử mới nhất; KHÔNG xác nhận. Trả sheet. */
async function openShareSheet(page) {
  await page.locator("[data-page='mood'] button", { hasText: "Chia sẻ mục này" })
    .first().click();
  const sheet = page.locator(".fb-sheet");
  await sheet.waitFor({ timeout: 15000 });
  await wait(400);
  return sheet;
}

/** Sheet chia sẻ: mở từ dòng lịch sử mới nhất, chọn người nhận, xác nhận. */
async function shareLatest(page, _recipientLabel) {
  const sheet = await openShareSheet(page);
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

  // ------ X05b (R10): preview cũ xác nhận ở client kia -> lỗi 409 NẰM
  // TRONG sheet (live region), có đường "Xem lại bản mới"; KHÔNG tự share.
  let currentNote = N4; // theo dõi note hiện hành — mỗi edit đều đổi note
  {
    const x05bNote = `X05b stale ${suffix}`;
    const sheet = await openShareSheet(hsMini.page); // preview rev hiện hành
    const previewRev = Number(
      (norm(await sheet.innerText()).match(/Phiên bản:\s*(\d+)/) || [])[1]);
    const sharePostsBefore = requests.filter((r) =>
      r.tag === "HS-mini" && r.method === "POST" && r.path.endsWith("/share")).length;
    await editEntry(hsWeb.page, true, "lo", x05bNote); // revision +1 ở client kia
    currentNote = x05bNote;
    const select = sheet.locator("#mood-share-recipient");
    if ((await select.locator("option").count()) > 0) await select.selectOption({ index: 0 });
    const shareResponse = hsMini.page.waitForResponse(
      (r) => r.request().method() === "POST"
        && new URL(r.url()).pathname.endsWith("/share"));
    await sheet.locator("button", { hasText: "Xác nhận chia sẻ" }).click();
    const response = await shareResponse;
    let errorCode = null;
    try { errorCode = (await response.json()).error?.code || null; } catch { /* body lỗi */ }
    await wait(300);
    const sheetStillOpen = (await sheet.count()) === 1
      && (await sheet.innerText()).length > 0;
    const sheetText = norm(await sheet.innerText());
    const editorBehind = norm(await hsMini.page
      .locator("[data-page='mood']").innerText());
    const feedbackInSheet = sheetText.includes("Mục này vừa đổi");
    const confirmLocked = await sheet
      .locator("button", { hasText: "Xác nhận chia sẻ" }).first()
      .isDisabled();
    const refreshVisible = await sheet
      .locator("button", { hasText: "Xem lại bản mới" }).first()
      .isVisible().catch(() => false);
    // Phục hồi chủ động: xem bản mới (GET) — KHÔNG tự share revision mới.
    await sheet.locator("button", { hasText: "Xem lại bản mới" }).first().click();
    await wait(600);
    const refreshedText = norm(await sheet.innerText());
    const refreshedRev = Number((refreshedText.match(/Phiên bản:\s*(\d+)/) || [])[1]);
    const sharePostsAfterRefresh = requests.filter((r) =>
      r.tag === "HS-mini" && r.method === "POST" && r.path.endsWith("/share")).length;
    await hsMini.page.keyboard.press("Escape");
    await wait(300);
    check("X05b-stale-error-inside-sheet",
      response.status() === 409 && errorCode === "preview_stale"
      && sheetStillOpen && feedbackInSheet && confirmLocked && refreshVisible,
      { status: response.status(), code: errorCode, inSheet: feedbackInSheet,
        locked: confirmLocked, refresh: refreshVisible });
    check("X05b-recovery-refresh-only",
      refreshedRev === previewRev + 1
        && sharePostsAfterRefresh === sharePostsBefore + 1,
      { previewRev, refreshedRev, shareAttempts: sharePostsAfterRefresh - sharePostsBefore });
    await hsMini.page.screenshot({ path: `${output}/x05b-stale-sheet.png`, fullPage: true });
  }

  // ----------------- X06a: revoke trên web -> mini không đọc tiếp được
  await refreshMood(hsWeb.page); // UI web đang giữ rev cũ sau edit của mini
  const sharedRev3 = await shareLatest(hsWeb.page, recipientLabel); // chia sẻ lại bản hiện hành
  await goto(phMini.page, "profile"); // remount trung gian
  await goto(phMini.page, "mood-shared");
  const phRead3 = await readFirstShared(phMini.page);
  check("X06a-reshare-readable-on-mini", phRead3.text.includes(currentNote) && phRead3.revision === sharedRev3,
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
  check("X06b-reshare-readable-on-web", phRead4.text.includes(currentNote) && phRead4.revision === sharedRev4,
    { sharedRev: sharedRev4, phRev: phRead4.revision });
  await revokeLatestInSheet(hsMini.page);
  await goto(phWeb.page, "profile"); // remount trung gian
  await goto(phWeb.page, "mood-shared");
  const blockedOnWeb = !(await phWeb.page.locator("[data-page='mood-shared']").innerText())
    .includes(`Phiên bản: ${sharedRev4}`);
  check("X06b-mini-revoke-blocks-web", blockedOnWeb, { revokedRev: sharedRev4, blocked: blockedOnWeb });
  await hsMini.page.screenshot({ path: `${output}/x06-mini-after-revoke.png`, fullPage: true });

  // ---- X07 (tùy chọn): hủy kết nối qua UI — CHỈ trên cặp fixture RIÊNG
  // (F07_E2E_UNLINK_HS/PH) để không phá pair chính và không hồi sinh grant
  // bằng seed/DB. HS của cặp riêng chia sẻ 1 mục cho PH riêng, rồi unlink.
  const unlinkHs = process.env.F07_E2E_UNLINK_HS;
  const unlinkPh = process.env.F07_E2E_UNLINK_PH;
  if (process.env.F07_E2E_WITH_UNLINK === "1" && unlinkHs && unlinkPh) {
    const uHs = await newClientPage("web", "unlink-HS");
    const uPh = await newClientPage("mini", "unlink-PH");
    check("X07 unlink-hs-login",
      (await login(uHs.page, "web", unlinkHs)) === 200, 200);
    check("X07 unlink-ph-login",
      (await login(uPh.page, "mini", unlinkPh)) === 200, 200);
    await goto(uHs.page, "mood");
    const unlinkNote = `X07 unlink ${suffix}`;
    await editEntry(uHs.page, false, "vui", unlinkNote);
    const sheetU = await openShareSheet(uHs.page);
    const selectU = sheetU.locator("#mood-share-recipient");
    if ((await selectU.locator("option").count()) > 0) {
      await selectU.selectOption({ index: 0 });
      await sheetU.locator("button", { hasText: "Xác nhận chia sẻ" }).click();
      await sheetU.waitFor({ state: "detached", timeout: 15000 });
      await goto(uPh.page, "mood-shared");
      const beforeUnlink = await readFirstShared(uPh.page);
      check("X07 grant-readable-before-unlink",
        beforeUnlink.text.includes(unlinkNote), { ok: true });
    } else {
      markNotRun("X07 grant-readable-before-unlink",
        "pair riêng chưa có kết nối active — cần fixture reconnect đúng quy trình", "BLOCKED");
    }
    // Unlink qua UI (F15 cũng chạy ở tầng HTTP E2E 21 bước).
    await goto(uHs.page, "connect");
    await uHs.page.locator("button", { hasText: "Hủy kết nối" }).first().click();
    const unlinkDialog = uHs.page.locator(".fb-dialog");
    await unlinkDialog.waitFor({ timeout: 15000 });
    await unlinkDialog.locator("button", { hasText: "Hủy kết nối" }).last().click();
    await wait(500);
    await goto(uPh.page, "mood-shared");
    const afterUnlink = await uPh.page.locator("[data-page='mood-shared']").innerText();
    check("X07-unlink-blocks-read",
      !afterUnlink.includes("Phiên bản:") && !afterUnlink.includes(unlinkNote),
      { blocked: true });
    await uHs.context.close();
    await uPh.context.close();
  } else {
    markNotRun("X07-unlink-ui",
      "NOT_RUN (F07_E2E_WITH_UNLINK!=1 hoặc thiếu F07_E2E_UNLINK_HS/PH) — "
      + "phủ bởi regression backend Finding3/Finding4 + f07_local_e2e F15 "
      + "bước unlink (HTTP 21 bước); UI unlink/reconnect cần cặp fixture riêng");
  }
  mapLayer("X07 unlink/reconnect/F15",
    "UI (script này, khi bật cờ + cặp riêng) + HTTP E2E 21 bước (F15, unlink) "
    + "+ backend regression Finding3/4 — không hồi sinh grant bằng seed/DB");

  // ----------------- X08: logout bằng nút thật -> không còn private DOM
  // Bắt buộc: CẢ HAI PH đang xem private detail thật sự trước logout, kiểm
  // AND (note VÀ revision) — không dùng OR, không logout khi màn hình trống.
  await refreshMood(hsMini.page);
  const sharedRev5 = await shareLatest(hsMini.page, recipientLabel);
  await goto(phWeb.page, "mood-shared");
  const phRead5 = await readFirstShared(phWeb.page);
  check("X08-prelogout-readable-web",
    phRead5.text.includes(currentNote) && phRead5.revision === sharedRev5,
    { sharedRev: sharedRev5, note: phRead5.text.includes(currentNote), rev: phRead5.revision });
  await goto(phMini.page, "mood-shared");
  const phRead5m = await readFirstShared(phMini.page);
  check("X08-prelogout-readable-mini",
    phRead5m.text.includes(currentNote) && phRead5m.revision === sharedRev5,
    { sharedRev: sharedRev5, note: phRead5m.text.includes(currentNote), rev: phRead5m.revision });

  // Late response: chi tiết share đang bay -> logout trước khi response về;
  // phản hồi muộn KHÔNG được render nội dung riêng lên phiên đã đăng xuất.
  await phMini.context.route("**/api/v1/mood/shared/*", async (route) => {
    await wait(2500);
    await route.continue();
  });
  await goto(phMini.page, "mood-shared");
  const lateRow = phMini.page.locator(".fb-list__item", { hasText: "Mở nội dung" }).first();
  await lateRow.waitFor({ timeout: 15000 });
  await lateRow.locator("button", { hasText: "Mở nội dung" }).click();
  await wait(200); // request đang treo trong route delay
  await logoutViaUi(phMini.page, "mini"); // logout khi response chưa về
  await wait(2800); // cho response muộn về sau logout
  const miniBodyAfterLogout = await phMini.page.evaluate(() => document.body.innerText);
  check("X08-mini-logout-no-private-dom",
    !miniBodyAfterLogout.includes(currentNote) && !miniBodyAfterLogout.includes(N1)
      && !miniBodyAfterLogout.includes(`Phiên bản: ${sharedRev5}`),
    { note: miniBodyAfterLogout.includes(currentNote), rev: miniBodyAfterLogout.includes(`Phiên bản: ${sharedRev5}`) });
  await phMini.page.screenshot({ path: `${output}/x08-mini-after-logout.png`, fullPage: true });

  await logoutViaUi(phWeb.page, "web");
  const webBodyAfterLogout = await phWeb.page.evaluate(() => document.body.innerText);
  check("X08-web-logout-no-private-dom",
    !webBodyAfterLogout.includes(currentNote) && !webBodyAfterLogout.includes(`Phiên bản: ${sharedRev5}`),
    { note: webBodyAfterLogout.includes(currentNote), rev: webBodyAfterLogout.includes(`Phiên bản: ${sharedRev5}`) });
  await phWeb.page.screenshot({ path: `${output}/x08-web-after-logout.png`, fullPage: true });

  // Đổi actor trên cùng trang mini của PH: login NGƯỜI LẠ thay PH cũ —
  // phiên mới không được thấy dữ liệu riêng của phiên trước.
  check("X08 actor-switch-login",
    (await login(phMini.page, "mini", "HSZE2E99")) === 200, 200);
  await goto(phMini.page, "mood-shared");
  const actorShared = await phMini.page.locator("[data-page='mood-shared']").innerText();
  await goto(phMini.page, "mood");
  const actorMood = await phMini.page.locator("[data-page='mood']").innerText();
  check("X08-actor-switch-no-legacy-data",
    actorShared.includes("Chưa có gì được chia sẻ với bạn")
      && !actorMood.includes(N1) && !actorMood.includes(currentNote),
    { sharedEmpty: actorShared.includes("Chưa có gì được chia sẻ với bạn") });

  // ----------------- X09: người lạ không thấy dữ liệu của người khác
  check("X09-stranger-login", (await login(strangerWeb.page, "web", "HSZE2E99")) === 200, 200);
  await goto(strangerWeb.page, "mood-shared");
  const strangerShared = await strangerWeb.page.locator("[data-page='mood-shared']").innerText();
  check("X09-stranger-shared-empty",
    strangerShared.includes("Chưa có gì được chia sẻ với bạn")
      && !strangerShared.includes(N1) && !strangerShared.includes(currentNote),
    { empty: true });
  await goto(strangerWeb.page, "mood");
  const strangerMood = await strangerWeb.page.locator("[data-page='mood']").innerText();
  check("X09-stranger-mood-private", !strangerMood.includes(N1) && !strangerMood.includes(currentNote),
    { private: true });
  await strangerWeb.page.screenshot({ path: `${output}/x09-stranger-mood.png`, fullPage: true });

  // Ánh xạ tầng kiểm thử cho các khía cạnh KHÔNG thuộc UI này (không cộng PASS):
  mapLayer("X09 IDOR/object-level",
    "UI: stranger trống + riêng tư (script này); API/backend: object-level "
    + "authorization trong tests backend f07 (owner-only, reader-only) — "
    + "tầng service không thay bằng chứng UI");
  mapLayer("X09 admin/multi-owner",
    "no is_staff bypass + hai owner cùng recipient: backend suite F07 "
    + "(SQLite/MySQL) + independent repro R03 — không phải assertion UI");
  mapLayer("X10 MySQL concurrency",
    "F07 MySQL suite gồm 4 test race (create/share/edit) + independent "
    + "MySQL repro (revision tăng đúng, unapproved_readable=false) — "
    + "KHÔNG chạy UI trên MySQL này và không thay thiết bị Zalo thật");

  for (const { context } of [hsMini, hsWeb, phWeb, phMini, strangerWeb]) {
    await context.close();
  }
} catch (error) {
  // Lỗi ngoài mong đợi: kết thúc CHẮC CHẮN là incomplete, không phải PASS âm thầm.
  markNotRun("unexpected-error", `Lỗi script: ${error && error.message}`, "BLOCKED");
  throw error;
} finally {
  const passCount = results.filter((r) => r.status === "PASS").length;
  const failCount = results.filter((r) => r.status === "FAIL").length;
  const notRunCount = notRun.filter((r) => r.status === "NOT_RUN").length;
  const blockedCount = notRun.filter((r) => r.status === "BLOCKED").length;
  console.log(`SUMMARY pass=${passCount} fail=${failCount} not_run=${notRunCount} blocked=${blockedCount}`);
  console.log("Lưu ý: NOT_RUN/BLOCKED KHÔNG cộng vào PASS; exit 1 chỉ khi có FAIL.");
  await writeFile(
    `${output}/results.json`,
    JSON.stringify({
      scope: "Cross-client UI E2E X01–X09 trên backend thật, tài khoản synthetic; PASS/FAIL tách NOT_RUN/BLOCKED",
      summary: { pass: passCount, fail: failCount, not_run: notRunCount, blocked: blockedCount },
      results, not_run: notRun, mappings, requests,
    }, null, 2) + "\n",
  );
  await browser.close();
}
process.exitCode = results.some((r) => r.status === "FAIL") ? 1 : 0;
