// SHIM nội bộ web (ADR-3, task 19-a): file thật nằm ở
// packages/family_bridge_shared/src/session.js — nguồn duy nhất của mini app
// và web. Session in-memory + generation (SEC-10): token KHÔNG BAO GIỜ vào
// storage/URL; shim chỉ re-export, KHÔNG tạo bản sao state riêng.
//
// Độ sâu import: web/src/core/*.js -> 3 cấp lên = repo root.
export * from "../../../packages/family_bridge_shared/src/session.js";
