// F05 inbox API wrappers (US-021/US-028).

export function createInboxApi({ api }) {
  const hash = (kind, recipientId, body, replyTo, context) => {
    // Canonical payload hash mirrors backend rule (sorted JSON, sha-256).
    // In the Mini App we compute via WebCrypto when available; mock returns
    // a placeholder that the backend rejects loudly (client must re-preview).
    return { kind, recipient_id: recipientId, body, reply_to: replyTo ?? null,
      context_revision: context?.revision ?? null };
  };
  return {
    list: (cursor) => api.get("/api/v1/messages", { query: cursor ? { cursor } : {} }),
    detail: (id) => api.get(`/api/v1/messages/${id}`, {}),
    // Send requires the idempotency key + payload hash; NEVER auto-retried.
    send: ({ kind, recipientId, body, title, replyTo, context, key }) =>
      api.post("/api/v1/messages", {
        body: { kind, recipient_id: recipientId, body, title: title || "",
          reply_to: replyTo || undefined, context },
        idempotencyKey: key,
      }),
    markRead: (id) => api.post(`/api/v1/messages/${id}/read`, { body: {} }),
    quickReplies: (audience) =>
      api.get("/api/v1/messages/quick-replies", { query: audience ? { audience } : {} }),
    lookupOperation: (key) => api.lookupOperation(key),
  };
}
