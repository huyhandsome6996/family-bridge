// F11 supporters API wrappers (US-022/US-035). Contact = NEW composed text
// with an idempotency key; old letters/journals are never attached.

export function createSupportersApi({ api }) {
  return {
    list: () => api.get("/api/v1/supporters/roles", {}),
    invite: ({ supporterId, relationshipKind }) =>
      api.post("/api/v1/supporters/roles", {
        body: { supporter_id: supporterId,
          relationship_kind: relationshipKind },
      }),
    detail: (roleId) => api.get(`/api/v1/supporters/roles/${roleId}`, {}),
    respond: (roleId, decision) =>
      api.post(`/api/v1/supporters/roles/${roleId}/respond`, {
        body: { decision },
      }),
    revoke: (roleId) =>
      api.post(`/api/v1/supporters/roles/${roleId}/revoke`, { body: {} }),
    contact: ({ roleId, body, key }) =>
      api.post(`/api/v1/supporters/roles/${roleId}/contact`, {
        body: { body },
        idempotencyKey: key,
      }),
    commitments: () => api.get("/api/v1/supporters/commitments", {}),
  };
}
