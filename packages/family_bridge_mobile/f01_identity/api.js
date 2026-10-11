// F01 mobile API client wrappers (US-011/US-013).
// Uses the shared core client; no business decisions here.

export function createIdentityApi({ api }) {
  return {
    loginWithZaloToken: (accessToken) =>
      api.post("/api/v1/auth/session", { body: { access_token: accessToken } }),
    logout: () => api.post("/api/v1/auth/logout", {}),
    listConsents: () => api.get("/api/v1/consents", {}),
    recordConsent: (purpose, policyVersion, decision) =>
      api.post("/api/v1/consents", { body: { purpose, policy_version: policyVersion, decision } }),
    createInvite: (relationshipKind) =>
      api.post("/api/v1/connections/invites", { body: { relationship_kind: relationshipKind } }),
    listInvites: () => api.get("/api/v1/connections/invites", {}),
    claimInvite: (code) => api.post("/api/v1/connections/invites/claim", { body: { code } }),
    confirmInvite: (inviteId, expectedRevision) =>
      api.post(`/api/v1/connections/invites/${inviteId}/confirm`,
        { body: expectedRevision == null ? {} : { expected_revision: expectedRevision } }),
    declineInvite: (inviteId) =>
      api.post(`/api/v1/connections/invites/${inviteId}/decline`, { body: {} }),
    cancelInvite: (inviteId) =>
      api.post(`/api/v1/connections/invites/${inviteId}/cancel`, { body: {} }),
    listConnections: () => api.get("/api/v1/connections", {}),
    revokeConnection: (connectionId) =>
      api.post(`/api/v1/connections/${connectionId}/revoke`, { body: {} }),
  };
}
