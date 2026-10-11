// B16 admin console API wrappers (US-014/020/024/025/041). Every call is
// capability-gated SERVER-side; the UI only mirrors what the server allows.

export function createAdminApi({ api }) {
  return {
    dashboard: () => api.get("/api/v1/admin/dashboard", {}),
    listContent: (status) =>
      api.get("/api/v1/admin/content", {
        query: status ? { status } : {},
      }),
    createDraft: ({ kind, title, body, audience }) =>
      api.post("/api/v1/admin/content", {
        body: { kind, title, body, audience: audience || "neutral" },
      }),
    publish: (contentId, expectedRevision) =>
      api.post(`/api/v1/admin/content/${contentId}/publish`, {
        body: { expected_revision: expectedRevision },
      }),
    retire: (contentId, expectedRevision, reason) =>
      api.post(`/api/v1/admin/content/${contentId}/retire`, {
        body: { expected_revision: expectedRevision, reason },
      }),
    clone: (contentId) =>
      api.post(`/api/v1/admin/content/${contentId}/clone`, { body: {} }),
    myCaps: () => api.get("/api/v1/admin/capabilities", {}),
    grant: ({ userId, capability, scopeType, ttlDays }) =>
      api.post("/api/v1/admin/capabilities/grant", {
        body: { user_id: userId, capability, scope_type: scopeType,
          ttl_days: ttlDays ?? undefined },
      }),
    revoke: (grantId, reason) =>
      api.post(`/api/v1/admin/capabilities/${grantId}/revoke`, {
        body: { reason },
      }),
    settings: () => api.get("/api/v1/admin/settings", {}),
    updateSetting: (key, value) =>
      api.post(`/api/v1/admin/settings/${key}`, { body: { value } }),
    audit: () => api.get("/api/v1/admin/audit", {}),
  };
}
