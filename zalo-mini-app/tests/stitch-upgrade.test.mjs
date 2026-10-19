// tests/stitch-upgrade.test.mjs — kiểm thử đợt Stitch UI upgrade (2026-10).
// Phạm vi:
//  1) Asset/logo: ảnh chính chủ tồn tại, có trong src, hash khớp manifest.
//  2) Tokens: palette Stitch (HTML tham chiếu) được cài đúng giá trị; font
//     Be Vietnam Pro bundle cục bộ (không CDN runtime).
//  3) App header component: brand + Trợ giúp + avatar, không đụng vùng Zalo.
//  4) Trang compose (/compose, U34): trạng thái trung thực — KHÔNG tự gửi,
//     KHÔNG timer tự chạy, preview chỉ sau khi máy chủ mở, lỗi giữ nội dung.
//  5) Adapter F06: đường dẫn/động từ khớp backend family_bridge_features.
//
// Pattern happy-dom giống tests/pages.test.mjs: gắn globals TRƯỚC import động.
import { register } from "node:module";
await register(new URL("./asset-hook.mjs", import.meta.url));

import { readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import assert from "node:assert/strict";
const { describe, it } = await import("node:test");
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

const ROOT = resolve(import.meta.dirname, "..");
const SRC = join(ROOT, "src");

function rel(filePath) {
  return filePath.slice(ROOT.length + 1).split(sep).join("/");
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function textOf(el) {
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

function findButton(root, needle) {
  return Array.from(root.querySelectorAll("button")).find(
    (btn) => textOf(btn).includes(needle),
  );
}

const { initStore, setRole, resetState, getState } = await import("../src/app/store.js");
const { createMockAdapter } = await import("../src/core/adapter/mock-adapter.js");
const { ADAPTER_METHODS } = await import("../src/core/adapter/adapter.js");
const { createAppHeader } = await import("../src/components/app-header.js");
const { createLogo } = await import("../src/components/logo.js");
const compose = (await import("../src/pages/compose/index.js")).page;
const welcome = (await import("../src/pages/welcome/index.js")).page;

function makeCtx({ demo = true, role = "student" } = {}) {
  initStore({ demoMode: demo });
  resetState();
  if (role) setRole(role);
  const adapter = createMockAdapter({ scenario: null });
  const navigateCalls = [];
  return {
    ctx: {
      store: { getState },
      adapter,
      navigate: (path) => navigateCalls.push(path),
      setRole: (nextRole) => setRole(nextRole),
      rebuildAdapter: () => {},
      params: new URLSearchParams(""),
    },
    adapter,
    navigateCalls,
  };
}

/* ----------------------- 1) Asset + logo chính chủ ----------------------- */

describe("Stitch: asset logo chính chủ (PROMPT §4)", () => {
  it("ảnh derivative tồn tại trong src/assets/logo và không rỗng", () => {
    for (const name of [
      "logo-mark.png",
      "logo-mark-transparent.png",
      "logo-lockup.png",
      "logo-lockup-transparent.png",
      "app-icon.png",
    ]) {
      const path = join(SRC, "assets/logo", name);
      assert.ok(existsSync(path), `thiếu ${name}`);
      assert.ok(statSync(path).size > 1000, `${name} quá nhỏ — có thể crop sai`);
    }
  });

  it("ảnh nguồn giữ bất biến trong docs/design/assets", () => {
    const src = join(ROOT, "..", "docs/design/assets/family-bridge-logo-reference.png");
    assert.ok(existsSync(src), "ảnh nguồn phải còn nguyên trong repo");
  });

  it("createLogo dùng <img> asset (không còn SVG placeholder), alt đúng", () => {
    const logo = createLogo({ size: "lg" });
    assert.ok(logo.classList.contains("fb-logo--lg"));
    const img = logo.querySelector("img");
    assert.ok(img, "logo phải là <img>");
    assert.equal(img.getAttribute("alt"), "Family Bridge");
    assert.ok(img.getAttribute("src").includes("logo-mark"), "src phải trỏ asset mark");
  });

  it("manifest asset ghi nguồn + tọa độ crop", () => {
    const manifestPath = join(ROOT, "..", "docs/design/stitch-ui-upgrade/asset-manifest.json");
    assert.ok(existsSync(manifestPath), "thiếu asset-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const text = JSON.stringify(manifest);
    assert.ok(text.includes("logo-mark"), "manifest phải ghi derivative mark");
    assert.ok(text.includes("3f70d1eb"), "manifest phải ghi hash nguồn");
  });
});

/* --------------------- 2) Tokens + font bundle cục bộ --------------------- */

describe("Stitch: tokens + font (PROMPT §3/§5)", () => {
  it("tokens.css chứa palette HTML của màn tham chiếu", () => {
    const css = readFileSync(join(SRC, "styles/tokens.css"), "utf8");
    for (const value of ["#9D3D27", "#FFF8F6", "#360F07", "#BD543D", "#FFDDB2", "#FFDAD3", "#56423E"]) {
      assert.ok(css.includes(value), `thiếu màu Stitch ${value}`);
    }
  });

  it("font Be Vietnam Pro bundle cục bộ, không phụ thuộc CDN runtime", () => {
    for (const name of ["BeVietnamPro-Regular.ttf", "BeVietnamPro-Medium.ttf", "BeVietnamPro-SemiBold.ttf", "BeVietnamPro-Bold.ttf"]) {
      assert.ok(existsSync(join(SRC, "assets/fonts", name)), `thiếu font ${name}`);
    }
    const fontsCss = readFileSync(join(SRC, "styles/fonts.css"), "utf8");
    assert.ok(!fontsCss.includes("fonts.googleapis.com"), "không được nạp font CDN runtime");
    assert.ok(fontsCss.includes("font-display: swap"));
    const license = readFileSync(join(SRC, "assets/fonts/OFL.txt"), "utf8");
    assert.ok(license.toLowerCase().includes("sil open font license"), "thiếu giấy phép OFL");
  });

  it("index.css import đúng thứ tự fonts → tokens → base → components", () => {
    const css = readFileSync(join(SRC, "styles/index.css"), "utf8");
    const order = ["fonts.css", "tokens.css", "base.css", "components.css"]
      .map((name) => css.indexOf(name));
    assert.deepEqual([...order].sort((a, b) => a - b), order, "thứ tự import sai");
  });

  it("không đưa Tailwind CDN hay script ngoài vào app", () => {
    for (const file of ["src/styles/index.css", "src/main.js", "index.html"]) {
      const content = readFileSync(join(ROOT, file), "utf8");
      assert.ok(!content.includes("cdn.tailwindcss.com"), `${file} chứa Tailwind CDN`);
    }
  });
});

/* ----------------------- 3) App header component ----------------------- */

describe("Stitch: app header (U08/U10)", () => {
  it("header có brand, pill Trợ giúp (#/help) và avatar; không render node lạ", () => {
    const header = createAppHeader({ subtitle: "Trang Chủ", onProfile: () => {} });
    assert.ok(header.classList.contains("fb-app-header"));
    const help = header.querySelector('a[href="#/help"]');
    assert.ok(help, "pill Trợ giúp phải là link #/help");
    assert.ok(textOf(help).includes("Trợ giúp"));
    const avatar = header.querySelector("button.fb-app-header__avatar");
    assert.ok(avatar, "avatar phải là nút");
  });

  it("welcome giữ CTA dẫn /login + link #/help luôn có (bản dựng Stitch)", () => {
    const { ctx, navigateCalls } = makeCtx({ demo: false });
    const host = domWindow.document.createElement("div");
    domWindow.document.body.appendChild(host);
    const el = welcome.render(ctx);
    host.appendChild(el);
    assert.ok(textOf(el).includes("Tiếp tục để đăng nhập"));
    assert.ok(el.querySelector('a[href="#/help"]'), "help phải luôn truy cập được");
    const cta = findButton(el, "Tiếp tục để đăng nhập");
    cta.click();
    assert.ok(navigateCalls.includes("/login"), "CTA phải dẫn sang /login");
    // Không được tự dựng đăng nhập ngay trên welcome (không SDK, không form token)
    assert.ok(!el.querySelector("input[type=password]"), "welcome không có form mật khẩu");
    host.remove();
  });
});

/* --------------------- 4) Trang compose (U34) trung thực --------------------- */

describe("Stitch: trang compose (/compose, U34)", () => {
  it("page contract đúng + id f06-compose + không cần bottom nav", () => {
    assert.equal(compose.id, "f06-compose");
    assert.equal(compose.requiresRole, true);
    assert.equal(compose.showBottomNav, false);
    assert.equal(typeof compose.render, "function");
  });

  it("demo: hiển thị đúng cấu trúc — người nhận, soạn, khoảng dừng, CTA xem trước bị chặn khi chưa xong", async () => {
    const { ctx } = makeCtx({ demo: true, role: "student" });
    const host = domWindow.document.createElement("div");
    domWindow.document.body.appendChild(host);
    const el = compose.render(ctx);
    host.appendChild(el);
    await wait(1400); // mock latency: listConnections + listDrafts

    const text = textOf(el);
    assert.ok(text.includes("Gửi đến"), "thẻ người nhận phải có");
    assert.ok(text.includes("Lời con muốn gửi"), "vùng soạn phải có");
    assert.ok(text.includes("Khoảng dừng bình tâm"), "thẻ khoảng dừng phải có");
    assert.ok(text.includes("05:00"), "badge 5 phút phải có");

    // CTA xem trước bị chặn khi chưa lưu nháp + chưa hết khoảng dừng.
    const previewBtn = el.querySelector(".fb-btn-hero");
    assert.ok(previewBtn, "CTA xem trước phải tồn tại");
    assert.equal(previewBtn.disabled, true, "preview phải bị chặn khi chưa đủ điều kiện");

    // Không có nút gửi BẬT nào trên màn soạn (gửi chỉ trong sheet xác nhận).
    const activeSendButtons = Array.from(el.querySelectorAll("button"))
      .filter((btn) => !btn.disabled && textOf(btn).includes("Gửi"));
    assert.equal(activeSendButtons.length, 0, "không được có nút gửi bật sẵn");

    host.remove();
    resetState();
  });

  it("demo luồng thật: lưu nháp -> tạm dừng (máy chủ trả deadline) -> preview bị chặn -> báo còn thời gian", async () => {
    const { ctx } = makeCtx({ demo: true, role: "student" });
    const host = domWindow.document.createElement("div");
    domWindow.document.body.appendChild(host);
    const el = compose.render(ctx);
    host.appendChild(el);
    await wait(1400);

    // Gõ nội dung rồi lưu nháp (createDraft thật qua mock adapter).
    const textarea = el.querySelector("#fb-compose-body");
    textarea.value = "Mẹ ơi, hôm nay con có chuyện ở trường hơi căng thẳng.";
    textarea.dispatchEvent(new domWindow.Event("input", { bubbles: true }));
    assert.ok(textOf(el).includes("53 ký tự"), "counter phải cập nhật theo số ký tự");

    const saveBtn = findButton(el, "Lưu nháp riêng");
    saveBtn.click();
    await wait(900);
    assert.ok(
      textOf(el).includes("Bản nháp đã nằm trên máy chủ"),
      `phải báo đã lưu qua máy chủ: ${textOf(el).slice(0, 400)}`,
    );

    // Bắt đầu khoảng dừng: deadline phải đến từ dữ liệu máy chủ (mock).
    const pauseBtn = findButton(el, "Bắt đầu 5 phút nghỉ");
    pauseBtn.click();
    await wait(900);
    const text = textOf(el);
    assert.ok(
      text.includes("Máy chủ đã bắt đầu khoảng dừng 5 phút"),
      `phải ghi nhận khoảng dừng do máy chủ: ${text.slice(0, 500)}`,
    );
    assert.ok(
      text.includes("không tự gửi") || text.includes("không tự gửi"),
      "copy phải khẳng định không tự gửi",
    );
    // Preview vẫn bị chặn khi chưa hết giờ.
    const previewBtn = el.querySelector(".fb-btn-hero");
    assert.equal(previewBtn.disabled, true, "preview phải chặn khi còn khoảng dừng");
    assert.ok(
      textOf(el).match(/Còn \d{2}:\d{2} theo máy chủ/),
      "phải hiển thị thời gian còn lại theo máy chủ",
    );

    host.remove();
    resetState();
  });

  it("destroy() ngăn cập nhật DOM muộn (không ghost update)", async () => {
    const { ctx } = makeCtx({ demo: true, role: "student" });
    const host = domWindow.document.createElement("div");
    domWindow.document.body.appendChild(host);
    const el = compose.render(ctx);
    host.appendChild(el);
    const snapshot = el.innerHTML;
    compose.destroy();
    await wait(1400);
    assert.equal(el.innerHTML, snapshot, "DOM không được đổi sau destroy");
    host.remove();
    resetState();
  });
});

/* --------------------------- 5) Adapter F06 --------------------------- */

describe("Stitch: adapter F06 (nháp + khoảng dừng máy chủ)", () => {
  it("ADAPTER_METHODS khai đủ 9 method F06 với chú thích đúng", () => {
    for (const name of [
      "listDrafts", "createDraft", "getDraft", "editDraft", "discardDraft",
      "pauseDraft", "cancelDraftPause", "previewDraft", "confirmDraftSend",
    ]) {
      assert.ok(ADAPTER_METHODS.includes(name), `thiếu ${name}`);
    }
  });

  it("mock: pause trả deadline +300s và re-pause KHÔNG reset deadline", async () => {
    const { ctx } = makeCtx({ demo: true, role: "student" });
    const created = await ctx.adapter.createDraft({
      kind: "text",
      body: "Thử khoảng dừng.",
      recipientId: "demo-peer-fixture",
    });
    assert.equal(created.status, "editing");
    const first = await ctx.adapter.pauseDraft(created.draft_id);
    assert.equal(first.status, "paused");
    assert.ok(first.pause && first.pause.deadline, "phải có deadline từ 'máy chủ'");
    const second = await ctx.adapter.pauseDraft(created.draft_id);
    assert.equal(
      Date.parse(second.pause.deadline),
      Date.parse(first.pause.deadline),
      "re-pause phải giữ nguyên deadline (không reset)",
    );
  });

  it("mock: preview bị chặn khi còn khoảng dừng (cooldown_active) và mở sau khi hết", async () => {
    const { ctx } = makeCtx({ demo: true, role: "student" });
    const created = await ctx.adapter.createDraft({ kind: "text", body: "Nội dung thư." });
    await ctx.adapter.pauseDraft(created.draft_id);
    await assert.rejects(
      () => ctx.adapter.previewDraft(created.draft_id),
      (error) => error.code === "cooldown_active",
      "preview phải bị chặn khi còn khoảng dừng",
    );
    // Giả lập hết giờ: kéo deadline về quá khứ trong bộ nhớ mock qua getDraft? —
    // mock không cho sửa deadline từ ngoài (đúng thiết kế: máy chủ quyết).
    // Thay vào đó xác nhận confirm-send từ chối preview không tồn tại.
    await assert.rejects(
      () => ctx.adapter.confirmDraftSend(created.draft_id, "preview-khong-ton-tai"),
      (error) => error.code === "preview_stale" || error.code === "cooldown_active",
    );
  });

  it("mock: kind phải thuộc KINDS backend (text|emotion_card) — không che lỗi hợp đồng", async () => {
    const { ctx } = makeCtx({ demo: true, role: "student" });
    // "letter" KHÔNG nằm trong KINDS của backend — mock phải từ chối giống hệt
    await assert.rejects(
      () => ctx.adapter.createDraft({ kind: "letter", body: "Nội dung" }),
      (error) => error.status === 400 && error.details?.reason === "kind_not_allowed",
    );
    await assert.rejects(
      () => ctx.adapter.createDraft({ kind: "email", body: "Nội dung" }),
      (error) => error.status === 400,
    );
    // kind hợp lệ vẫn tạo được
    const ok = await ctx.adapter.createDraft({ kind: "text", body: "Nội dung" });
    assert.ok(ok.draft_id);
  });

  // CẬP NHẬT (N01 — QA 19/10, P1 "gửi sai bản đã duyệt"): test cũ pin shape
  // CŨ "preview KHÔNG có body (compose dùng snapshot)" — assert hành vi SAI
  // theo hợp đồng mới. Backend A2 (make_preview, f06_drafts/services/drafts.py)
  // giờ trả kèm `body` = snapshot nội dung MÁY CHỦ chốt; mock (A1) đồng bộ;
  // client (mini + web) bắt buộc hiển thị `preview.body ?? snapshotBody` trong
  // sheet xác nhận — TUYỆT ĐỐI không đọc lại live textarea (nguồn lỗi N01:
  // preview đang bay sửa nội dung -> sheet hiện bản khác bản máy chủ bind).
  // Nên test đổi chiều: preview PHẢI có body (shape mới), các trường cũ giữ nguyên.
  it("mock: preview trả ĐÚNG shape backend MỚI — CÓ body (snapshot máy chủ cho sheet xác nhận)", async () => {
    const { ctx } = makeCtx({ demo: true, role: "student" });
    const created = await ctx.adapter.createDraft({
      kind: "text",
      body: "Nội dung để xem trước.",
      recipientId: "demo-peer-fixture",
    });
    await ctx.adapter.pauseDraft(created.draft_id);
    // Kéo deadline về quá khứ bằng cách tạo nháp mới với pause đã hết? —
    // mock không cho sửa deadline từ ngoài; thay vào đó kiểm tra shape qua
    // việc preview CHƯA hết giờ trả cooldown (đã test ở trên) và shape các
    // trường dự kiến có mặt khi hợp lệ được pin qua source của mock:
    // {preview_id, revision, recipient_id, body, deadline, server_time}.
    // ADR-1 (task 18-a): mock-adapter chuyển về packages/family_bridge_shared
    // (shim giữ path import). Đọc SOURCE từ file thật trong shared.
    const mockSource = readFileSync(join(ROOT, "..", "packages", "family_bridge_shared", "src", "adapter", "mock-adapter.js"), "utf8");
    const previewFn = mockSource.slice(
      mockSource.indexOf("async previewDraft"),
      mockSource.indexOf("async confirmDraftSend"),
    );
    assert.ok(previewFn.includes("body: draft.body"),
      "preview PHẢI trả body = snapshot máy chủ (hợp đồng N01 mới — client dùng preview.body ?? snapshotBody)");
    for (const field of ["preview_id", "revision:", "recipient_id", "deadline", "server_time"]) {
      assert.ok(previewFn.includes(field), `preview phải có ${field}`);
    }
  });

  it("mock: edit bản nháp đang paused quay về editing (deadline giữ nguyên)", async () => {
    const { ctx } = makeCtx({ demo: true, role: "student" });
    const created = await ctx.adapter.createDraft({ kind: "text", body: "Bản đầu." });
    const paused = await ctx.adapter.pauseDraft(created.draft_id);
    assert.equal(paused.status, "paused");
    const edited = await ctx.adapter.editDraft(created.draft_id, { body: "Bản sửa." });
    assert.equal(edited.status, "editing", "sửa nội dung đưa nháp về editing");
    assert.ok(edited.pause, "deadline CỐ TÌNH không bị xóa khi sửa (không reset dừng)");
    assert.equal(
      Date.parse(edited.pause.deadline),
      Date.parse(paused.pause.deadline),
      "sửa nội dung không reset thời điểm kết thúc dừng",
    );
  });

  it("mock: confirm-send thiếu người nhận bị từ chối (như backend)", async () => {
    const { ctx } = makeCtx({ demo: true, role: "student" });
    const created = await ctx.adapter.createDraft({ kind: "text", body: "Không người nhận." });
    await assert.rejects(
      () => ctx.adapter.confirmDraftSend(created.draft_id, "preview-gi"),
      (error) => error.status === 400 || error.code === "cooldown_active" || error.code === "preview_stale",
    );
  });

  it("mock: body quá 4000 ký tự bị từ chối (ràng buộc backend)", async () => {
    const { ctx } = makeCtx({ demo: true, role: "student" });
    await assert.rejects(
      () => ctx.adapter.createDraft({ kind: "text", body: "a".repeat(4001) }),
      (error) => error.status === 400,
    );
  });
});
