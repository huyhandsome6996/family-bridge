// F04 AI refine API wrappers (US-029/US-033). Refine ALWAYS carries the
// idempotency key (same key + same text replays the same suggestion without
// a second provider call). Nothing here sends a message — the accepted text
// continues through the normal composer + preview + confirm path.

export function createAiApi({ api }) {
  return {
    status: () => api.get("/api/v1/ai/status", {}),
    refine: ({ text, purpose, key }) =>
      api.post("/api/v1/ai/refine", {
        body: { original_text: text, purpose: purpose || "refine_expression" },
        idempotencyKey: key,
      }),
    list: () => api.get("/api/v1/ai/suggestions", {}),
    detail: (id) => api.get(`/api/v1/ai/suggestions/${id}`, {}),
    accept: (id) => api.post(`/api/v1/ai/suggestions/${id}/accept`, { body: {} }),
    discard: (id) => api.post(`/api/v1/ai/suggestions/${id}/discard`, { body: {} }),
  };
}
