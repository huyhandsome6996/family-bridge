// API client — bearer token, timeout, JSON, NO auto-retry of mutations.
// Contract (docs/contracts/api-foundation.md):
// - errors surface as ApiError { code, status, details } (stable machine codes)
// - network failure of a send => outcome unknown; caller must use
//   lookupOperation(key) instead of retrying with a new key
// - no cookies: Zalo Mini App auth uses Authorization header only.

export class ApiError extends Error {
  constructor({ code, status, details }) {
    super(code);
    this.name = "ApiError";
    this.code = code || "input_invalid";
    this.status = status || 0;
    this.details = details || {};
  }
}

const DEFAULT_TIMEOUT_MS = 15000;

export function createApiClient({ baseUrl, getToken, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (!baseUrl) throw new Error("baseUrl required");
  if (typeof getToken !== "function") throw new Error("getToken required");

  async function request(method, path, { query, body, idempotencyKey, signal, timeoutMs: perCall } = {}) {
    const url = new URL(path.replace(/^\//, ""), baseUrl.replace(/\/$/, "") + "/");
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      }
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), perCall || timeoutMs);
    const onOuterAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) { clearTimeout(timer); throw new DOMException("aborted", "AbortError"); }
      signal.addEventListener("abort", onOuterAbort, { once: true });
    }
    const headers = { Accept: "application/json" };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (idempotencyKey) headers["X-Idempotency-Key"] = idempotencyKey;
    let response;
    try {
      response = await fetchImpl(url.toString(), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        credentials: "omit", // never cookie-auth (invariant)
      });
    } catch (err) {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onOuterAbort);
      if (err && err.name === "AbortError") throw err;
      // Network failure: outcome UNKNOWN for mutations. Not an HTTP error.
      throw new ApiError({ code: "temporarily_unavailable", status: 0, details: { reason: "network" } });
    }
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onOuterAbort);
    let payload = null;
    const text = await response.text();
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = null; }
    }
    if (!response.ok) {
      const envelope = payload && payload.error ? payload.error : {};
      throw new ApiError({
        code: envelope.code || (response.status === 401 ? "not_authenticated" : response.status === 403 ? "not_authorized" : response.status === 404 ? "not_found" : "input_invalid"),
        status: response.status,
        details: envelope.details || {},
      });
    }
    return payload;
  }

  return {
    get: (path, opts) => request("GET", path, opts),
    post: (path, opts) => request("POST", path, opts),
    patch: (path, opts) => request("PATCH", path, opts),
    delete: (path, opts) => request("DELETE", path, opts),
    // Operation status lookup for unknown send outcomes — SAME key only.
    lookupOperation: (idempotencyKey) =>
      request("GET", "/api/v1/operations/" + encodeURIComponent(idempotencyKey), {}),
  };
}
