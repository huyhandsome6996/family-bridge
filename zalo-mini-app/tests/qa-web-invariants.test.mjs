// tests/qa-web-invariants.test.mjs — QA Task 2 web (M6): bất biến tĩnh của
// web build Render. Quét text file, KHÔNG thực thi app:
//  1) src/** + index.html KHÔNG dùng CDN (Tailwind CDN, Google Fonts,
//     googleusercontent) — mọi asset bundle local.
//  2) KHÔNG setInterval trong các file web mới (Web Render Task 2) — không
//     polling; dữ liệu mới khi người dùng tải lại/trang mở (DSA-10).
//  3) KHÔNG localStorage.setItem trong src (SEC-10 — token in-memory).
//  4) zalo-mini-app/.env.example không gán biến SECRET/PASSWORD/TOKEN/PRIVATE.
//  5) render.yaml (repo root) phải khai báo static service family-bridge-web
//     với VITE_API_BASE_URL sync:false (secret không commit).
//  6) Spot check: nút chỉ-có-icon trong file web mới phải có aria-label.
//  7) Cấm copy "Đã gửi/Đã lưu/Đã chia sẻ" trong 7 trang web (không fake success).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";

const MINIAPP_ROOT = resolve(import.meta.dirname, "..");
const REPO_ROOT = resolve(MINIAPP_ROOT, "..");
const SRC = join(MINIAPP_ROOT, "src");

// File web thêm mới trong Web Render Task 2 (3-b2..3-b5) — ràng buộc chặt hơn.
const NEW_WEB_FILES = [
  "src/pages/cards/index.js",
  "src/pages/signal/index.js",
  "src/pages/message/index.js",
  "src/pages/mailbox/index.js",
  "src/pages/proposal/index.js",
  "src/pages/settings/index.js",
  "src/pages/privacy/index.js",
  "src/pages/login/credential-form.js",
  "src/components/app-shell.js",
];

// 7 trang web có hành động gửi/lưu — cấm copy khẳng định thành công kiểu
// "Đã gửi/Đã lưu/Đã chia sẻ" không qua xác nhận máy chủ (worklog Task 19).
const ACTION_PAGES = [
  "src/pages/cards/index.js",
  "src/pages/signal/index.js",
  "src/pages/message/index.js",
  "src/pages/mailbox/index.js",
  "src/pages/proposal/index.js",
  "src/pages/settings/index.js",
  "src/pages/privacy/index.js",
];

const BANNED_STRINGS = [
  "cdn.tailwindcss.com",
  "fonts.googleapis.com",
  "googleusercontent",
];

const BANNED_COPY = ["Đã gửi", "Đã lưu", "Đã chia sẻ"];

function listFilesRecursively(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listFilesRecursively(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

function rel(filePath) {
  return filePath.slice(REPO_ROOT.length + 1).split(sep).join("/");
}

/** Tách call cân bằng ngoặc dạng calleeName( ... ) — cho createButton. */
function extractCalls(source, calleeName) {
  const calls = [];
  const trigger = `${calleeName}(`;
  let at = source.indexOf(trigger);
  while (at !== -1) {
    let depth = 0;
    let end = -1;
    for (let i = at + calleeName.length; i < source.length; i += 1) {
      const ch = source[i];
      if (ch === "(") depth += 1;
      else if (ch === ")") {
        depth -= 1;
        if (depth === 0) { end = i; break; }
      }
    }
    if (end === -1) break;
    calls.push(source.slice(at, end + 1));
    at = source.indexOf(trigger, end);
  }
  return calls;
}

/** Tách call h("tag", ...) — mở ngoặc nằm TRƯỚC chuỗi tag. */
function extractHTagCalls(source, tag) {
  const calls = [];
  for (const quote of ["\"", "'"]) {
    const trigger = `h(${quote}${tag}${quote}`;
    let at = source.indexOf(trigger);
    while (at !== -1) {
      let depth = 0;
      let end = -1;
      for (let i = at + 1; i < source.length; i += 1) {
        const ch = source[i];
        if (ch === "(") depth += 1;
        else if (ch === ")") {
          depth -= 1;
          if (depth === 0) { end = i; break; }
        }
      }
      if (end === -1) break;
      calls.push(source.slice(at, end + 1));
      at = source.indexOf(trigger, end);
    }
  }
  return calls;
}

/** Bỏ các call con createIcon(...) để chỉ còn children trực tiếp. */
function stripChildCreateIcons(callText) {
  return callText.replace(/createIcon\((?:[^()]|\([^()]*\))*\)/g, "");
}

/** Nội dung children TRỰC TIẾP (sau attrs object đầu tiên) của một call. */
function directChildren(callText) {
  const open = callText.indexOf("{");
  if (open === -1) {
    const comma = callText.indexOf(",");
    return comma === -1 ? "" : callText.slice(comma + 1, callText.length - 1);
  }
  let depth = 0;
  for (let i = open; i < callText.length; i += 1) {
    if (callText[i] === "{") depth += 1;
    else if (callText[i] === "}") {
      depth -= 1;
      if (depth === 0) return callText.slice(i + 1, callText.length - 1);
    }
  }
  return "";
}

describe("QA web: cấm CDN bên ngoài (src + index.html)", () => {
  const files = [
    ...listFilesRecursively(SRC).filter((f) => f.endsWith(".js")),
    join(MINIAPP_ROOT, "index.html"),
  ].filter((f) => existsSync(f));

  it("không file nào chứa URL/điểm gốc CDN bị cấm", () => {
    const violations = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const banned of BANNED_STRINGS) {
        if (content.includes(banned)) violations.push(`${rel(file)} → ${banned}`);
      }
    }
    assert.deepEqual(violations, [], `phát hiện CDN: ${violations.join("; ")}`);
  });
});

describe("QA web: bất biến file web mới (Web Render Task 2)", () => {
  it("KHÔNG setInterval trong các file web mới", () => {
    const violations = [];
    for (const path of NEW_WEB_FILES) {
      const file = join(MINIAPP_ROOT, path);
      assert.ok(existsSync(file), `file web mới phải tồn tại: ${path}`);
      if (readFileSync(file, "utf8").includes("setInterval")) violations.push(path);
    }
    assert.deepEqual(violations, [], "không polling bằng setInterval");
  });

  it("src/** không có 'localStorage.setItem' (SEC-10)", () => {
    const hits = listFilesRecursively(SRC)
      .filter((file) => readFileSync(file, "utf8").includes("localStorage.setItem"))
      .map(rel);
    assert.deepEqual(hits, []);
  });

  it("icon-only button trong file web mới phải có aria-label (spot check regex)", () => {
    const violations = [];
    for (const path of NEW_WEB_FILES) {
      const source = readFileSync(join(MINIAPP_ROOT, path), "utf8");
      const calls = [
        ...extractCalls(source, "createButton"),
        ...extractHTagCalls(source, "button"),
      ];
      for (const call of calls) {
        if (!call.includes("createIcon(")) continue;
        const hasAriaLabel = /aria-label|ariaLabel/.test(call);
        // Chỉ đếm string literal ở CHILDREN trực tiếp — giá trị attr như
        // class="fb-btn" không phải text hiển thị.
        const childrenText = stripChildCreateIcons(directChildren(call));
        const visibleText = childrenText.match(/["'`][^"'`]+["'`]/);
        if (!hasAriaLabel && !visibleText) {
          violations.push(`${path} → ${call.slice(0, 80)}…`);
        }
      }
    }
    assert.deepEqual(violations, [],
      `nút icon-only thiếu aria-label: ${violations.join("; ")}`);
  });

  it("cấm copy 'Đã gửi/Đã lưu/Đã chia sẻ' trong 7 trang web", () => {
    const violations = [];
    for (const path of ACTION_PAGES) {
      const source = readFileSync(join(MINIAPP_ROOT, path), "utf8");
      for (const banned of BANNED_COPY) {
        if (source.includes(banned)) violations.push(`${path} → "${banned}"`);
      }
    }
    assert.deepEqual(violations, [], `copy cấm: ${violations.join("; ")}`);
  });
});

describe("QA web: cấu hình deploy & env", () => {
  it(".env.example không gán biến SECRET/PASSWORD/TOKEN/PRIVATE", () => {
    const content = readFileSync(join(MINIAPP_ROOT, ".env.example"), "utf8");
    const assignments = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    assert.deepEqual(
      assignments.filter((line) => /SECRET|PASSWORD|TOKEN|PRIVATE/i.test(line)),
      [],
      ".env.example không được gán biến secret",
    );
  });

  it("render.yaml khai báo static service family-bridge-web đúng schema", () => {
    const file = join(REPO_ROOT, "render.yaml");
    assert.ok(existsSync(file), "render.yaml phải tồn tại ở repo root");
    const content = readFileSync(file, "utf8");
    assert.ok(content.includes("name: family-bridge-web"), "thiếu service web");
    assert.match(content, /- type: web\s*\n\s*name: family-bridge-web\s*\n\s*runtime: static/,
      "service web phải là runtime: static");
    assert.ok(content.includes("staticPublishPath: zalo-mini-app/www"));
    assert.ok(content.includes("pullRequestPreviewsEnabled: false"));
    // VITE_API_BASE_URL sync:false — secret/giá trị thật không commit.
    const envBlock = content.slice(content.indexOf("family-bridge-web"));
    assert.ok(/- key: VITE_API_BASE_URL\s*\n\s*sync: false/.test(envBlock),
      "VITE_API_BASE_URL phải sync:false");
    // headers cache bất biến cho /assets/* + no-cache index.html.
    assert.ok(content.includes("path: /assets/*"), "thiếu header /assets/*");
    assert.ok(content.includes("value: no-cache"), "index.html phải no-cache");
    assert.ok(content.includes("X-Content-Type-Options"), "thiếu header bảo mật cơ bản");
  });
});
