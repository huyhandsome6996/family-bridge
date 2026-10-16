// Barrel re-export của packages/family_bridge_shared (ADR-1, task 18-a).
// Thuần ESM, không build step, không DOM/zmp-sdk/storage — host (mini app, web)
// import trực tiếp bằng relative path.
//
// Bản quyền/owner: Family Bridge — cùng giấy phép với repo gốc (UNLICENSED,
// private project). Nguồn gốc từng file ghi ở README.md.
export {
  ApiError,
  createApiClient,
} from "./api/client.mjs";

export {
  clearSession,
  clearSessionIfUnchanged,
  getSession,
  getSessionGeneration,
  getToken,
  getUserId,
  hasLiveSession,
  setSession,
} from "./session.js";

export { loginErrorMessage } from "./login-error.js";

export { CONSENT_ORDER, POLICY_PURPOSES } from "./policy.js";

export { DEMO_LABEL, fixtures } from "./fixtures/index.js";

export { createMockAdapter } from "./adapter/mock-adapter.js";
export { createHttpEndpoints } from "./adapter/http-endpoints.js";
export { ADAPTER_METHODS } from "./adapter/contract.js";

export { errorKind, failureFor, messageOf } from "./connection-check.js";
