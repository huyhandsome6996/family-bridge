// tests/qa-web-invariants.test.mjs — port web từ mini (task 19-a, ADR-3/4):
// bất biến tĩnh của web/ độc lập. Quét text file, KHÔNG thực thi app:
//  1) web/src/** + web/index.html KHÔNG dùng CDN (Tailwind CDN, Google Fonts,
//     googleusercontent) — mọi asset bundle local.
//  2) KHÔNG setInterval trong web/src (không polling — DSA-10; mini có
//     invariant cấm setInterval, web giữ nguyên).
//  3) KHÔNG localStorage/sessionStorage (cả ĐỌC) trong web/src — SEC-10,
//     store web in-memory (kể cả role — khác mini chỉ dùng sessionStorage).
//  4) KHÔNG zmp-sdk ở bất kỳ đâu trong web/ (web không host Zalo).
//  5) web/.env.example không gán biến SECRET/PASSWORD/TOKEN/PRIVATE.
//  6) render.yaml (repo root) khai báo static service family-bridge-web với
//     buildCommand `cd web && npm ci && npm run build`, staticPublishPath
//     `web/dist`, VITE_API_BASE_URL sync:false (ADR-4).
//  7) Spot check: nút chỉ-có-icon trong web/src phải có aria-label.
//  8) Cấm copy "Đã gửi/Đã lưu nháp/Đã chia sẻ" trong web/src (không fake
//     success — các màn W2-b port sau cũng chịu ràng buộc này).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";

const WEB_ROOT = resolve(import.meta.dirname, "..");
const REPO_ROOT = resolve(WEB_ROOT, "..");
const SRC = join(WEB_ROOT, "src");

const BANNED_STRINGS = [
  "cdn.tailwindcss.com",
  "fonts.googleapis.com",
  "googleusercontent",
];

const BANNED_TOKENS = ["zmp-sdk", "localStorage", "sessionStorage", "setInterval"];

const BANNED_COPY = ["Đã gửi", "Đã lưu nháp", "Đã lưu", "Đã chia sẻ"];

function listFilesRecursively(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
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

/** Strip comment JS (đơn giản) để token-scan không bắt comment giải thích. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((line) => {
      const at = line.indexOf("//");
      return at === -1 ? line : line.slice(0, at);
    })
    .join("\n");
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
    ...listFilesRecursively(SRC).filter((f) => f.endsWith(".js") || f.endsWith(".css")),
    join(WEB_ROOT, "index.html"),
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

describe("QA web: bất biến web độc lập (zmp-sdk / storage / interval)", () => {
  it("KHÔNG zmp-sdk / localStorage / sessionStorage / setInterval trong web/src", () => {
    const violations = [];
    for (const file of listFilesRecursively(SRC).filter((f) => f.endsWith(".js"))) {
      const content = stripComments(readFileSync(file, "utf8"));
      for (const token of BANNED_TOKENS) {
        if (content.includes(token)) violations.push(`${rel(file)} → ${token}`);
      }
    }
    assert.deepEqual(violations, [],
      "web không import zmp-sdk, không đụng storage (kể cả đọc — SEC-10), không setInterval");
  });

  it("web/index.html không tham chiếu zmp/manifest Zalo", () => {
    const content = readFileSync(join(WEB_ROOT, "index.html"), "utf8");
    assert.ok(!content.includes("zmp"), "index.html không được chứa zmp");
    assert.ok(!content.includes("app-config"), "index.html không mang manifest Zalo");
    assert.ok(content.includes("src/main.js"), "entry web phải là /src/main.js");
  });
});

describe("QA web: nút icon-only phải có aria-label (spot check regex)", () => {
  it("createButton / h('button') chứa createIcon phải có aria-label hoặc text", () => {
    const violations = [];
    for (const file of listFilesRecursively(SRC).filter((f) => f.endsWith(".js"))) {
      const source = readFileSync(file, "utf8");
      const calls = [
        ...extractCalls(source, "createButton"),
        ...extractHTagCalls(source, "button"),
      ];
      for (const call of calls) {
        if (!call.includes("createIcon(")) continue;
        const hasAriaLabel = /aria-label|ariaLabel/.test(call);
        const childrenText = stripChildCreateIcons(directChildren(call));
        const visibleText = childrenText.match(/["'`][^"'`]+["'`]/);
        if (!hasAriaLabel && !visibleText) {
          violations.push(`${rel(file)} → ${call.slice(0, 80)}…`);
        }
      }
    }
    assert.deepEqual(violations, [],
      `nút icon-only thiếu aria-label: ${violations.join("; ")}`);
  });
});

describe("QA web: cấm copy giả thành công", () => {
  it("cấm 'Đã gửi/Đã lưu nháp/Đã lưu/Đã chia sẻ' trong web/src", () => {
    const violations = [];
    for (const file of listFilesRecursively(SRC).filter((f) => f.endsWith(".js"))) {
      const source = readFileSync(file, "utf8");
      for (const banned of BANNED_COPY) {
        if (source.includes(banned)) violations.push(`${rel(file)} → "${banned}"`);
      }
    }
    assert.deepEqual(violations, [], `copy cấm: ${violations.join("; ")}`);
  });
});

describe("QA web: cấu hình deploy & env", () => {
  it(".env.example không gán biến SECRET/PASSWORD/TOKEN/PRIVATE", () => {
    const content = readFileSync(join(WEB_ROOT, ".env.example"), "utf8");
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

  it("render.yaml khai báo static service family-bridge-web build web/dist (ADR-4)", () => {
    const file = join(REPO_ROOT, "render.yaml");
    assert.ok(existsSync(file), "render.yaml phải tồn tại ở repo root");
    const content = readFileSync(file, "utf8");
    assert.ok(content.includes("name: family-bridge-web"), "thiếu service web");
    assert.match(content, /- type: web\s*\n\s*name: family-bridge-web\s*\n\s*runtime: static/,
      "service web phải là runtime: static");
    assert.ok(content.includes("buildCommand: cd web && npm ci && npm run build"),
      "buildCommand phải build web/ ra web/dist");
    assert.ok(content.includes("staticPublishPath: web/dist"),
      "staticPublishPath phải trỏ web/dist");
    assert.ok(content.includes("pullRequestPreviewsEnabled: false"));
    // VITE_API_BASE_URL sync:false — secret/giá trị thật không commit.
    const envBlock = content.slice(content.indexOf("family-bridge-web"));
    assert.ok(/- key: VITE_API_BASE_URL\s*\n\s*sync: false/.test(envBlock),
      "VITE_API_BASE_URL phải sync:false");
    assert.ok(content.includes("path: /assets/*"), "thiếu header /assets/*");
    assert.ok(content.includes("value: no-cache"), "index.html phải no-cache");
    assert.ok(content.includes("X-Content-Type-Options"), "thiếu header bảo mật cơ bản");
  });
});
