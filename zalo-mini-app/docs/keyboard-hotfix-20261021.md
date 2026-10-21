# Login keyboard hotfix — 21 October 2026

Scope: only `zalo-mini-app/`, F01 classroom credential login on Zalo/web.
The reported device symptom is keyboard dismissal after one character.

The router previously cleared every DOM node for every hashchange notification,
including repeated notifications with no URL change. That deterministically
detaches a focused credential input. Ignore redundant host notifications while
preserving explicit same-route navigate refresh and router.render after auth.
This is a verified focus-loss path, not proof of the native device's root cause.

Keep native input nodes and values; add keyboard Next/Go hints, turn off spelling
correction, defer submission during IME composition, and preserve password focus
and selection when tapping its visibility control. No blur-refocus loop, storage
of credentials, polling, SDK permissions, consent or authentication API changes.

Validation: 442/442 Mini App tests; focused router suite 13/13 after final edit;
Edge mobile/touch browser simulation passes per-character focus/DOM identity,
viewport shrink, duplicate hash events, Next and password visibility. Production
build and manifest/API verification pass. Import boundary assertions 5/5 pass.
These checks do not test a physical Android/iOS Zalo keyboard; user verification
on the new Testing QR is still required. No real credentials submitted.

Bounds/DSA: retain one hash string and one composition boolean, no growing state.
Duplicate-event comparison O(H) time/O(H) retained space for hash length H;
input handling O(1) auxiliary state. No new queries, payloads, retries or caches.
Existing backend validation, authorization, consent, explicit sending and privacy
rules are unchanged. Source references: project-scope, DSA/security/UI rules,
F01 existing adapter contract and shared integration ownership.
