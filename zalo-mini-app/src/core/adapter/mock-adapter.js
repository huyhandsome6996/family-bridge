// SHIM giữ path cũ (ADR-2, task 18-a): file thật chuyển về
// packages/family_bridge_shared/src/adapter/mock-adapter.js — nguồn duy nhất
// (dùng chung với web cho demo `?demo=1`). Named export: createMockAdapter.
export * from "../../../../packages/family_bridge_shared/src/adapter/mock-adapter.js";
