// F03 cards API wrappers (US-027). Send ALWAYS carries the idempotency key
// and is NEVER auto-retried; preview binds (card, version, recipient).

export function createCardsApi({ api }) {
  return {
    list: (group, limit) =>
      api.get("/api/v1/cards", {
        query: {
          ...(group ? { group } : {}),
          ...(limit ? { limit: String(limit) } : {}),
        },
      }),
    preview: ({ cardId, version, recipientId }) =>
      api.post("/api/v1/cards/preview", {
        body: { card_id: cardId, version, recipient_id: recipientId },
      }),
    // Explicit send only — the user pressed confirm; server computes the
    // payload hash from the composed body, replay with different card -> 409.
    send: ({ cardId, version, recipientId, authorNote, key }) =>
      api.post("/api/v1/cards/send", {
        body: {
          card_id: cardId,
          version,
          recipient_id: recipientId,
          author_note: authorNote || "",
        },
        idempotencyKey: key,
      }),
    snapshot: (messageId) => api.get(`/api/v1/cards/${messageId}`, {}),
    suggestions: (messageId, audience) =>
      api.get(`/api/v1/cards/${messageId}/reply-suggestions`, {
        query: audience ? { audience } : {},
      }),
  };
}
