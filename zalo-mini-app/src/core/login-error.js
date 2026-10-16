// SHIM giữ path cũ (task 18-a): file thật chuyển về
// packages/family_bridge_shared/src/login-error.js — nguồn duy nhất.
// pages/login + tests/login-error.test.mjs tiếp tục import path này.
export * from "../../../packages/family_bridge_shared/src/login-error.js";
