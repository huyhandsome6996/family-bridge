// SHIM giữ path cũ (ADR-2, task 18-a): file thật chuyển về
// packages/family_bridge_shared/src/api/client.mjs — nguồn duy nhất.
// `export *` giữ nguyên named exports (ApiError, createApiClient); mọi
// importer cũ của path này tiếp tục dùng đúng một instance class shared.
export * from "../../../../packages/family_bridge_shared/src/api/client.mjs";
