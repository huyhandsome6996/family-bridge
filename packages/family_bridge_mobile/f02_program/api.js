// F02 program API wrappers (US-036/US-044). Enrollment pins a revision;
// re-enroll is always an explicit decision; progress + acceptance are
// per-person only.

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
  };
}
