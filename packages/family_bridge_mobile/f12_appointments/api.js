// F12 appointments API wrappers (US-038/US-046). Scheduling is CONDITIONAL
// — the server returns module_unavailable until real staff exist; the page
// renders that honestly. Submitting a request never means a meeting exists.

export function createAppointmentsApi({ api }) {
  return {
    directory: () => api.get("/api/v1/appointments/directory", {}),
    list: () => api.get("/api/v1/appointments/requests", {}),
    create: ({ topic, note }) =>
      api.post("/api/v1/appointments/requests", {
        body: { topic, note: note || "" },
      }),
    detail: (id) => api.get(`/api/v1/appointments/requests/${id}`, {}),
    propose: (id, startIso) =>
      api.post(`/api/v1/appointments/requests/${id}/slots`, {
        body: { start_at: startIso },
      }),
    accept: (id, slotId) =>
      api.post(`/api/v1/appointments/requests/${id}/slots/${slotId}/accept`,
        { body: {} }),
    decline: (id, slotId) =>
      api.post(`/api/v1/appointments/requests/${id}/slots/${slotId}/decline`,
        { body: {} }),
    cancel: (id) =>
      api.post(`/api/v1/appointments/requests/${id}/cancel`, { body: {} }),
    queue: () => api.get("/api/v1/appointments/queue", {}),
  };
}
