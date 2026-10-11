// tests/qa-secrets-privacy.test.mjs — QA Task 4: quét secret + riêng tư dữ liệu.
//  1) Toàn bộ src/** và tests/** (kèm file cấu hình gốc) KHÔNG chứa mẫu
//     secret (ghp_…, PAT, *_SECRET, private key…). Mẫu được GHÉP CHUỖI để
//     file test này không tự khớp chính nó.
//  2) Không có file .env thật trong repo mini app (chỉ .env.example).
//  3) src KHÔNG có "localStorage.setItem"; sessionStorage chỉ dùng trong
//     src/app/store.js và CHỈ persist vai trò xem trước (không token/PII).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SRC = join(ROOT, "src");
const TESTS = join(ROOT, "tests");

// ---- ghép chuỗi để tránh self-match khi scanner đọc chính file test này ----
// (cả TÊN BIẾN và COMMENT cũng phải tránh chứa literal mẫu — hằng số mang
// đúng chuỗi mẫu trong tên sẽ tự khớp regex của chính nó)
const GHP = "ghp" + "_";
const GITHUB_PAT = "github" + "_pat_";
const SECRET_VAR_NAMES = ["API", "APP"].map((prefix) => prefix + "_SECRET");
const PRIVATE_KEY = "private" + "-key";
const LOCALSTORAGE_SET = "localStorage" + ".setItem";

const SECRET_PATTERNS = [
  { name: "GitHub PAT (ghp_)", regex: new RegExp(GHP + "[A-Za-z0-9]{20,}") },
  { name: "GitHub fine-grained PAT", regex: new RegExp(GITHUB_PAT + "[A-Za-z0-9_]{20,}") },
  { name: "Slack token", regex: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: "Google API key", regex: /AIza[0-9A-Za-z_-]{30,}/ },
  { name: "AWS access key", regex: /AKIA[0-9A-Z]{16}/ },
  { name: "API/APP secret key", regex: new RegExp(SECRET_VAR_NAMES.join("|")) },
  { name: "Private key material", regex: new RegExp(PRIVATE_KEY, "i") },
  { name: "PEM block", regex: /BEGIN [A-Z ]*PRIVATE KEY/ },
];

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
  return filePath.slice(ROOT.length + 1).split(sep).join("/");
}

describe("QA: secrets scan (SEC-19)", () => {
  const scanned = [
    ...listFilesRecursively(SRC),
    ...listFilesRecursively(TESTS),
    join(ROOT, "package.json"),
    join(ROOT, "app-config.json"),
    join(ROOT, "vite.config.mjs"),
    join(ROOT, "index.html"),
    join(ROOT, ".env.example"),
    join(ROOT, "scripts", "verify-build.mjs"),
  ].filter((file) => existsSync(file));

  it("không file nào chứa mẫu secret", () => {
    const violations = [];
    for (const file of scanned) {
      const content = readFileSync(file, "utf8");
      for (const { name, regex } of SECRET_PATTERNS) {
        if (regex.test(content)) violations.push(`${rel(file)} → ${name}`);
      }
    }
    assert.deepEqual(violations, [], `phát hiện secret: ${violations.join("; ")}`);
  });

  it("không có file .env thật trong repo (chỉ .env.example)", () => {
    assert.equal(existsSync(join(ROOT, ".env")), false, "không được commit .env thật");
    assert.ok(existsSync(join(ROOT, ".env.example")), ".env.example phải tồn tại làm mẫu");
  });

  it(".env.example không chứa dòng gán SECRET/PASSWORD/token riêng tư", () => {
    const content = readFileSync(join(ROOT, ".env.example"), "utf8");
    // Chỉ soi DÒNG GÁN biến (KEY=...), bỏ qua lời khuyên trong comment.
    const assignments = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    assert.deepEqual(
      assignments.filter((line) => /SECRET|PASSWORD|TOKEN|PRIVATE/i.test(line)),
      [],
      ".env.example không được gán biến secret",
    );
    for (const { name, regex } of SECRET_PATTERNS) {
      assert.ok(!regex.test(content), `.env.example khớp mẫu: ${name}`);
    }
  });
});

describe("QA: riêng tư dữ liệu trình duyệt (SEC-10)", () => {
  const srcFiles = listFilesRecursively(SRC);

  it("src/** không có 'localStorage.setItem'", () => {
    const hits = srcFiles.filter((file) => readFileSync(file, "utf8").includes(LOCALSTORAGE_SET));
    assert.deepEqual(hits.map(rel), [], "localStorage.setItem bị cấm trong src");
  });

  it("sessionStorage chỉ được dùng trong src/app/store.js", () => {
    const hits = srcFiles.filter((file) => readFileSync(file, "utf8").includes("sessionStorage"));
    assert.deepEqual(
      hits.map(rel),
      ["src/app/store.js"],
      "sessionStorage chỉ dành cho lựa chọn vai trò xem trước",
    );
  });

  it("store.js chỉ persist { role } — không token/PII (kiểm tra hành vi thật)", async () => {
    const { Window } = await import("happy-dom");
    const domWindow = new Window({ url: "https://localhost/" });
    globalThis.window = domWindow;
    globalThis.document = domWindow.document;

    const { initStore, setRole, resetState } = await import("../src/app/store.js");
    initStore({ demoMode: true });
    resetState();
    setRole("student");

    const raw = domWindow.sessionStorage.getItem("fb.ui.session.v1");
    assert.ok(raw, "store phải persist lựa chọn vai trò");
    const parsed = JSON.parse(raw);
    assert.deepEqual(
      Object.keys(parsed).sort(),
      ["role"],
      `sessionStorage chỉ được chứa 'role', thấy: ${Object.keys(parsed).join(", ")}`,
    );
    assert.equal(parsed.role, "student");
    assert.ok(!/token|auth|phone|name|email/i.test(raw), "payload không được chứa trường riêng tư");

    resetState();
    const after = JSON.parse(domWindow.sessionStorage.getItem("fb.ui.session.v1"));
    assert.equal(after.role, null, "resetState phải xoá vai trò");

    // Không có key nào khác của app trong sessionStorage
    const keys = [];
    for (let i = 0; i < domWindow.sessionStorage.length; i += 1) {
      keys.push(domWindow.sessionStorage.key(i));
    }
    assert.deepEqual(keys, ["fb.ui.session.v1"]);
  });
});
