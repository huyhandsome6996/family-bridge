"""Check repository instruction wiring; never claim runtime/security compliance."""
from pathlib import Path
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SKILLS = ("family-bridge-dsa", "family-bridge-security")
REQUIRED = (
    "AGENTS.md", "SECURITY.md", "docs/project-scope.md",
    "docs/engineering/dsa-rules.md", "docs/product/four-week-flow.md",
    "docs/product/admin-capabilities.md", "docs/data/erd.md",
    "docs/security/security-rules.md", "docs/security/threat-model.md",
    "docs/security/verification-plan.md", "docs/security/incident-response.md",
    "docs/security/sources.md", "docs/security/control-register.json",
    ".github/copilot-instructions.md", ".cursor/rules/family-bridge.mdc",
) + tuple(f".agents/skills/{name}/{file}" for name in SKILLS
          for file in ("SKILL.md", "agents/openai.yaml"))

def validate(root=ROOT):
    errors = []
    texts = {}
    for rel in REQUIRED:
        path = root / rel
        if not path.is_file():
            errors.append(f"Missing required file: {rel}")
        else:
            texts[rel] = path.read_text(encoding="utf-8")
    if errors:
        return errors

    # Validate relative file links in this document set. Fragment/render validation
    # remains separate; public URL availability is not tested in CI.
    for rel, content in texts.items():
        if not rel.endswith((".md", ".mdc")):
            continue
        if "[TODO" in content:
            errors.append(f"Unfilled template: {rel}")
        if len(re.findall(r"^\x60\x60\x60", content, re.M)) % 2:
            errors.append(f"Unclosed fenced block: {rel}")
        for target in re.findall(r"\]\(([^)]+)\)", content):
            target = target.split("#", 1)[0]
            if not target or re.match(r"[a-zA-Z]+:", target):
                continue
            if not ((root / rel).parent / target).is_file():
                errors.append(f"Broken local link in {rel}: {target}")
        for line_no, line in enumerate(content.splitlines(), 1):
            # Do not print candidate credential values, even on failure.
            if re.search(r"(?:ghp_|github_pat_)[A-Za-z0-9_]{30,}", line):
                errors.append(f"Credential-like value in {rel}:{line_no}")

    for name in SKILLS:
        rel = f".agents/skills/{name}/SKILL.md"
        content = texts[rel]
        match = re.match(r"^---\n(.*?)\n---\n", content, re.S)
        if not match:
            errors.append(f"Missing YAML frontmatter: {rel}")
            continue
        fields = dict(re.findall(r"^(name|description): (.+)$", match[1], re.M))
        if fields.get("name") != name or not fields.get("description"):
            errors.append(f"Invalid name/description: {rel}")
        metadata = texts[f".agents/skills/{name}/agents/openai.yaml"]
        if f"${name}" not in metadata:
            errors.append(f"Missing skill name in default prompt: {name}")

    required_refs = [f".agents/skills/{name}/SKILL.md" for name in SKILLS]
    required_refs += ["docs/engineering/dsa-rules.md", "docs/security/security-rules.md"]
    for rel in ("AGENTS.md", ".github/copilot-instructions.md",
                ".cursor/rules/family-bridge.mdc"):
        for ref in required_refs:
            if ref not in texts[rel]:
                errors.append(f"Instruction not wired in {rel}: {ref}")
    if "alwaysApply: true" not in texts[".cursor/rules/family-bridge.mdc"]:
        errors.append("Cursor rule must be alwaysApply")

    try:
        register = json.loads(texts["docs/security/control-register.json"])
        controls = register["controls"]
        ids = [item["id"] for item in controls]
        expected = [f"SEC-{i:02d}" for i in range(1, 31)]
        if sorted(ids) != expected:
            errors.append("Security register must contain SEC-01..SEC-30 exactly once")
        rule_ids = re.findall(r"^\| (SEC-\d{2}) \|",
                              texts["docs/security/security-rules.md"], re.M)
        if sorted(rule_ids) != expected:
            errors.append("Security rule table/register IDs do not match")
        valid_status = {"NOT_IMPLEMENTED", "PARTIAL", "IMPLEMENTED_UNVERIFIED",
                        "VERIFIED", "NOT_APPLICABLE_WITH_REASON"}
        for control in controls:
            if control.get("status") not in valid_status:
                errors.append(f"Invalid control status: {control.get('id')}")
            for field in ("reason", "next_step", "owner_role", "evidence"):
                if field not in control or (field != "evidence" and not control[field]):
                    errors.append(f"Missing {field}: {control.get('id')}")
            if control.get("status") == "VERIFIED" and not control.get("evidence"):
                errors.append(f"Verified without evidence: {control.get('id')}")
    except (ValueError, KeyError, TypeError):
        errors.append("Invalid security control register structure")

    for i in range(1, 16):
        if f"| F{i:02d} |" not in texts["docs/data/erd.md"]:
            errors.append(f"Missing ERD feature mapping F{i:02d}")
    return errors

if __name__ == "__main__":
    problems = validate()
    if problems:
        for problem in problems:
            print(problem, file=sys.stderr)
        raise SystemExit(1)
    print("Agent documents OK: files, relative links, skill metadata, rule wiring, SEC register and feature mapping.")
    print("This does not verify runtime, diagram rendering, source URLs, security or agent obedience.")
