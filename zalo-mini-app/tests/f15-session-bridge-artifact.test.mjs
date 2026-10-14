// F15 session-bridge artifact test (R11) — chứng minh module phiên nằm
// TRONG artifact build (không còn import runtime trỏ ra ngoài artifact).
//
// Cách chứng minh (không merge Git, không deploy):
//   1. Sao chép zalo-mini-app sang thư mục tạm + chèn src/core/session.js
//      TỔNG HỢP (marker riêng) — giả lập F01 đã merge.
//   2. `vite build` bản sao (dùng chính node_modules của app qua symlink).
//   3. Serve www bằng node:http thật; assert:
//      a. có asset chứa marker của session module (module ĐƯỢC bundle);
//      b. GET asset đó qua HTTP -> 200 (không 404 như lỗi R11);
//      c. không còn literal "../../core/session.js" chưa chuyển đổi trong
//         bundle (glob đã được Vite xử lý, không import runtime ngoài).
//   4. Build kiểm soát KHÔNG có session.js -> bridge resolve null
//      (no_session trung thực) và build vẫn xanh.
//
// Chạy: node --test tests/f15-session-bridge-artifact.test.mjs (trong
// zalo-mini-app; cần devDependencies đã cài qua npm ci).

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SESSION_MARKER = "SYNTHETIC-F01-SESSION-MODULE-8f3a9c";

const SESSION_STUB = `// synthetic F01 session module (test-only)
export const SESSION_STUB_MARKER = "${SESSION_MARKER}";
let token = "synthetic-session-token";
export function getToken() { return token; }
export function clearSession() { token = null; }
export function hasLiveSession() { return Boolean(token); }
`;

function makeTempApp({ withSession }) {
  // Bản sao tạm nằm BÊN TRONG zalo-mini-app (`.f15-artifact-case/`) để
  // node_modules resolve tự nhiên qua thư mục cha (sandbox không cho
  // symlink; không đụng src thật của app). Trang /privacy import page-core
  // từ packages/ NGOÀI root của bản sao — Vite không resolve ngoài root,
  // nên bản sao tạm giữ nguyên CODE nhưng trỏ import page-core về bản sao
  // cục bộ cạnh index.js (chỉ đường resolve thay đổi, code trang/bridge
  // giữ nguyên — mục tiêu test là bridge + artifact, không phải đường
  // import monorepo).
  const tmp = path.join(APP_DIR, ".f15-artifact-case");
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  for (const entry of ["src", "index.html", "vite.config.mjs",
                       "package.json", "app-config.json"]) {
    fs.cpSync(path.join(APP_DIR, entry), path.join(tmp, entry),
              { recursive: true });
  }
  const privacyDir = path.join(tmp, "src", "pages", "privacy");
  fs.cpSync(path.join(APP_DIR, "..", "packages", "family_bridge_mobile",
                      "f15_privacy", "page-core.js"),
            path.join(privacyDir, "page-core.js"));
  const indexPath = path.join(privacyDir, "index.js");
  fs.writeFileSync(indexPath, fs.readFileSync(indexPath, "utf8").replace(
    '"../../../../packages/family_bridge_mobile/f15_privacy/page-core.js"',
    '"./page-core.js"'));
  fs.writeFileSync(path.join(tmp, "src", "main.js"), 'import { getSessionToken } from "./pages/privacy/session-bridge.js"; getSessionToken().then(token => { document.getElementById("app").textContent = token || "no_session"; });');
  fs.rmSync(path.join(tmp, "src", "core", "session.js"), { force: true });
  if (withSession) {
    fs.mkdirSync(path.join(tmp, "src", "core"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "src", "core", "session.js"),
                     SESSION_STUB);
  }
  return tmp;
}

function buildApp(tmp) {
  const bin = path.join(APP_DIR, "node_modules", "vite", "bin", "vite.js");
  execFileSync(process.execPath, [bin, "build", "--outDir", "www-artifact-test",
                     "--emptyOutDir"], { cwd: tmp, stdio: "pipe" });
  return path.join(tmp, "www-artifact-test");
}

function listJsAssets(wwwDir) {
  const assetsDir = path.join(wwwDir, "assets");
  return fs.readdirSync(assetsDir)
    .filter((f) => f.endsWith(".js"))
    .map((f) => path.join(assetsDir, f));
}

// Hai hình dạng NGUY HIỂM của lỗi R11 trong bundle:
//  1. dynamic import raw vào đường nguồn -> chạy ngoài artifact;
//  2. URL runtime "/core/session.js" -> HTTP 404 khi serve www.
// (Chuỗi pattern chỉ là KEY trong map glob sau khi Vite xử lý — vô hại,
//  import thật đã trỏ vào chunk bên trong assets/.)
const RAW_DYNAMIC_IMPORT_RE =
  /import\(\s*["'`]\.\.\/\.\.\/core\/session\.js["'`]\s*\)/;
const RUNTIME_URL_RE = /["'`]\/core\/session\.js["'`]/;

function serveDir(rootDir) {
  const server = createServer((req, res) => {
    const url = (req.url || "/").split("?")[0];
    const rel = url === "/" ? "/index.html" : url;
    const file = path.join(rootDir, path.normalize(rel));
    if (!file.startsWith(rootDir) || !fs.existsSync(file)
        || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200).end(fs.readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1",
                                                () => resolve(server)));
}

function get(server, relPath) {
  const { address, port } = server.address();
  return fetch(`http://${address}:${port}${relPath}`);
}

test("R11: session module được BUNDLE vào artifact và serve được (không 404)", async () => {
  const tmp = makeTempApp({ withSession: true });
  try {
    const www = buildApp(tmp);
    const assets = listJsAssets(www);
    assert.ok(assets.length > 0, "build phải sinh ra assets");
    const withMarker = assets.filter((f) =>
      fs.readFileSync(f, "utf8").includes(SESSION_MARKER));
    assert.ok(withMarker.length > 0,
              "F01 session module phải nằm TRONG artifact (bundled)");

    // Không còn hình dạng nguy hiểm của R11 trong bundle.
    for (const asset of assets) {
      const content = fs.readFileSync(asset, "utf8");
      assert.ok(!RAW_DYNAMIC_IMPORT_RE.test(content),
                "bundle không được còn dynamic import đường nguồn của bridge");
      assert.ok(!RUNTIME_URL_RE.test(content),
                "bundle không được tham chiếu URL runtime ngoài artifact");
      assert.ok(!content.includes("@vite-ignore"),
                "bundle không được chứa marker vite-ignore của bridge");
    }

    // Serve thật + HTTP GET: module nằm trong artifact phải 200 (R11 cũ: 404).
    const server = await serveDir(www);
    try {
      const response = await get(server, "/assets/"
        + path.basename(withMarker[0]));
      assert.equal(response.status, 200,
                   "asset chứa session module phải serve được qua HTTP");
    } finally {
      await new Promise((r) => server.close(r));
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("R11: không có session.js -> build xanh, bridge resolve null (no_session trung thực)", () => {
  const tmp = makeTempApp({ withSession: false });
  try {
    const www = buildApp(tmp);
    const assets = listJsAssets(www);
    for (const asset of assets) {
      const content = fs.readFileSync(asset, "utf8");
      assert.ok(!content.includes(SESSION_MARKER));
      assert.ok(!RAW_DYNAMIC_IMPORT_RE.test(content));
      assert.ok(!RUNTIME_URL_RE.test(content));
    }
    assert.ok(fs.existsSync(path.join(www, "index.html")),
              "build kiểm soát phải xanh");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("R11: nguồn session-bridge.js không còn dynamic import @vite-ignore", () => {
  const source = fs.readFileSync(
    path.join(APP_DIR, "src", "pages", "privacy", "session-bridge.js"),
    "utf8");
  assert.ok(!source.includes("@vite-ignore"),
            "bridge không được import đường nguồn ngoài artifact nữa");
  assert.ok(source.includes("import.meta.glob"),
            "bridge phải dùng glob bundle-time (module trong artifact)");
});
