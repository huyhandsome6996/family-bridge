// F15 privacy API wrappers.

export function createPrivacyApi({ api }) {
  return {
    overview: () => api.get("/api/v1/privacy/overview", {}),
    revokeGrant: (itemType, itemId, recipientId) =>
      api.post(`/api/v1/privacy/grants/${itemType}/${itemId}/revoke`,
        { body: recipientId ? { recipient_id: recipientId } : {} }),
    requestDeletion: (categories) =>
      api.post("/api/v1/privacy/deletion-requests", { body: { categories } }),
    getDeletionRequest: (id) => api.get(`/api/v1/privacy/deletion-requests/${id}`, {}),
    cancelDeletionRequest: (id, expectedRevision) =>
      api.post(`/api/v1/privacy/deletion-requests/${id}/cancel`,
        { body: expectedRevision == null ? {} : { expected_revision: expectedRevision } }),
    withdrawConsent: (purpose) =>
      api.post(`/api/v1/privacy/consents/${purpose}/withdraw`, { body: {} }),
  };
}
