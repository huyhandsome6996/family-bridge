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
    share: (id, recipientId) =>
      api.post(`/api/v1/mood/entries/${id}/share`, {
        body: { recipient_id: recipientId },
      }),
    revoke: (shareId) =>
      api.post(`/api/v1/mood/shares/${shareId}/revoke`, { body: {} }),
    sharedWithMe: () => api.get("/api/v1/mood/shared", {}),
    sharedDetail: (shareId) => api.get(`/api/v1/mood/shared/${shareId}`, {}),
  };
}
