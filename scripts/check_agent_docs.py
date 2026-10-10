"""Check repository instruction wiring; never claim runtime/security compliance."""
from pathlib import Path
import hashlib
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SKILLS = ("family-bridge-dsa", "family-bridge-security", "family-bridge-ui")
TASTE_DIR = ".agents/skills/design-taste-frontend"
ALL_SKILLS = SKILLS + ("design-taste-frontend",)
REQUIRED = (
    "AGENTS.md", "SECURITY.md", "docs/project-scope.md",
    "docs/engineering/dsa-rules.md", "docs/product/four-week-flow.md",
    "docs/product/admin-capabilities.md", "docs/data/erd.md",
    "docs/security/security-rules.md", "docs/security/threat-model.md",
    "docs/security/verification-plan.md", "docs/security/incident-response.md",
    "docs/security/sources.md", "docs/security/control-register.json",
    ".github/copilot-instructions.md", ".cursor/rules/family-bridge.mdc",
    "README.md", "docs/engineering/agent-guide.md",
    "docs/engineering/ui-rules.md", "docs/engineering/taste-skill-integration.md",
    f"{TASTE_DIR}/SKILL.md", f"{TASTE_DIR}/LICENSE", f"{TASTE_DIR}/upstream.json",
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

    for name in ALL_SKILLS:
        rel = f".agents/skills/{name}/SKILL.md"
        content = texts[rel]
        match = re.match(r"^---\n(.*?)\n---\n", content, re.S)
        if not match:
            errors.append(f"Missing YAML frontmatter: {rel}")
            continue
        fields = dict(re.findall(r"^(name|description): (.+)$", match[1], re.M))
        if fields.get("name") != name or not fields.get("description"):
            errors.append(f"Invalid name/description: {rel}")
        # Do not synthesize or require UI metadata in the unchanged vendor copy.
        if name in SKILLS:
            metadata = texts[f".agents/skills/{name}/agents/openai.yaml"]
            if f"${name}" not in metadata:
                errors.append(f"Missing skill name in default prompt: {name}")

    # Check vendor bytes and provenance without installing packages or using network.
    try:
        upstream = json.loads(texts[f"{TASTE_DIR}/upstream.json"])
        if upstream["repository"] != "https://github.com/Leonxlnx/taste-skill":
            errors.append("Unexpected Taste upstream repository")
        if not re.fullmatch(r"[0-9a-f]{40}", upstream["commit"]):
            errors.append("Invalid Taste pinned commit")
        if upstream["skill_name"] != "design-taste-frontend" or upstream["license"] != "MIT":
            errors.append("Invalid Taste name/license provenance")
        if upstream["version"] != "v2 (experimental)":
            errors.append("Taste v2 must be identified as experimental")
        expected_files = {"SKILL.md": "skills/taste-skill/SKILL.md", "LICENSE": "LICENSE"}
        if set(upstream["files"]) != set(expected_files):
            errors.append("Taste manifest must describe only SKILL.md and LICENSE")
        provenance_doc = texts["docs/engineering/taste-skill-integration.md"]
        if upstream["commit"] not in provenance_doc:
            errors.append("Taste commit missing from provenance document")
        for filename, source in expected_files.items():
            entry = upstream["files"][filename]
            checksum = entry["sha256"]
            if entry["upstream_path"] != source or not re.fullmatch(r"[0-9a-f]{64}", checksum):
                errors.append(f"Invalid Taste file provenance: {filename}")
            if hashlib.sha256((root / TASTE_DIR / filename).read_bytes()).hexdigest() != checksum:
                errors.append(f"Taste checksum mismatch: {filename}")
            if checksum not in provenance_doc:
                errors.append(f"Taste checksum missing from provenance document: {filename}")
        license_text = texts[f"{TASTE_DIR}/LICENSE"]
        if (upstream["copyright"] != "Copyright (c) 2026 Leonxlnx"
                or upstream["copyright"] not in license_text or "MIT License" not in license_text):
            errors.append("Taste MIT/copyright notice missing or changed")
    except (ValueError, KeyError, TypeError, OSError):
        errors.append("Invalid Taste provenance manifest")

    required_refs = [f".agents/skills/{name}/SKILL.md" for name in ALL_SKILLS]
    required_refs += ["docs/engineering/dsa-rules.md", "docs/security/security-rules.md",
                      "docs/engineering/ui-rules.md", "docs/engineering/taste-skill-integration.md"]
    for rel in ("AGENTS.md", ".github/copilot-instructions.md",
                ".cursor/rules/family-bridge.mdc"):
        for ref in required_refs:
            if ref not in texts[rel]:
                errors.append(f"Instruction not wired in {rel}: {ref}")
        if "chore/taste-skill-integration" not in texts[rel] or "Draft PR" not in texts[rel]:
            errors.append(f"Taste integration branch/review exception not wired in {rel}")
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
    print("Agent documents OK: files, relative links, skill metadata, rule wiring, Taste provenance/checksums/MIT, SEC register and feature mapping.")
    print("This does not verify runtime, diagram rendering, source URLs, security or agent obedience.")
