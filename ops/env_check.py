#!/usr/bin/env python3
"""B17 — production environment validator (read-only, run in CI + deploy).

Checks the hardening contract from master prompt §9.1 without ever
printing secret VALUES: it validates presence/shape and exits non-zero
with the list of problems. Usage:  python3 ops/env_check.py [--env-file .env]
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path


def load_env_file(path: Path) -> dict:
    values = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


REQUIRED = {
    "DJANGO_SECRET_KEY": "server secret (32+ chars, not the harness default)",
    "DJANGO_DEBUG": "must be explicitly 'False' in production",
    "DJANGO_ALLOWED_HOSTS": "comma-separated exact hostnames",
    "CORS_ALLOWED_ORIGINS": "comma-separated https origins",
    "ZALO_APP_ID": "parent app id (external-inputs)",
    "ZALO_APP_SECRET": "server-only secret",
    "MYSQL_HOST": "runtime db (least-privilege user)",
    "MYSQL_DB": "runtime db name",
    "MYSQL_USER": "runtime db user (NOT the migration account)",
}
FORBIDDEN_DEFAULTS = {
    "DJANGO_SECRET_KEY": "feature-lab-test-only-secret-key",
}
TRUE_VALUES = {"true", "1", "yes"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", default=".env")
    args = parser.parse_args()
    env = dict(os.environ)
    if Path(args.env_file).exists():
        env.update(load_env_file(Path(args.env_file)))

    problems: list[str] = []
    for key, why in REQUIRED.items():
        value = env.get(key, "")
        if not value:
            problems.append(f"MISSING {key} — {why}")
            continue
        if key in FORBIDDEN_DEFAULTS and FORBIDDEN_DEFAULTS[key] in value:
            problems.append(f"INSECURE {key} uses a known default value")
        if key == "DJANGO_DEBUG" and value.lower() in TRUE_VALUES:
            problems.append("INSECURE DJANGO_DEBUG must be False in production")
        if key == "DJANGO_SECRET_KEY" and len(value) < 32:
            problems.append("WEAK DJANGO_SECRET_KEY (< 32 chars)")
        if key == "CORS_ALLOWED_ORIGINS":
            origins = [o.strip() for o in value.split(",") if o.strip()]
            if any(not o.startswith("https://") for o in origins):
                problems.append("INSECURE CORS origins must be https://")
        if key == "MYSQL_USER" and value.lower() in ("root", "admin"):
            problems.append("INSECURE MYSQL_USER must be least-privilege")

    if problems:
        print("ENV CHECK FAILED:")
        for problem in problems:
            print(f"  - {problem}")
        return 1
    print("ENV CHECK OK (values not printed by design)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
