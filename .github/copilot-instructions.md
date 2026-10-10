# Family Bridge repository instructions

Before every task read and follow `AGENTS.md`, `docs/project-scope.md`, `.agents/skills/family-bridge-dsa/SKILL.md`, `docs/engineering/dsa-rules.md`, `.agents/skills/family-bridge-security/SKILL.md` and `docs/security/security-rules.md`. Read relevant nested instructions and Trello acceptance criteria. For security-relevant changes read `docs/security/threat-model.md` and `docs/security/control-register.json`.

For program/schema/sharing changes read `docs/product/four-week-flow.md` and `docs/data/erd.md`. For roles/content/research/support read `docs/product/admin-capabilities.md`.

Use Django/DRF + MySQL and the existing React Zalo Mini App. Bound resources, filter database permissions before pagination and make writes atomic. No auto-send after the 300-second pause. Keep journals/AI private; admin roles do not grant unrestricted family communication access. No secrets or real participant data in this public repository.

Name applicable documents/invariants before coding. Record DSA/SEC controls and actual evidence in the PR. Run `python scripts/check_agent_docs.py` for document integrity; this does not prove obedience, runtime performance or security. Do not invent benchmarks, feature completion or research outcomes.

For documentation-only changes, follow the direct-main publishing policy in AGENTS.md; no documentation PR or repeated confirmation is required. Keep runtime changes separate.

## UI tasks and Taste integration exception

Before any interface planning, implementation, review or fix, read `.agents/skills/family-bridge-ui/SKILL.md` and `docs/engineering/ui-rules.md`. Read `.agents/skills/design-taste-frontend/SKILL.md` before applying its relevant advice, with `docs/engineering/taste-skill-integration.md` for provenance/limits. Family Bridge scope, DSA, security, privacy and admin rules override experimental Taste v2. Keep React/Vite, zmp-sdk and zmp-ui; do not add/upgrade dependencies, fonts or another frontend stack merely to follow upstream. Do not apply marketing checklists to inbox, journals or admin. Preserve consent, explicit recipient/preview/confirmation, no auto-send after 300 seconds, private journals/AI and immediate help.

For the specific `chore/taste-skill-integration` task, override the documentation direct-main policy: start from latest `origin/main`, change only skills/docs/minimal document checks, commit and push this branch, and open a Draft PR into `main`. Do not pull unreviewed branch code, push main, merge, enable auto-merge or force-push. Stop for review; merge only after review passes and a separate user merge instruction. This exception does not weaken mandatory DSA/security rules.
