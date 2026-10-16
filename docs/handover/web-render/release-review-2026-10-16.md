# Render web integration review — 16/10/2026

Owner requested review, integration and a usable Render URL. Review started
from PR #36 `0e97d727408aac7a848380a30fe247e58f0354e8` and main
`7cf3851015e210f7c6e315b39fdfb861b2352582`. The web branch was behind the
new classroom backend; main was merged into it without conflicts.

## Findings fixed before deployment

- Render static services have no compute region. Removed the unsupported
  frontend `region` field, retaining the backend's Singapore configuration.
- Vite's Zalo-compatible entry JS and CSS use stable filenames. Replaced the
  one-year immutable `/assets/*` policy with revalidation to prevent stale
  entry/CSS after a release. Regression assertion covers this configuration.
- Settings accepted 4–32 character login codes while F16 accepts 3–16.
  Aligned validation, input length, error copy and teacher guidance; added
  UI tests for accepted 3/16 and rejected 2/17 character codes before API calls.
- Corrected the handover index link and display-name reauthentication guide.

## Checks

- Original frontend suite: 276 passed, zero failures; production build and
  all Zalo manifest references verified.
- Updated web screens/configuration suites: 83 passed, including the new
  boundary test. No production mock fallback or stored bearer token added.
- Django backend check and migration drift check passed.
- Agent documentation checker passed after normalizing checkout-only CRLF
  bytes of the pinned Taste reference; upstream source was not modified.
- Real TiDB migration plan contained only F16 `0001_initial`; applied that
  additive migration successfully. Existing 42 tables retained, 3 added.
  No deletion, account reset, consent acceptance or connection confirmation.

Security scope: own Render frontend, existing API and classroom authentication;
SEC-01/02/05/09/10/19/25/27. Auth remains server-side; web adds no private-data
access through CORS, and the existing origins are preserved. Zalo SDK remains
available for future use, while the web uses the local classroom API.

Dependency residual: `npm audit --omit=dev` reports 4 high inherited dependency
nodes from the SDK's Babel/chokidar/braces CLI chain and one moderate Sentry
advisory (GHSA-593m-55hh-j8gv). The high chain is build tooling, not an exposed
web endpoint; Zalo/Sentry is lazy-imported only during Zalo login and is not
invoked by web classroom login. No forced SDK downgrade/upgrade was applied.
SDK dependency maintenance remains follow-up work; this is not a security
certification or evidence for all 15 features.

## Live verification completed

- PR #36 merged to main `41b17a37732f6cf958b36b1f4265c6aabed2d6a8`
  after all four GitHub workflows passed, including real MySQL checks.
- Existing backend deployed main's F16 code `7cf3851`, Render deployment
  `dep-db8p50bl550s73emsobg` (Live). Backend source is identical in the web merge.
- Blueprint created static service `srv-db8p6p4s728c73ailbig`; frontend deployed
  the merge with the real API build variable, deployment
  `dep-db8p7j49v7es73dcur30` (Live).
- Public site: <https://family-bridge-web.onrender.com/#/login>.
  Existing API: <https://family-bridge-backend.onrender.com>.
- Health and database readiness both HTTP 200/ok. Capabilities return
  local_class=true, zalo=false and all three classroom settings enabled.
- API CORS preflight accepts the exact web origin, preserving prior origins.
  Production JS includes the configured API origin and returns no-cache/nosniff.
- Provisioned 100 synthetic pilot accounts (HS001–HS050, PH001–PH050) and 50
  same-index proposals via the idempotent management command after a clean
  dry-run. Passwords are hashed; initialization credentials stay in private
  owner handover, never in this repository or frontend bundle.
- Live API smoke: HS001 and PH001 login HTTP 200 with their server-assigned
  student/caregiver roles; profile and own proposal list HTTP 200, one proposed
  pair per actor. Logout HTTP 200; the revoked token then returns HTTP 401.
- Real browser: HS001 submitted the public web login form and reached
  `#/consent` with all purposes initially unchecked. No terms, research/AI
  consent or partner confirmation was submitted on behalf of the user.
- Real backend wiring/Zalo dormancy tests: 18 passed. Deployment checks have
  only W005/W021 (HSTS subdomain/preload not enabled on the shared Render host).
- Enabled frontend push-to-deploy on main after the successful manual smoke.
  Backend auto-deploy remains off because schema changes require migration.

Scope limits: this proves deployment and the login/session path; it does not
certify all 15 features, bilateral confirmation on live participant accounts,
actual delivery/AI configuration, or Zalo device execution. Local full harness
results, when available, are separate from the passing GitHub workflow evidence.
