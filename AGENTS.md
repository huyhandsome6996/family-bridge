# Family Bridge project instructions

## Branch reorganization (2026-10-15 — current work-assignment source)

On 15 October 2026 the remote branches were reorganized: the 15 feature work
units now live on `tinh-nang/fxx-...` branches plus one temporary maintenance
branch `bao-tri/chong-trung-mysql-tidb-us004` (W036); all legacy `feat/*`,
`chore/*`, `codex/*`, `fix/*`, `review/*` branches were deleted after
preserving their work (evidence and recovery: `docs/project/branch-reorganization/legacy-branches.json`).
Ownership, per-feature paths, temporary locks and readiness: `docs/project/branch-reorganization/branches.json`.
Shared-file integration is coordinated by the lead: `docs/project/branch-reorganization/shared-integration.md`.
These supersede the branch-related parts of `docs/project/full-build/plan.md`,
`ownership.md` and `branch-manifest.json` (dated supersede notes inside those
files); business/security rules there remain in force.

## Frontend stack update (2026-10-11 — supersedes React/zmp-ui for new frontend work)

On 11 October 2026 the repository owner finalized the frontend stack for all
new frontend work: **HTML5, CSS3 and vanilla JavaScript ES Modules, bundled
with Vite, using `zmp-sdk` for Zalo interaction**, built as a Zalo Mini App
mobile SPA. React, React Native and `zmp-ui` are superseded for new frontend
modules; do not add React-based code paths for them. Documents/rules that
still mention React/Vite/zmp-ui remain valid for backend/API/stack history
and for the existing `zalo-mini-app/` scaffold owned by the US-003 frontend
agent, but new feature modules live under `packages/family_bridge_mobile/`
and follow `packages/family_bridge_mobile_core/` contracts. Product goals,
API backend, MySQL and privacy invariants are unchanged by this update.

Feature module packaging (full-build program): Django feature apps live in
`packages/family_bridge_features/<label>/` with their own app label and
migrations; shared JS contracts live in `packages/family_bridge_mobile_core/`;
the explicit feature registry is `packages/family_bridge_core/registry.py`;
module tests run in the isolated harness under `tests/feature-lab/` (test-only
user app; not a production login path). Read `docs/project/full-build/plan.md`
and `docs/project/full-build/ownership.md` before touching shared files.

## Mandatory reading at the start of every task

Read this file, `docs/project-scope.md`, `.agents/skills/family-bridge-dsa/SKILL.md`, and `docs/engineering/dsa-rules.md` before planning or changing code. Follow applicable nested AGENTS.md files too. On a resumed task, reread files changed since the last read; do not repeat an unchanged full read within the same task.

Also read `.agents/skills/family-bridge-security/SKILL.md` and `docs/security/security-rules.md` for every coding task. For security-relevant changes read `docs/security/threat-model.md` and `docs/security/control-register.json`; use `docs/security/verification-plan.md` for validation and `docs/security/incident-response.md` for incidents. Primary references are cataloged in `docs/security/sources.md`.

Read `docs/product/four-week-flow.md` and `docs/data/erd.md` for program, sharing, schema or workflow changes. Read `docs/product/admin-capabilities.md` for roles, administration, research, content publishing or school support. Read the relevant Trello US and existing API contracts before implementation. These documents describe target behavior, not implemented features.

In the first work update, name the applicable documents and the invariants affected. In the code PR (or documentation commit summary), record input bounds, algorithm/data structure choices, time and auxiliary space costs, query/payload limits, authorization and verification evidence. For text-only changes mark runtime analysis N/A with a reason. Never claim reading or profiling that did not happen.

Use `python scripts/check_agent_docs.py` to check instruction wiring and document structure. This check cannot prove agent obedience, feature correctness, performance, privacy or database compatibility. Do not mark a US Done from this check alone.

## Publishing documentation and skills

The specific Taste integration exception below takes precedence for that task. The user explicitly authorized direct updates to main on 11 October 2026. For documentation-only tasks, commit and push skills, rules, project documents and their minimal validation tooling directly to the latest main after relevant checks. Do not open a PR or request confirmation again for this authorized scope. Record verification/limitations in the commit summary and final report instead of requiring a documentation PR.

Use a focused commit and fast-forward update with the expected main SHA; never force-push, overwrite concurrent edits or bypass branch protection. If main has moved, inspect and integrate the new changes before retrying. If repository protection prevents a direct push, use the permitted route and explain the actual restriction.

This policy does not authorize merging application code, dependencies, migrations, runtime/deployment configuration or mixed code/documentation PRs. Extract documentation and its minimal checks from mixed PRs; keep application changes in their own reviewed branch/PR. Keep statements about implemented features scoped to the branch/commit containing the code.

## Admin-provisioned classroom pairs (18 October 2026 — F16 CAP-23 + consent screens)

Huy's written decision of 18 October 2026 (delivered in the ANTIGRAVITY-ADMIN-PAIRING-CONSENT bundle) authorizes:
1. A focused, verified change implementing admin-provisioned parent-student pairs (backend provenance + admin API + web admin screen + backfill tooling + tests + their indispensable docs/registry updates) delivered DIRECTLY to latest main — fast-forward only, no force push, after repo checks (feature suites, wiring, docs checker, client tests/build). This is an explicit exception to the "documentation-only direct-main" rule above; the exception covers exactly this scoped work, not unrelated application changes.
2. The consent Stitch redesign for web and Zalo Mini App stays on its own reviewable branch/PR (codex/consent-stitch-responsive) because web ownership overlaps other contributors.

Invariant updates recorded as DEC-24/WF-25/CAP-23 (see decision-register, admin-capabilities, workflow-rules and the dated supersede notes in project-scope/state-machines/access-matrix/user-flows): an administrator holding the named capability `classroom.provision` with REAL scope (global, or school matching class_ref exactly) creates an ACTIVE canonical Connection the moment the paired row is saved; end users do not confirm classroom pairing when accounts are provisioned this way. Still true and untouched: bilateral confirmation for voluntary invites/agreements (F02), no consent recorded on behalf of users, no private-data grants, revoke never auto-revives on re-import, F15 deletion hooks keep working, is_staff/superuser never bypass capability checks.

## Performance and data safety

- Apply the mandatory rules in `docs/engineering/dsa-rules.md`. Prefer bounded, simple solutions; do not add sophisticated algorithms, caches or infrastructure without workload evidence.
- Filter by authorization in the database before pagination or aggregation. Recheck grants/connection state on each sensitive operation; speed never overrides privacy.
- Bound list pages, input text, AI requests, retries, polling, caches and exports. Prevent N+1 queries, nested full-history scans and unbounded DOM/state growth.
- Use atomic transitions and database uniqueness for concurrent confirmations, sends and agreement acceptance. A 300-second pause never creates an automatic send job.
- Treat ERD indexes and performance budgets as design proposals until MySQL/device measurements validate them. Record measured evidence separately from targets.
- Administrative roles grant only named scoped capabilities. `is_staff`/UI visibility must not grant access to private journals, AI drafts, messages or raw surveys.
- Apply SEC-01..SEC-30 according to scope. Record actual control status/evidence; do not call documents or scaffold a security certification. Never use, echo or commit credentials exposed in chat/logs. Local synthetic tests are authorized by the task; production/third-party scans and destructive load tests need separate explicit scope.

- The current product scope is `docs/project-scope.md` (15 features, voluntary activities, 5-minute pause). User instructions override older DOCX or copied project text.
- Implement Django/DRF backend, the Zalo Mini App (`zalo-mini-app/`) and, since the 2026-10-16 web separation, the standalone web app (`web/`) sharing `packages/family_bridge_shared/` with it (see `docs/handover/web-miniapp-separation/architecture.md`). Do not start React Native or other additional clients in this phase.
- Keep domain modules and migrations owned by each US. Route registration/settings/shared contract changes belong in a small coordinated PR.
- Link a Trello US in code PRs where applicable; documentation-only tasks follow the direct-main policy above. Read its acceptance criteria and predecessors. Use the latest main after predecessors merge; mocks do not prove integration.
- Never trust client-provided Zalo identity or admin flags. Verify provider credentials server-side before issuing application tokens. Default-deny APIs also require object-level authorization.
- Private journals/AI drafts are not readable by relatives or teachers by default. Grants apply to each chosen item/page and recipient. Recheck after unlink/revoke.
- No auto-send after a timer, AI response, retry, app resume, or lack of reply. Users select recipients, review and explicitly confirm. Help requests/calls bypass the 300-second pause.
- Call AI only from backend; do not commit API keys, real journals, surveys or participant information. This repository is public.
- Use MySQL for deployment; SQLite is only for local foundation checks. Do not claim MySQL or Zalo device tests passed from SQLite/browser tests.
- Report limitations and test evidence. Never fabricate pre/post outcomes or mark US Done just because compilation/checklists pass.

## UI tasks and Taste integration exception

Before any interface planning, implementation, review or fix, read `.agents/skills/family-bridge-ui/SKILL.md` and `docs/engineering/ui-rules.md`. Read `.agents/skills/design-taste-frontend/SKILL.md` before applying its relevant advice, with `docs/engineering/taste-skill-integration.md` for provenance/limits. Family Bridge scope, DSA, security, privacy and admin rules override experimental Taste v2. Keep React/Vite, zmp-sdk and zmp-ui; do not add/upgrade dependencies, fonts or another frontend stack merely to follow upstream. Do not apply marketing checklists to inbox, journals or admin. Preserve consent, explicit recipient/preview/confirmation, no auto-send after 300 seconds, private journals/AI and immediate help.

For the specific `chore/taste-skill-integration` task, override the documentation direct-main policy: start from latest `origin/main`, change only skills/docs/minimal document checks, commit and push this branch, and open a Draft PR into `main`. Do not pull unreviewed branch code, push main, merge, enable auto-merge or force-push. Stop for review; merge only after review passes and a separate user merge instruction. This exception does not weaken mandatory DSA/security rules.

## Business workflow and deep admin

For business/workflow, schema/API, permissions, content/configuration, research, support or operations tasks, read `.agents/skills/family-bridge-workflow/SKILL.md` and `docs/engineering/workflow-rules.md`, then `docs/product/user-flows.md`, `docs/product/workflow-state-machines.md`, `docs/product/access-sharing-matrix.md`, `docs/product/workflow-acceptance.md` and `docs/product/decision-register.md`. For administrative changes also read `docs/product/admin-capabilities.md`, `docs/product/admin-configuration-catalog.md`, `docs/product/content-lifecycle.md`, `docs/operations/admin-handover.md` and `docs/design/brand-identity.md`. Keep mandatory DSA/security/UI reading above.

Name actor, current state/revision/generation, named capability/scope/TTL, config source/default/bounds and related F/US/FL/AF/WF/CFG/test IDs before editing. Compare ERD/API; retain backend authorization, item-level grants, bilateral confirmation, voluntary program/survey, fixed server300/no-auto-send and immediate help. System Administrator is explicit SYSTEM management authority, never private/raw-data bypass. One person may separately review/publish with required caps and honest audit; expert/legal approval remains mandatory when needed. Typed versioned settings cannot execute code, expose secrets or enable absent modules. Teacher daily edits must have an app source; console/ownership/recovery/new code remain explicit boundaries.

Docs/design/expected tests do not establish implemented features or US Done/SEC VERIFIED. This workflow/admin task is docs-only and explicitly authorized to commit/push latest main after checks with expected SHA; no other application PR merge, runtime, migration, dependency or deployment. The earlier Taste-only branch exception was completed via reviewed PR #2 and separate merge instruction; it does not require a branch/Draft PR for this task.
