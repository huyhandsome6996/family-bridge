# Mini App API build configuration hotfix — 21 October 2026

Baseline: `fc9e524eefd711c6ef76b055f1efe0be1816f733` (fresh fetch of main).

The reported Mini App login message occurs before an auth request: the bundle
has no API base URL. `.env.example` is a template, not a Vite input. The build
now refuses absent, empty, non-HTTPS or non-origin values before generating
assets. Vite loads the selected mode's environment and honors shell overrides,
including an empty shell variable. The normalized public origin is baked into
the JS and recorded in `www/build-info.json`; verification checks it against
the emitted JS and validates the complete Zalo asset manifest.

From PowerShell, in `zalo-mini-app/`:

```powershell
npm ci
$env:VITE_API_BASE_URL = 'https://family-bridge-backend.onrender.com'
npm test
npm run build
npm run verify:build
```

Deploy this fresh `www`, never `web/dist` or an older upload staging directory.
With a valid authenticated Zalo CLI, the existing-build testing upload is:

```text
zmp deploy --existing --passive --testing --outputDir www --desc "Family Bridge API build hotfix"
```

CLI 4.0.3 installed on the delivery machine changes TLS defaults on import.
The delivery runner restores certificate verification and enforces
`rejectUnauthorized: true` on HTTPS requests before invoking the CLI. Keep
verification enabled; do not use an insecure TLS workaround. A successful
upload is a Testing version, not App Store review or a real-device test.

The user deferred AI runtime changes on 21 October 2026. No UI flag is forced
on. Server-only environment names and safe defaults are in `backend/.env.example`.
AI status requires a session; a healthy backend does not establish AI readiness.
The quick reply provider is also separate from Gemini: no provider registration
was found in production `backend/core/wiring.py`. Manual responses remain usable.

Validation evidence is attached to the delivery report, including local suites,
builds, production health/readiness and actual upload result. Device login,
HS/PH credentials, Gemini calls, Render deployed SHA/Docker override and MySQL
concurrency must not be inferred from local SQLite/browser checks.

Bounds and security: one public origin <=2048 characters; URL parsing O(L),
build verification O(B) for emitted JS bytes and O(A) manifest entries. No new
runtime queries, permissions, dependencies, migrations, network calls at boot,
or session persistence. SEC-09/10/19/22/26 apply. Classroom password login,
in-memory tokens, consent, paired-account authorization, manual writing and
explicit send/no automatic send remain unchanged. Rollback uses a prior known
good Zalo build with the verified backend origin; no database rollback is needed.

References: [Vite environment precedence](https://vite.dev/guide/env-and-mode),
[Gemini lifecycle](https://ai.google.dev/gemini-api/docs/deprecations/).
