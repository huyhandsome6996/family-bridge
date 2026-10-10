# Family Bridge project instructions

- The current product scope is `docs/project-scope.md` (15 features, voluntary activities, 5-minute pause). User instructions override older DOCX or copied project text.
- Implement Django/DRF backend and the existing React Zalo Mini App. Do not start standalone web or React Native clients in this phase.
- Keep domain modules and migrations owned by each US. Route registration/settings/shared contract changes belong in a small coordinated PR.
- Link a Trello US in the PR. Read its acceptance criteria and predecessors. Use the latest main after predecessors merge; mocks do not prove integration.
- Never trust client-provided Zalo identity or admin flags. Verify provider credentials server-side before issuing application tokens. Default-deny APIs also require object-level authorization.
- Private journals/AI drafts are not readable by relatives or teachers by default. Grants apply to each chosen item/page and recipient. Recheck after unlink/revoke.
- No auto-send after a timer, AI response, retry, app resume, or lack of reply. Users select recipients, review and explicitly confirm. Help requests/calls bypass the 300-second pause.
- Call AI only from backend; do not commit API keys, real journals, surveys or participant information. This repository is public.
- Use MySQL for deployment; SQLite is only for local foundation checks. Do not claim MySQL or Zalo device tests passed from SQLite/browser tests.
- Report limitations and test evidence. Never fabricate pre/post outcomes or mark US Done just because compilation/checklists pass.
