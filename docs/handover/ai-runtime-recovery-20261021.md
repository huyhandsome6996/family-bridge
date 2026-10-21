# AI runtime recovery — 21 October 2026

Confirmed Render workspace: `tea-d5ftr1ggjchc73cchrhg` (My Workspace).
Backend: `srv-db6h3kg473hc739oipt0`, Docker, main, auto-deploy on commit.
Docker Command is empty: the Dockerfile CMD applies.

## Confirmed deployment blocker

Render deploy `dep-dbc2ohm7bikc73fj6kgg` for main
`fc9e524eefd711c6ef76b055f1efe0be1816f733` failed on 21 October at
03:07 UTC. Runtime migration `f16_classroom.0003_seed_pilot_accounts`
attempted to create an existing unique login_code and raised MySQL error
1062. The preceding deploy for `0efb015` also failed. Render retained the
live build `ae022e4e0149c61be4fb3b33b2b0980c5374fba0`, deploy
`dep-dbc0ekbncjis73ei6p5g`. Health/ready 200 do not prove latest main is live
or AI is enabled. No Gemini error has yet been confirmed in production.

AI status checks with locally supplied test-roster credentials confirmed
both student and caregiver login HTTP 200 and ai_enabled=false (status
HTTP 200); both sessions were logged out. No consent was submitted and no
provider request/message was generated.

The unsafe seed looked up accounts by a new external_ref while supplying
login_code only in create defaults. Existing codes with earlier references
therefore collided. It also deleted lockout history, embedded a shared
password, and recreated active pairs after revocation. Those actions do not
belong in application startup/migration.

## Focused fix

Retain the 0003 migration name/graph, retire its automatic data operation,
and use the swappable AUTH_USER_MODEL dependency so feature-lab works too.
Required schema remains in the dependency migrations. This uses ordinary
`migrate`, without --fake or manual editing of migration history. Already
applied databases retain their existing data; earlier failed seed writes
are not automatically removed or overwritten.

Participant provisioning remains an explicit operation through the existing
management command or CAP-23 classroom workflow. Fresh installs create no
participants or shared credentials during deploy. Existing disabled users,
passwords, external refs, revoked connections, proposals and lockouts stay
untouched. MigrationExecutor regression tests cover upgrades with existing
codes and empty installations, including repeat migrate.

Add a safe F04 startup log with four booleans: enabled, key_present,
model_supported, provider_wired. It emits no key/model value or private text
and never calls Gemini during startup/migration/health. Runtime AI still
requires explicit enablement, a supported model and a valid server key.
Server-only environment placeholders are documented in backend/.env.example.

CI's schema drift guard also exposed that ContentItem's model Meta omitted
the unique constraint already created by admin_core.0002. Restore that exact
model declaration; makemigrations --check reports no changes. This does not
create/drop a database constraint or add a schema migration.

## Runtime procedure

Huy explicitly requested keeping the existing Render Gemini key on
21 October 2026. Preserve its stored value; do not copy it from screenshots
or fetch/print it into logs/chat. Only update non-secret AI settings with a
merge operation, preserving all other environment variables.

Use FB_AI_ENABLED=true, GEMINI_MODEL=gemini-2.5-flash,
GEMINI_TIMEOUT_SECONDS=15 and GEMINI_MAX_OUTPUT_TOKENS=1024 unless the live
provider result establishes a different supported model is needed. Gemini
2.5 access is currently limited to previously active projects; a status=true
only confirms wiring, not provider acceptance. See the official
[model lifecycle](https://ai.google.dev/gemini-api/docs/deprecations/).

After reviewed code is merged/deployed: monitor the exact deploy ID until
live, inspect the F04 booleans and Gunicorn listening, verify health/ready,
then use an authenticated HS/PH session for status and one non-sensitive
refine with current consent/idempotency. HS/PH auth/status was exercised with
the local roster; real Gemini/device checks remain NOT_RUN until exercised.
Accepting a suggestion must only fill
the composer; manual responses and explicit send remain available.

## Evidence and bounds

- Full feature-lab: 806 tests, 788 PASS, 18 SKIP (SQLite; provider/MySQL gates).
- Real backend settings: core probes/classroom integration + migration
  regression, 13/13 PASS on SQLite; full foundation suite 51 PASS, 2 SKIP.
  Schema drift check reports no changes.
- Admin/F04/F16 regression after model alignment: 202 PASS, 9 SKIP.
- Prior focused AI UI run: web 49/49, Mini App 51/51 PASS (browser test DOM).
- Diff whitespace checks pass. Local document checker reports the known
  Taste raw-checksum mismatch from CRLF checkout; Linux CI checks separately.
- No production migration, data cleanup, password reset, forced provider
  status, automatic consent/send, or new dependency is performed by this patch.

Actor: deployment operator; participant records are outside deploy authority.
WF-03/06/17/19/21/25 and SEC-02/04/07/19/22/26 apply. Migration data work
is O(1), zero participant queries/writes; safe logging reads a bounded set
of environment settings, O(L) in configured key length, no network/SQL.
Regression snapshots scan only bounded synthetic rows, not production data.
Rollback must not redeploy the previous unsafe seed to a database that has
not completed it; retain this migration fix in any recovery build.
