# Family Bridge repository instructions

Before every task read and follow `AGENTS.md`, `docs/project-scope.md`, `.agents/skills/family-bridge-dsa/SKILL.md`, `docs/engineering/dsa-rules.md`, `.agents/skills/family-bridge-security/SKILL.md` and `docs/security/security-rules.md`. Read relevant nested instructions and Trello acceptance criteria. For security-relevant changes read `docs/security/threat-model.md` and `docs/security/control-register.json`.

For program/schema/sharing changes read `docs/product/four-week-flow.md` and `docs/data/erd.md`. For roles/content/research/support read `docs/product/admin-capabilities.md`.

Use Django/DRF + MySQL and the existing React Zalo Mini App. Bound resources, filter database permissions before pagination and make writes atomic. No auto-send after the 300-second pause. Keep journals/AI private; admin roles do not grant unrestricted family communication access. No secrets or real participant data in this public repository.

Name applicable documents/invariants before coding. Record DSA/SEC controls and actual evidence in the PR. Run `python scripts/check_agent_docs.py` for document integrity; this does not prove obedience, runtime performance or security. Do not invent benchmarks, feature completion or research outcomes.
