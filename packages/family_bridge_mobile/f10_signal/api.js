// F10 signal API wrappers (US-032). Send is EXPLICIT with an idempotency
// key; no draft/AI content rides along — DTO is (need, recipient) only.

export function createSignalApi({ api }) {
  return {
    meta: () => api.get("/api/v1/signals/meta", {}),
    preview: ({ need, recipientId }) =>
      api.post("/api/v1/signals/preview", {
        body: { need, recipient_id: recipientId },
      }),
    send: ({ need, recipientId, key }) =>
      api.post("/api/v1/signals/send", {
        body: { need, recipient_id: recipientId },
        idempotencyKey: key,
      }),
    detail: (messageId) => api.get(`/api/v1/signals/${messageId}`, {}),
    ack: (messageId) =>
      api.post(`/api/v1/signals/${messageId}/ack`, { body: {} }),
  };
}
