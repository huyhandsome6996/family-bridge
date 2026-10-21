import test from "node:test";
import assert from "node:assert/strict";
import { requireApiBaseUrl } from "../scripts/build-config.mjs";

test("production config rejects missing, blank, unsafe and malformed origins without echoing input", () => {
  for (const value of [undefined, "", "   ", "bad", "http://api.example.com",
    "https://user:canary-password@api.example.com", "https://api.example.com/api",
    "https://api.example.com/?key=canary", "https://api.example.com/#fragment",
    "https://localhost", "https://127.0.0.1", "https://[::1]", "x".repeat(2049)]) {
    assert.throws(() => requireApiBaseUrl(value), error =>
      error.message.includes("VITE_API_BASE_URL") && !error.message.includes("canary"));
  }
});

test("production config normalizes an explicit HTTPS origin", () => {
  assert.equal(requireApiBaseUrl(" https://family-bridge-backend.onrender.com/ "),
    "https://family-bridge-backend.onrender.com");
  assert.equal(requireApiBaseUrl("https://staging.example.com:8443"), "https://staging.example.com:8443");
});
