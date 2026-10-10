---
name: family-bridge-ui
description: Plan, implement, review or debug Vietnamese Family Bridge UI in React/Vite Zalo Mini App with zmp-sdk and zmp-ui. Read before every interface task including inbox, journals, AI drafts, consent, sharing, four-week activities, help and scoped admin; constrain experimental upstream Taste advice to appropriate surfaces.
---

# Family Bridge UI

## Read the contract

Read [AGENTS](../../../AGENTS.md), [scope](../../../docs/project-scope.md),
[UI rules](../../../docs/engineering/ui-rules.md),
[DSA rules](../../../docs/engineering/dsa-rules.md) and
[security rules](../../../docs/security/security-rules.md).
Read [four-week flow](../../../docs/product/four-week-flow.md),
[ERD/privacy](../../../docs/data/erd.md) and
[admin capabilities](../../../docs/product/admin-capabilities.md) for the affected flow.
For business UI also read [workflow skill](../family-bridge-workflow/SKILL.md),
[flows/states](../../../docs/product/user-flows.md),
[configuration catalog](../../../docs/product/admin-configuration-catalog.md),
[content lifecycle](../../../docs/product/content-lifecycle.md) and
[brand identity](../../../docs/design/brand-identity.md).
Resolve links from this skill directory. Keep mandatory DSA/security skills active.

## Apply the workflow

1. State screen, student/caregiver/admin actor, task and authorized data. Inspect existing components, package.json and relevant US before proposing a change. Distinguish targets from implementation.
2. Use React/Vite, zmp-sdk and zmp-ui in the existing Mini App. Reuse installed styles, icons and system fonts. Do not switch to Next.js/RSC or React Native or add/upgrade Tailwind, GSAP, Motion, icon/font packages or another design system merely because upstream suggests them.
3. Use Vietnamese labels and the spacing, typography, semantic colors, component/state and mobile rules in UI rules. Keep tasks short, readable and fast on phones. Preserve consent/privacy copy and recognizable navigation; never rewrite protected content for aesthetics.
4. Keep journals, mood notes and original/suggested AI text private by default. Share individual items: select recipient, preview the approved revision, explicitly confirm. Never send after timer, AI response, retry or resume. Preserve the optional 300-second pause; allow help immediately, including while a draft is paused.
5. Keep activities/surveys voluntary and published weeks accessible. Do not introduce streak pressure, emotion rankings or automatic forwarding. Render admin actions by named capability/scope with server authorization. Admin never gains default access to private thoughts.
6. Read [Taste upstream](../design-taste-frontend/SKILL.md) before using relevant advice; consult [provenance and limits](../../../docs/engineering/taste-skill-integration.md). Treat v2 as experimental. Use brief/audit, hierarchy, consistency and lightweight accessibility advice where appropriate. Do not apply its marketing pre-flight, hero/image/font/dependency/animation mandates to inbox, journals, forms or admin. Record excluded advice and the governing project rule.
7. Verify loading/empty/error/disabled/success, offline/resume, keyboard/safe area, small screens, large text, touch targets, contrast, focus and reduced motion when implementing UI. Cancel obsolete requests and bound histories under DSA. Keep drafts on failure and avoid automatic send retries. Do not load decorative imagery or heavy animation to satisfy Taste.
8. Report paths, commands, device/browser scope and remaining checks. Follow the task-specific authorized publishing scope in AGENTS. The historical chore/taste-skill-integration exception used a Draft PR and separate reviewed merge instruction (PR #2, completed); it does not override later authorized docs-only direct-main tasks. Never infer permission to merge app code or implement UI from a documentation task.

## Record evidence

```text
Screen / actor / task / relevant US:
Documents read and privacy/consent/help invariants:
Installed components and dependency decisions:
UI rules applied; Taste sections used / excluded with reasons:
State, mobile, accessibility and bounded-resource evidence:
Commands / environment / results / remaining device checks:
Runtime DSA/security N/A reason for text-only changes:
```
