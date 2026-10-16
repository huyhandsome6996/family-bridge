// SHIM nội bộ web (ADR-3, task 19-a): file thật nằm ở
// packages/family_bridge_shared/src/policy.js — nguồn duy nhất (CONSENT_ORDER,
// POLICY_PURPOSES dùng bởi pages/login + pages/consent).
//
// Độ sâu import: web/src/core/*.js -> 3 cấp lên = repo root.
export * from "../../../packages/family_bridge_shared/src/policy.js";
