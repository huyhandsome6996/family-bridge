// F09 activities API wrappers (US-037). Progress + invite responses are
// ALWAYS per-person: nobody ticks for anyone else.

export function createActivitiesApi({ api }) {
  return {
    catalog: (kind, audience) =>
      api.get("/api/v1/activities/catalog", {
        query: {
          ...(kind ? { kind } : {}),
          ...(audience ? { audience } : {}),
        },
      }),
    progress: () => api.get("/api/v1/activities/progress", {}),
    markProgress: ({ contentKey, contentRevision, status }) =>
      api.post("/api/v1/activities/progress", {
        body: { content_key: contentKey, content_revision: contentRevision,
          status },
      }),
    invites: () => api.get("/api/v1/activities/invites", {}),
    invite: ({ contentKey, contentRevision, inviteeId }) =>
      api.post("/api/v1/activities/invites", {
        body: { content_key: contentKey, content_revision: contentRevision,
          invitee_id: inviteeId },
      }),
    respond: (inviteId, decision) =>
      api.post(`/api/v1/activities/invites/${inviteId}/respond`, {
        body: { decision },
      }),
    myResponse: (inviteId, responseStatus) =>
      api.post(`/api/v1/activities/invites/${inviteId}/my-response`, {
        body: { response_status: responseStatus },
      }),
    cancel: (inviteId) =>
      api.post(`/api/v1/activities/invites/${inviteId}/cancel`, { body: {} }),
  };
}
