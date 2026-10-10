# Security and privacy

Family Bridge is an unfinished Zalo Mini App foundation handling potentially sensitive student/family data. No production-safe release is declared. Security design and open controls live in [security rules](docs/security/security-rules.md), [threat model](docs/security/threat-model.md), [verification plan](docs/security/verification-plan.md) and [control register](docs/security/control-register.json).

Do not post tokens, journals, participant details or live vulnerability reproduction details in public issues/PRs. If GitHub private vulnerability reporting is enabled, use that channel; otherwise contact the repository owner through an existing private channel. No reporting address or SLA is claimed here. Do not test third-party or production services without an agreed scope.

An exposed token must be revoked/rotated; removing text is not enough. See [incident response](docs/security/incident-response.md).

All coding agents must read AGENTS.md and both repository skills before changing code. Rules/checklists are not a security certification and do not replace implementation and verification.
