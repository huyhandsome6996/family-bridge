import { register } from "node:module";
await register(new URL("./asset-hook.mjs", import.meta.url));
import { test } from "node:test";
import assert from "node:assert/strict";
import { getLoginStartupPlan } from "../src/core/login-startup.js";

test("manual device test lands on login and never starts silent authentication", () => {
  for (const path of ["/", "/welcome", "/home", "/connect"]) {
    const plan = getLoginStartupPlan({ manualLoginTest: true, inZalo: true, path });
    assert.equal(plan.initialRoute, "/login");
    assert.equal(plan.silentLogin, false);
  }
});
test("manual test keeps immediate access to help", () => {
  assert.deepEqual(getLoginStartupPlan({ manualLoginTest: true, inZalo: true, path: "/help" }), { initialRoute: null, silentLogin: false });
});
test("normal Zalo builds still attempt silent login when needed", () => {
  assert.deepEqual(getLoginStartupPlan({ inZalo: true }), { initialRoute: null, silentLogin: true });
});
test("demo, browsers and existing sessions do not start silent login", () => {
  for (const state of [{ inZalo: false }, { inZalo: true, demoMode: true }, { inZalo: true, hasSession: true }]) {
    assert.equal(getLoginStartupPlan(state).silentLogin, false);
  }
});
