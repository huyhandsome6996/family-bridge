// SHIM giữ path cũ (task 18-a): file thật chuyển về
// packages/family_bridge_shared/src/policy.js — nguồn duy nhất.
// pages/login + pages/consent tiếp tục import path này.
export * from "../../../packages/family_bridge_shared/src/policy.js";
