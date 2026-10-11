// F14 surveys API wrappers (US-040/US-045). Consent is explicit; skipping
// costs nothing; answers are typed (no free text); reports are aggregate
// with small-group suppression.

export function createSurveysApi({ api }) {
  return {
    forms: () => api.get("/api/v1/surveys/forms", {}),
    consentStatus: () => api.get("/api/v1/surveys/consent", {}),
    setConsent: ({ purpose, decision }) =>
      api.post("/api/v1/surveys/consent", {
        body: { purpose, decision },
      }),
    submit: ({ formKey, formRevision, phase, answers }) =>
      api.post("/api/v1/surveys/responses", {
        body: { form_key: formKey, form_revision: formRevision, phase,
          answers },
      }),
    report: (formKey, revision, phase) =>
      api.get(`/api/v1/surveys/report/${formKey}`, {
        query: { revision: String(revision),
          ...(phase ? { phase } : {}) },
      }),
  };
}
