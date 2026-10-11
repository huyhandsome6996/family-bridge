// Family Bridge mobile core — shared JS contract for all feature modules.
// Vanilla ES modules only (B00 decision 2026-10-11): no React, no zmp-ui.
// Pages are functions returning { el, destroy } — destroy MUST clean up
// timers, listeners and in-flight requests (DSA-10, UI rules).

export { createApiClient, ApiError } from "./src/api-client.js";
export { createSdkBridge, createMockAdapter, createZaloAdapter } from "./src/sdk-bridge.js";
export { createSessionStore } from "./src/session-store.js";
export { createRouter } from "./src/router.js";
export { createStore } from "./src/state.js";
export { BRAND, FUNCTIONAL } from "./src/theme.js";
