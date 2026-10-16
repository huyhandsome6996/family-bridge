# Responsive web login — 16/10/2026

The web login inherited the Mini App's 480px outer page while its credential
card was capped at 680px. Desktop media rules therefore squeezed two panels
inside a phone-sized container. The web route now has a dedicated fluid page,
official logo/navigation header, a card up to 1120px and a 1024px two-column
breakpoint. Phones/tablets stack the panels with readable controls and copy.
Existing palette, assets, fonts and approved privacy text are preserved.

Scope: F01/F16 login presentation for student/caregiver. `family-bridge-ui`,
UI rules, scope, DSA/security rules and shared-integration guidance applied.
Taste guidance used only for hierarchy/spacing; no new dependency, animation,
marketing claim or typography family. Mini App and demo keep their page layout.

DSA: constant-size DOM/CSS layout, O(1) additional elements/space; no database
queries, polling, retry, payload or authentication changes. Server identity,
consent, session generation, private-data access and help behavior are unchanged.

Verification: 279 frontend tests pass; Vite production build, Zalo manifest,
agent document checker and diff whitespace checks pass. Real browser layout:

| Viewport CSS width | Card width | Layout | Horizontal overflow |
| --- | --- | --- | --- |
| 320 | 273 | stacked | none |
| 390 | 343 | stacked | none |
| 768 | 640 | stacked | none |
| 1024 | 942 | two columns | none |
| 1366 | 1120 | two columns | none |
| 1920 | 1120 | two columns | none |

Inputs/submit remain at least 48px tall; long labels wrap at 320px. Laptop
1366×768 and phone 390×844 inspected visually. Browser tests are not Zalo
device evidence. Backend/schema changes and backend retesting are out of scope.
