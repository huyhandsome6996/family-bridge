// F08 journal API wrappers (US-016/US-031). Pages are private by default;
// sharing is per-page with explicit recipient; edits carry expected_revision
// (offline conflict -> 409, client re-loads instead of blind overwrite).

export function createJournalApi({ api }) {
  return {
    prompts: () => api.get("/api/v1/journal/prompts", {}),
    list: (cursor, search) =>
      api.get("/api/v1/journal/pages", {
        query: {
          ...(cursor ? { cursor } : {}),
          ...(search ? { search } : {}),
        },
      }),
    create: ({ topicCode, title, content }) =>
      api.post("/api/v1/journal/pages", {
        body: { topic_code: topicCode || "", title: title || "", content },
      }),
    detail: (id) => api.get(`/api/v1/journal/pages/${id}`, {}),
    edit: (id, { title, content, expectedRevision }) =>
      api.patch(`/api/v1/journal/pages/${id}`, {
        body: { ...(title !== undefined ? { title } : {}),
          ...(content !== undefined ? { content } : {}),
          expected_revision: expectedRevision },
      }),
    discard: (id) => api.delete(`/api/v1/journal/pages/${id}`, { body: {} }),
    pageShares: (id) => api.get(`/api/v1/journal/pages/${id}/shares`, {}),
    share: (id, recipientId) =>
      api.post(`/api/v1/journal/pages/${id}/share`, {
        body: { recipient_id: recipientId },
      }),
    pageReplies: (id) => api.get(`/api/v1/journal/pages/${id}/replies`, {}),
    sharedWithMe: () => api.get("/api/v1/journal/shared", {}),
    sharedDetail: (shareId) => api.get(`/api/v1/journal/shared/${shareId}`, {}),
    reply: (shareId, body) =>
      api.post(`/api/v1/journal/shared/${shareId}/replies`, { body: { body } }),
    myReplies: () => api.get("/api/v1/journal/my-replies", {}),
    revoke: (shareId) =>
      api.post(`/api/v1/journal/shares/${shareId}/revoke`, { body: {} }),
  };
}
