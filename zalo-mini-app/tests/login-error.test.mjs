import { test } from "node:test";
import assert from "node:assert/strict";
import { loginErrorMessage } from "../src/core/login-error.js";

test("provider numeric code survives UI while free-text secrets are hidden", () => {
  const text = loginErrorMessage({ status: 401, details: { reason: "provider_rejected [code -201: token=SYNTHETIC_SECRET_MARKER <script>alert(1)</script>]" } });
  assert.match(text, /Zalo -201/);
  assert.match(text, /HTTP 401/);
  assert.doesNotMatch(text, /SYNTHETIC_SECRET_MARKER|<script>/);
});
test("expired token and wrong application have distinct diagnoses", () => {
  const expired = loginErrorMessage({ status: 401, details: { reason: "token_invalid_or_expired" } });
  const wrongApp = loginErrorMessage({ status: 400, details: { reason: "wrong_app_id" } });
  assert.match(expired, /hết hạn/);
  assert.match(wrongApp, /không khớp ứng dụng/);
  assert.notEqual(expired, wrongApp);
});
test("only bounded numeric structured provider codes are displayed", () => {
  const valid = loginErrorMessage({ status: 401, details: { reason: "provider_rejected", provider_code: -201 } });
  assert.match(valid, /Zalo -201/);
  const invalid = loginErrorMessage({ status: 401, details: { reason: "SYNTHETIC_SECRET_MARKER", provider_code: "SECRET_MARKER" } });
  assert.doesNotMatch(invalid, /SECRET_MARKER/);
});
