// tests/purity.test.mjs — kiểm chứng purity contract của package (README.md):
// src/** KHÔNG chứa tham chiếu DOM/SDK/storage trong CODE (comment được bỏ qua
// trước khi quét). Package này phải import được trong node thuần, không DOM.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else if (/\.(mjs|js)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Xóa comment dòng // và khối comment (kể cả dấu // trong chuỗi đơn giản) trước quét. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

describe("shared purity contract (ADR-1)", () => {
  const files = listFiles(join(PKG, "src"));

  it("src chỉ chứa file ESM .mjs/.js (không build artifact)", () => {
    assert.ok(files.length >= 10, "đủ file di chuyển + file mới");
    for (const file of files) {
      assert.ok(!file.includes(`${sep}dist${sep}`) && !file.includes(`${sep}build${sep}`));
    }
  });

  it("src/** KHÔNG import zmp-sdk và KHÔNG đụng window/document/storage trong code", () => {
    const banned = [
      /\bzmp-sdk\b/,
      /\bwindow\b/,
      /\bdocument\b/,
      /\blocalStorage\b/,
      /\bsessionStorage\b/,
      /\bnavigator\b/,
      /\bimport\.meta\.env\b/,
    ];
    const violations = [];
    for (const file of files) {
      const code = stripComments(readFileSync(file, "utf8"));
      for (const regex of banned) {
        if (regex.test(code)) {
          violations.push(`${file.slice(PKG.length + 1)} → ${regex}`);
        }
      }
    }
    assert.deepEqual(violations, [], `purity violation: ${violations.join("; ")}`);
  });

  it("package import được trong node thuần (không cần DOM/happy-dom)", async () => {
    const barrel = await import("../src/index.js");
    assert.equal(typeof barrel.createApiClient, "function");
    assert.equal(typeof barrel.createHttpEndpoints, "function");
    assert.equal(typeof barrel.createMockAdapter, "function");
    assert.equal(barrel.ADAPTER_METHODS.length, 99);
    assert.equal(typeof barrel.errorKind, "function");
    assert.equal(typeof barrel.failureFor, "function");
    assert.equal(typeof barrel.setSession, "function");
    assert.equal(typeof barrel.loginErrorMessage, "function");
    assert.equal(typeof barrel.fixtures, "object");
  });
});
