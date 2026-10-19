// F07 mood API wrappers (US-015/US-026). Sharing is PER-ENTRY with the
// recipient chosen each time; there is no history-wide share anywhere.

export function createMoodApi({ api }) {
  return {
    list: (cursor, pageSize) =>
      api.get("/api/v1/mood/entries", {
        query: {
          ...(cursor ? { cursor } : {}),
          ...(pageSize ? { page_size: String(pageSize) } : {}),
        },
      }),
    create: ({ entryDate, emotion, note }) =>
      api.post("/api/v1/mood/entries", {
        body: { entry_date: entryDate, emotion, note: note || "" },
      }),
    detail: (id) => api.get(`/api/v1/mood/entries/${id}`, {}),
    edit: (id, { emotion, note }) =>
      api.patch(`/api/v1/mood/entries/${id}`, {
        body: { ...(emotion ? { emotion } : {}), ...(note !== undefined ? { note } : {}) },
      }),
    summary: (days) =>
      api.get("/api/v1/mood/entries/summary",
        { query: days ? { days: String(days) } : {} }),
    entryShares: (id) => api.get(`/api/v1/mood/entries/${id}/shares`, {}),
    share: (id, recipientId, expectedRevision) =>
      api.post(`/api/v1/mood/entries/${id}/share`, {
        body: {
          recipient_id: recipientId,
          // Pin the previewed version: server replies 409 stale when the
          // entry moved on — the current revision is never shared silently.
          ...(expectedRevision ? { expected_revision: expectedRevision } : {}),
        },
      }),
    revoke: (shareId) =>
      api.post(`/api/v1/mood/shares/${shareId}/revoke`, { body: {} }),
    sharedWithMe: (cursor, pageSize) =>
      api.get("/api/v1/mood/shared", {
        query: {
          ...(cursor ? { cursor } : {}),
          ...(pageSize ? { page_size: String(pageSize) } : {}),
        },
      }),
    sharedDetail: (shareId) => api.get(`/api/v1/mood/shared/${shareId}`, {}),
  };
}
