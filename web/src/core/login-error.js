// SHIM nội bộ web (ADR-3, task 19-a): file thật nằm ở
// packages/family_bridge_shared/src/login-error.js — nguồn duy nhất của mini
// app và web (loginErrorMessage — lỗi đăng nhập hiển thị giống hệt nhau,
// anti-enumeration).
//
// Độ sâu import: web/src/core/*.js -> 3 cấp lên = repo root.
export * from "../../../packages/family_bridge_shared/src/login-error.js";
