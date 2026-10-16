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

Live deployment and smoke-test results are recorded after verification.
