---
name: family-bridge-dsa
description: Apply Family Bridge DSA, bounded resource use and privacy rules when planning, implementing, reviewing or debugging Django/MySQL APIs and the React Zalo Mini App. Use for every coding task in this repository, especially lists, queries, sharing, timers, concurrent writes, AI calls and exports.
---

# Family Bridge DSA

## Read the contract

Read [AGENTS.md](../../../AGENTS.md), [scope](../../../docs/project-scope.md) and [DSA rules](../../../docs/engineering/dsa-rules.md). Resolve paths from this skill directory. Read the Trello US and current code. For workflow/schema changes read [four-week flow](../../../docs/product/four-week-flow.md) and [ERD](../../../docs/data/erd.md); for roles read [admin capabilities](../../../docs/product/admin-capabilities.md). Read [security rules](../../../docs/security/security-rules.md) before coding.

## Apply the workflow

1. State the user action, trusted principal, authorized objects and correctness invariants. Preserve voluntary participation, per-item privacy, explicit sending, the 300-second pause and immediate help access.
2. Define input sizes: total rows N, returned page P, relationships R, text length L, request frequency and concurrent writers. Bound every user-controlled size. Mark unmeasured traffic assumptions as assumptions.
3. Choose the simplest adequate data structure. Use maps/sets for repeated lookups in a bounded page; ordered arrays for UI; indexed permission-filtered queries for history. Do not load full histories to filter in Python/JavaScript.
4. State time, auxiliary memory, database round trips and transferred bytes separately. Explain average/worst-case assumptions; expected O(1) hash lookup or O(log N + P) indexed query is not a universal latency guarantee.
5. Check SQL shape, stable pagination, serializer N+1 behavior and index write costs. Make simultaneous writes atomic and idempotent where needed. Lock consistently; never hold a transaction while calling AI or network providers.
6. Bound rendering, cache and polling; cancel obsolete requests, deduplicate visible-page IDs and clear private state on logout/unlink. Detect stale draft revisions before sending.
7. Verify risky properties: query count at two page sizes, stable cursor under inserts, double-submit/revoke races and no unauthorized rows. Use synthetic data and relevant real-device checks. Text-only changes need document validation, not invented benchmarks.
8. Report evidence using the block below. Fix exceeded targets or justify a revised target before claiming success. Do not add Redis/Celery/WebSocket by habit.

## Required review record

```text
Action and input bounds:
Authorization and correctness invariants:
Data structure / algorithm and simpler alternative:
Time / auxiliary space (with assumptions):
SQL round trips / index / pagination / payload:
Concurrency / idempotency / cache invalidation:
Evidence (command, synthetic size, environment, result):
Remaining limits or N/A reason:
```

Treat designs as target behavior, not implemented features. AGENTS/adapters, review and automated checks support compliance; a skill cannot guarantee obedience.
