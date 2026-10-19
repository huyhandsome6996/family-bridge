// F04 AI refine API wrappers (US-029/US-033) — hợp đồng v1. Refine ALWAYS
// carries the idempotency key (same key + same text replays the same
// suggestion without a second provider call) and the author's input_revision
// (C4 stale guard: client-side revision echoed by the server DTO). Nothing
// here sends a message — the accepted text continues through the normal
// composer + preview + confirm path (F05/F06).

export function createAiApi({ api }) {
  return {
    status: () => api.get("/api/v1/ai/status", {}),
    refine: ({ text, purpose, key, inputRevision }) =>
      api.post("/api/v1/ai/refine", {
        body: {
          original_text: text,
          purpose: purpose || "refine_expression",
          // C4: optional per contract v1 — gửi khi client có revision.
          ...(inputRevision === undefined ? {} : { input_revision: inputRevision }),
        },
        idempotencyKey: key,
      }),
    list: () => api.get("/api/v1/ai/suggestions", {}),
    detail: (id) => api.get(`/api/v1/ai/suggestions/${id}`, {}),
    accept: (id) => api.post(`/api/v1/ai/suggestions/${id}/accept`, { body: {} }),
    discard: (id) => api.post(`/api/v1/ai/suggestions/${id}/discard`, { body: {} }),
  };
}
