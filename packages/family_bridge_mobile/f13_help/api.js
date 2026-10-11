// F13 help API wrappers (US-039). The directory is PUBLIC by design —
// it must load even when auth/sessions fail; calls happen only on an
// explicit user tap through the SDK adapter.

export function createHelpApi({ api }) {
  return {
    directory: () => api.get("/api/v1/help/directory", {}),
  };
}
