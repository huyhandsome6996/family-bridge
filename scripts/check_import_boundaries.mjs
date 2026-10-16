#!/usr/bin/env node
/**
 * scripts/check_import_boundaries.mjs — W1-c (web-miniapp-separation, ADR-4).
 *
 * Kiểm chứng biên giới import TRANSITIVE giữa hai frontend độc lập:
 *   - entry web:  web/index.html           (script type="module" src=…)
 *   - entry mini: zalo-mini-app/index.html (script src=…)
 *
 * Parser thuần node (KHÔNG dependency), hỗ trợ:
 *   - `import … from '…'`, `export … from '…'` (barrel re-export được follow),
 *   - `import('…')` động (BẮT BUỘC theo — router mini có ~21+ import()),
 *   - `import '…'` (side-effect, vd CSS),
 *   - trong HTML: <script src=…> + <link rel="stylesheet" href=…>.
 * Resolve: './'/'../' relative; extensionless thử .js/.mjs/index.js/index.mjs;
 * CSS/asset (.css/.png/.ttf/…) = nút lá; bare specifier = nút lá `bare:<tên>`
 * (KHÔNG đi vào node_modules). Comment khối và comment dòng được STRIP
 * (string-aware) trước khi quét token.
 *
 * Assertions:
 *   (a) closure web không chứa file zalo-mini-app/**
 *   (b) closure mini không chứa file web/**
 *   (c) TOÀN BỘ packages/family_bridge_shared/src/** thuần: không `zmp-sdk`,
 *       `window.`, `document.`, `localStorage`, `sessionStorage` (sau strip)
 *   (d) TOÀN BỘ web/src/** + web/index.html: không `zmp-sdk`, không
 *       `localStorage.`/`sessionStorage.` (cấm cả đọc — đơn giản hoá)
 *   (e) closure web không chứa bare import `zmp-sdk`
 *
 * Chạy được NGAY khi web/ (hoặc shared) chưa tồn tại: in cảnh báo và bỏ qua
 * assert tương ứng — phục vụ wave song song (W1-a tạo shared, W1-b tạo web).
 *
 * Usage:
 *   node scripts/check_import_boundaries.mjs [--json <report.json>]
 * Exit code: 0 = sạch, 1 = có vi phạm, 2 = lỗi CLI.
 * Lưu ý parser: regex literal chứa `//`/`/*` bên trong có thể gây strip sai
 * (không xảy ra trong codebase hiện tại — đã grep kiểm chứng).
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, normalize, relative, resolve, sep } from "node:path";
import process from "node:process";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const WEB_DIR = join(REPO_ROOT, "web");
const MINI_DIR = join(REPO_ROOT, "zalo-mini-app");
const SHARED_SRC = join(REPO_ROOT, "packages", "family_bridge_shared", "src");
const WEB_ENTRY = join(WEB_DIR, "index.html");
const MINI_ENTRY = join(MINI_DIR, "index.html");
const MINI_PREFIX = "zalo-mini-app/";
const WEB_PREFIX = "web/";
const SHARED_PREFIX = "packages/family_bridge_shared/";

const JS_EXTS = new Set([".js", ".mjs"]);
const ASSET_EXTS = new Set([
  ".css", ".scss", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".avif",
  ".ico", ".bmp", ".woff", ".woff2", ".ttf", ".otf", ".eot", ".mp3", ".mp4",
  ".wav", ".ogg", ".json", ".webmanifest", ".map", ".txt", ".csv",
]);
const TEXT_EXTS = new Set([
  ".js", ".mjs", ".jsx", ".ts", ".tsx", ".json", ".css", ".html", ".htm",
  ".svg", ".txt",
]);

// (c) shared thuần: cấm SDK + mọi chạm DOM/storage (kể cả đọc).
const SHARED_BANNED_TOKENS = [
  "zmp-sdk", "window.", "document.", "localStorage", "sessionStorage",
];
// (d) web thuần: cấm SDK + storage (cấm hẳn cả đọc — đơn giản hoá).
const WEB_BANNED_TOKENS = ["zmp-sdk", "localStorage.", "sessionStorage."];

// ---------------------------------------------------------------- CLI ------
function parseArgs(argv) {
  const parsed = { json: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        console.error("Lỗi: --json cần đường dẫn file report.");
        process.exit(2);
      }
      parsed.json = value;
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: node scripts/check_import_boundaries.mjs [--json <report.json>]",
      );
      process.exit(0);
    } else {
      console.error(`Lỗi: tham số không hỗ trợ: ${arg}`);
      process.exit(2);
    }
  }
  return parsed;
}

// ------------------------------------------------- strip comment JS -------
/**
 * Strip /* *​/ và // (string-aware: không strip bên trong '...', "...", `...`,
 * xử lý escape và ${…} lồng nhau). Giữ nội dung string nguyên vẹn vì token
 * scan (c)/(d) phải nhìn thấy cả chuỗi (chỉ comment được loại).
 */
function stripJsComments(source) {
  let out = "";
  let i = 0;
  const n = source.length;
  const interpStack = []; // depth ngoặc {} của các ${…} đang mở (template)
  let state = "code"; // code | single | double | template
  while (i < n) {
    const ch = source[i];
    const next = i + 1 < n ? source[i + 1] : "";
    if (state === "code") {
      if (ch === "/" && next === "/") {
        while (i < n && source[i] !== "\n") i += 1;
        out += " ";
        continue;
      }
      if (ch === "/" && next === "*") {
        i += 2;
        while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
          if (source[i] === "\n") out += "\n";
          i += 1;
        }
        i += 2;
        out += " ";
        continue;
      }
      if (ch === "'") { state = "single"; out += ch; i += 1; continue; }
      if (ch === '"') { state = "double"; out += ch; i += 1; continue; }
      if (ch === "`") { state = "template"; out += ch; i += 1; continue; }
      if (ch === "{" && interpStack.length > 0) {
        interpStack[interpStack.length - 1] += 1;
        out += ch; i += 1; continue;
      }
      if (ch === "}" && interpStack.length > 0) {
        interpStack[interpStack.length - 1] -= 1;
        if (interpStack[interpStack.length - 1] === 0) {
          interpStack.pop();
          state = "template";
        }
        out += ch; i += 1; continue;
      }
      out += ch; i += 1; continue;
    }
    if (state === "single" || state === "double") {
      const quote = state === "single" ? "'" : '"';
      if (ch === "\\") { out += ch + next; i += 2; continue; }
      if (ch === quote || ch === "\n") state = "code";
      out += ch; i += 1; continue;
    }
    // state === "template"
    if (ch === "\\") { out += ch + next; i += 2; continue; }
    if (ch === "`") { state = "code"; out += ch; i += 1; continue; }
    if (ch === "$" && next === "{") {
      interpStack.push(1);
      state = "code";
      out += "${";
      i += 2;
      continue;
    }
    out += ch; i += 1;
  }
  return out;
}

// ------------------------------------------------- extract import specs ---
const RE_DYNAMIC = /\bimport\s*\(\s*["']([^"'\n]+)["']/g;
const RE_STATIC = /\bimport\s*(?:[\w$*{},\s]+?\s*from\s*)?["']([^"'\n]+)["']/g;
const RE_EXPORT = /\bexport\s+(?:type\s+)?(?:[\w$*{},\s]+?\s*)?from\s*["']([^"'\n]+)["']/g;

function extractSpecsFromJs(stripped) {
  const specs = [];
  let m;
  while ((m = RE_DYNAMIC.exec(stripped))) specs.push({ spec: m[1], via: "dynamic-import" });
  while ((m = RE_STATIC.exec(stripped))) specs.push({ spec: m[1], via: "static-import" });
  while ((m = RE_EXPORT.exec(stripped))) specs.push({ spec: m[1], via: "export-from" });
  return specs;
}

function extractRefsFromHtml(html) {
  const noComments = html.replace(/<!--[\s\S]*?-->/g, " ");
  const refs = [];
  let m;
  const reScript = /<script\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  const reLink = /<link\b[^>]*?>/gi;
  while ((m = reScript.exec(noComments))) {
    refs.push({ spec: m[1], via: "html-script" });
  }
  while ((m = reLink.exec(noComments))) {
    if (!/\brel\s*=\s*["']stylesheet["']/i.test(m[0])) continue;
    const href = m[0].match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (href) refs.push({ spec: href[1], via: "html-css" });
  }
  return refs;
}

// ------------------------------------------------- resolve specifier ------
function toKey(absPath) {
  return relative(REPO_ROOT, absPath).split(sep).join("/");
}

function existsFile(absPath) {
  return existsSync(absPath) && statSync(absPath).isFile();
}

function resolveSpec(spec, fromDir, appRoot) {
  if (!spec.startsWith("./") && !spec.startsWith("../") && !spec.startsWith("/")) {
    return { kind: "bare", key: `bare:${spec}` };
  }
  const target = normalize(
    spec.startsWith("/") ? join(appRoot, spec.slice(1)) : join(fromDir, spec),
  );
  const ext = extname(target).toLowerCase();
  if (JS_EXTS.has(ext)) {
    return existsFile(target)
      ? { kind: "file", key: toKey(target) }
      : { kind: "unresolved", key: toKey(target) };
  }
  if (ASSET_EXTS.has(ext)) {
    return { kind: "asset", key: toKey(target) };
  }
  for (const cand of [
    `${target}.js`, `${target}.mjs`,
    join(target, "index.js"), join(target, "index.mjs"),
  ]) {
    if (existsFile(cand)) return { kind: "file", key: toKey(cand) };
  }
  return { kind: "unresolved", key: toKey(target) };
}

// ------------------------------------------------- closure (BFS) ----------
/**
 * Xây closure transitive từ entry HTML. Trả { present, nodes, edges,
 * unresolved } với nodes: Map key → {key, kind: html|file|asset|bare, deps}.
 */
function buildClosure({ entryPath, appRoot, warnings }) {
  const nodes = new Map();
  const edges = [];
  const unresolved = [];
  if (!existsSync(entryPath)) {
    return { present: false, nodes, edges, unresolved };
  }

  const entryKey = toKey(entryPath);
  nodes.set(entryKey, { key: entryKey, kind: "html", deps: new Set() });
  const queue = [entryKey];

  while (queue.length > 0) {
    const key = queue.shift();
    const node = nodes.get(key);
    if (node.expanded) continue;
    node.expanded = true;
    const abs = join(REPO_ROOT, key);

    let refs = [];
    if (node.kind === "html") {
      try {
        refs = extractRefsFromHtml(readFileSync(abs, "utf8"));
      } catch (err) {
        warnings.push(`Không đọc được HTML ${key}: ${err.message}`);
        continue;
      }
    } else if (node.kind === "file") {
      let stripped;
      try {
        stripped = stripJsComments(readFileSync(abs, "utf8"));
      } catch (err) {
        warnings.push(`Không đọc được JS ${key}: ${err.message}`);
        continue;
      }
      refs = extractSpecsFromJs(stripped);
    } else {
      continue; // asset / bare = nút lá
    }

    const fromDir = dirname(abs);
    for (const { spec, via } of refs) {
      const resolved = resolveSpec(spec, fromDir, appRoot);
      if (resolved.kind === "unresolved") {
        unresolved.push({ from: key, spec, via });
        continue;
      }
      if (!nodes.has(resolved.key)) {
        nodes.set(resolved.key, { key: resolved.key, kind: resolved.kind, deps: new Set() });
        if (resolved.kind === "file" || resolved.kind === "html") queue.push(resolved.key);
      }
      node.deps.add(resolved.key);
      edges.push({ from: key, to: resolved.key, spec, via });
    }
  }
  return { present: true, nodes, edges, unresolved };
}

function listFilesRecursively(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) listFilesRecursively(full, out);
    else out.push(full);
  }
  return out;
}

function scanTokens(files, bannedTokens) {
  const hits = [];
  for (const abs of files) {
    if (!TEXT_EXTS.has(extname(abs).toLowerCase())) continue;
    let stripped;
    try {
      stripped = stripJsComments(readFileSync(abs, "utf8"));
    } catch {
      continue;
    }
    for (const token of bannedTokens) {
      if (stripped.includes(token)) hits.push({ file: toKey(abs), token });
    }
  }
  return hits;
}

function zoneStats(closure) {
  if (!closure.present) return null;
  const counts = { html: 0, file: 0, asset: 0, bare: 0 };
  const bareKeys = [];
  for (const node of closure.nodes.values()) {
    counts[node.kind] += 1;
    if (node.kind === "bare") bareKeys.push(node.key);
  }
  return {
    nodes: closure.nodes.size,
    ...counts,
    unresolved: closure.unresolved.length,
    bareKeys,
  };
}

// ------------------------------------------------- main --------------------
const cli = parseArgs(process.argv.slice(2));
const warnings = [];
const violations = [];
const checks = {};

const webClosure = buildClosure({ entryPath: WEB_ENTRY, appRoot: WEB_DIR, warnings });
const miniClosure = buildClosure({ entryPath: MINI_ENTRY, appRoot: MINI_DIR, warnings });
const webStats = zoneStats(webClosure);
const miniStats = zoneStats(miniClosure);

const webMissing = !webClosure.present;
const sharedMissing = !existsSync(SHARED_SRC);
if (webMissing) {
  warnings.push("web/ chưa có, chỉ kiểm tra mini↔shared — bỏ qua assert (a)/(d)/(e)");
}
if (sharedMissing) {
  warnings.push("packages/family_bridge_shared/src chưa có — bỏ qua assert (c)");
}

// (b) mini closure không chứa web/** — luôn chạy.
{
  const hits = miniClosure.present
    ? [...miniClosure.nodes.keys()].filter((k) => k === WEB_PREFIX.slice(0, -1) || k.startsWith(WEB_PREFIX))
    : [];
  checks.b = { pass: hits.length === 0, hits };
  for (const key of hits) {
    violations.push({ check: "b", file: key, detail: "file web/** bị closure mini import" });
  }
}

// (c) shared thuần — chạy khi shared tồn tại (kể cả khi web chưa có).
let sharedFiles = [];
if (!sharedMissing) {
  sharedFiles = listFilesRecursively(SHARED_SRC);
  const hits = scanTokens(sharedFiles, SHARED_BANNED_TOKENS);
  checks.c = { pass: hits.length === 0, hits };
  for (const hit of hits) {
    violations.push({ check: "c", file: hit.file, detail: `token cấm "${hit.token}" trong shared` });
  }
}

// (a)/(d)/(e) chỉ khi web tồn tại đầy đủ.
if (!webMissing) {
  const webClosureKeys = [...webClosure.nodes.keys()];
  const hitsA = webClosureKeys.filter((k) => k.startsWith(MINI_PREFIX));
  checks.a = { pass: hitsA.length === 0, hits: hitsA };
  for (const key of hitsA) {
    violations.push({ check: "a", file: key, detail: "file zalo-mini-app/** bị closure web import" });
  }

  const webScanFiles = [...listFilesRecursively(join(WEB_DIR, "src")), WEB_ENTRY];
  const hitsD = scanTokens(webScanFiles, WEB_BANNED_TOKENS);
  checks.d = { pass: hitsD.length === 0, hits: hitsD };
  for (const hit of hitsD) {
    violations.push({ check: "d", file: hit.file, detail: `token cấm "${hit.token}" trong web` });
  }

  const hitsE = webStats.bareKeys.filter((k) => k === "bare:zmp-sdk");
  checks.e = { pass: hitsE.length === 0, hits: hitsE };
  for (const key of hitsE) {
    violations.push({ check: "e", file: key, detail: "web closure import bare zmp-sdk" });
  }
}

// ------------------------------------------------- stdout report ----------
const LINE = "─".repeat(74);
const sharedReachMini = miniClosure.present
  ? [...miniClosure.nodes.keys()].filter((k) => k.startsWith(SHARED_PREFIX)).length
  : 0;
const sharedReachWeb = webClosure.present
  ? [...webClosure.nodes.keys()].filter((k) => k.startsWith(SHARED_PREFIX)).length
  : 0;

function pad(label, cols) {
  return ` ${label.padEnd(38)}${cols.map((c) => String(c).padStart(6)).join("")}`;
}

console.log("═".repeat(74));
console.log(" Family Bridge — check import boundaries (ADR-4, W1-c)");
console.log(` Repo: ${REPO_ROOT}`);
console.log("═".repeat(74));
for (const w of warnings) console.log(` ⚠ ${w}`);

console.log("");
console.log(`${" Vùng".padEnd(44)}${["nodes", "js/ht", "asset", "bare", "unres"].map((h) => h.padStart(6)).join("")}`);
console.log(` ${LINE.slice(0, 73)}`);
if (webClosure.present) {
  console.log(pad("web closure (web/)", [webStats.nodes, webStats.file + webStats.html, webStats.asset, webStats.bare, webStats.unresolved]));
} else {
  console.log(pad("web closure (web/)", ["skip", "—", "—", "—", "—"]));
}
if (miniClosure.present) {
  console.log(pad("mini closure (zalo-mini-app/)", [miniStats.nodes, miniStats.file + miniStats.html, miniStats.asset, miniStats.bare, miniStats.unresolved]));
} else {
  console.log(pad("mini closure (zalo-mini-app/)", ["MISSING", "—", "—", "—", "—"]));
}
console.log(pad("shared src (quét token thuần)", [sharedMissing ? "skip" : sharedFiles.length, "—", "—", "—", "—"]));
console.log(pad("  ↳ shared reachable từ mini", [sharedReachMini, "—", "—", "—", "—"]));
console.log(pad("  ↳ shared reachable từ web", [sharedReachWeb, "—", "—", "—", "—"]));

function fmtCheck(letter, desc, check, skipReason) {
  if (!check) return `   (${letter}) ${desc.padEnd(48)} SKIP (${skipReason})`;
  return `   (${letter}) ${desc.padEnd(48)} ${check.pass ? "PASS" : `FAIL ×${check.hits.length}`}`;
}
console.log("");
console.log(" Assertions:");
console.log(fmtCheck("a", "web closure không chứa zalo-mini-app/**", checks.a, webMissing ? "web chưa có" : ""));
console.log(fmtCheck("b", "mini closure không chứa web/**", checks.b, miniClosure.present ? "" : "mini chưa có"));
console.log(fmtCheck("c", "shared thuần (không DOM/SDK/storage)", checks.c, sharedMissing ? "shared chưa có" : ""));
console.log(fmtCheck("d", "web không zmp-sdk/localStorage./sessionStorage.", checks.d, webMissing ? "web chưa có" : ""));
console.log(fmtCheck("e", "web closure không bare import zmp-sdk", checks.e, webMissing ? "web chưa có" : ""));

if (violations.length > 0) {
  console.log("");
  const shown = violations.slice(0, 20);
  console.log(` ❌ VI PHẠM: ${violations.length} (hiển thị tối đa 20)`);
  for (const v of shown) console.log(`   [${v.check}] ${v.file} → ${v.detail}`);
  if (violations.length > shown.length) {
    console.log(`   … và ${violations.length - shown.length} vi phạm nữa (xem --json)`);
  }
} else {
  console.log("");
  console.log(" ✅ Không có vi phạm biên giới import.");
}

const unresolvedAll = [...webClosure.unresolved, ...miniClosure.unresolved];
if (unresolvedAll.length > 0) {
  console.log(` ℹ Import không resolve được: ${unresolvedAll.length} (cảnh báo, không fail)`);
  for (const u of unresolvedAll.slice(0, 10)) console.log(`   ${u.from} → "${u.spec}"`);
}

console.log("═".repeat(74));
console.log(` KẾT LUẬN: ${violations.length === 0 ? "SẠCH" : "THẤT BẠI"} — exit ${violations.length === 0 ? 0 : 1}`);
console.log("═".repeat(74));

// ------------------------------------------------- JSON report ------------
if (cli.json) {
  const closureJson = (closure) => {
    if (!closure.present) return null;
    const stats = zoneStats(closure);
    return {
      entry: toKey(closure === webClosure ? WEB_ENTRY : MINI_ENTRY),
      nodes: closure.nodes.size,
      kinds: { html: stats.html, js: stats.file, asset: stats.asset, bare: stats.bare },
      jsFiles: [...closure.nodes.values()].filter((nd) => nd.kind === "file").map((nd) => nd.key),
      assets: [...closure.nodes.values()].filter((nd) => nd.kind === "asset").map((nd) => nd.key),
      bare: stats.bareKeys,
      edges: closure.edges,
      unresolved: closure.unresolved,
    };
  };
  const report = {
    tool: "scripts/check_import_boundaries.mjs",
    version: 1,
    generatedAt: new Date().toISOString(),
    repoRoot: REPO_ROOT,
    warnings,
    entries: {
      web: { entry: "web/index.html", present: webClosure.present },
      mini: { entry: "zalo-mini-app/index.html", present: miniClosure.present },
    },
    closures: { web: closureJson(webClosure), mini: closureJson(miniClosure) },
    shared: {
      dir: "packages/family_bridge_shared/src",
      present: !sharedMissing,
      scannedFiles: sharedFiles.length,
      bannedTokens: SHARED_BANNED_TOKENS,
      reachableFromMini: sharedReachMini,
      reachableFromWeb: sharedReachWeb,
    },
    webBannedTokens: WEB_BANNED_TOKENS,
    checks: Object.fromEntries(
      Object.entries(checks).map(([k, v]) => [k, { pass: v.pass, hits: v.hits }]),
    ),
    unresolvedEdges: unresolvedAll,
    violations,
    summary: {
      ok: violations.length === 0,
      violationCount: violations.length,
      checked: Object.keys(checks),
      skipped: [
        webMissing ? "a" : null, !miniClosure.present ? "b" : null,
        sharedMissing ? "c" : null, webMissing ? "d" : null, webMissing ? "e" : null,
      ].filter(Boolean),
    },
  };
  try {
    mkdirSync(dirname(cli.json), { recursive: true });
    writeFileSync(cli.json, `${JSON.stringify(report, null, 2)}\n`);
    console.log(` 📄 JSON report: ${cli.json}`);
  } catch (err) {
    console.error(`Không ghi được JSON report: ${err.message}`);
    process.exit(2);
  }
}

process.exit(violations.length === 0 ? 0 : 1);
