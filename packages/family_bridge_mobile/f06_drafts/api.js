// F06 drafts API wrappers (US-030/US-034). The pause is SERVER-owned:
// countdowns always derive from (deadline, server_time) — never the device
// clock. Confirm-send is the FINAL explicit action and is never auto-retried.

export function createDraftsApi({ api }) {
  return {
    list: () => api.get("/api/v1/drafts", {}),
    create: ({ kind, body, title, cardId, cardVersion, recipientId }) =>
      api.post("/api/v1/drafts", {
        body: {
          kind,
          body,
          title: title || "",
          card_id: cardId || undefined,
          card_version: cardVersion ?? undefined,
          recipient_id: recipientId || undefined,
        },
      }),
    detail: (id) => api.get(`/api/v1/drafts/${id}`, {}),
    edit: (id, { body, title, cardId, cardVersion, recipientId }) =>
      api.post(`/api/v1/drafts/${id}`, {
        body: {
          body,
          title: title || "",
          card_id: cardId || undefined,
          card_version: cardVersion ?? undefined,
          recipient_id: recipientId || undefined,
        },
      }),
    discard: (id) => api.delete(`/api/v1/drafts/${id}`, { body: {} }),
    pause: (id) => api.post(`/api/v1/drafts/${id}/pause`, { body: {} }),
    cancelPause: (id) => api.delete(`/api/v1/drafts/${id}/pause`, { body: {} }),
    preview: (id) => api.post(`/api/v1/drafts/${id}/preview`, { body: {} }),
    confirmSend: (id, previewId) =>
      api.post(`/api/v1/drafts/${id}/confirm-send`, {
        body: { preview_id: previewId },
      }),
  };
}

/**
 * Remaining seconds until the pause deadline.
 *
 * remaining_at_fetch = deadline - server_time  (both from the SERVER)
 * remaining_now      = remaining_at_fetch - elapsed_device_time
 *
 * elapsed_device_time uses monotonic ticks (performance.now()), NOT the
 * wall clock — so changing the device clock after the fetch cannot shorten
 * or extend the wait. deviceNowMs/deviceFetchMs come from performance.now().
 */
export function remainingSeconds({ deadlineIso, serverTimeIso,
                                   deviceNowMs, deviceFetchMs }) {
  const remainingAtFetch = (Date.parse(deadlineIso)
    - Date.parse(serverTimeIso)) / 1000;
  const elapsed = (deviceNowMs - deviceFetchMs) / 1000;
  return Math.max(0, Math.ceil(remainingAtFetch - elapsed));
}
