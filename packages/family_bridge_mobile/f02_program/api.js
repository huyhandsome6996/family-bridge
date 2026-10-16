// F02 program API wrappers (US-036/US-044). Enrollment pins a revision;
// re-enroll is always an explicit decision; progress + acceptance are
// per-person only. The week-4 family agreement instance is pair-bound:
// propose -> each side confirms for themselves -> confirmed (same revision,
// same connection generation); withdraw is proposer-only while proposed.

export function createProgramApi({ api }) {
  return {
    catalog: () => api.get("/api/v1/program/catalog", {}),
    enroll: ({ programKey, programRevision }) =>
      api.post("/api/v1/program/enroll", {
        body: { program_key: programKey, program_revision: programRevision },
      }),
    optOut: (programKey) =>
      api.post("/api/v1/program/opt-out", { body: { program_key: programKey } }),
    my: () => api.get("/api/v1/program/my", {}),
    weeks: (programKey) => api.get(`/api/v1/program/weeks/${programKey}`, {}),
    progress: ({ programKey, weekNo, activityKey, status }) =>
      api.post("/api/v1/program/progress", {
        body: { program_key: programKey, week_no: weekNo,
          activity_key: activityKey, status },
      }),
    acceptAgreement: (programKey) =>
      api.post("/api/v1/program/agreement/accept",
        { body: { program_key: programKey } }),
    // ---- week-4 family agreement instance (pair-bound) ----
    agreementOverview: (programKey) =>
      api.get("/api/v1/program/agreement",
        { query: { program_key: programKey } }),
    proposeAgreement: (programKey) =>
      api.post("/api/v1/program/agreement/propose",
        { body: { program_key: programKey } }),
    confirmAgreement: (agreementId) =>
      api.post(`/api/v1/program/agreement/${agreementId}/confirm`,
        { body: {} }),
    withdrawAgreement: (agreementId) =>
      api.post(`/api/v1/program/agreement/${agreementId}/withdraw`,
        { body: {} }),
  };
}
