// SHIM giữ path cũ (ADR-2, task 18-a): file thật chuyển về
// packages/family_bridge_shared/src/session.js — nguồn duy nhất.
// Session in-memory + generation (SEC-10): state module duy nhất của shared
// được dùng chung cho cả app và tests (shim chỉ re-export, KHÔNG tạo bản sao).
export * from "../../../packages/family_bridge_shared/src/session.js";
