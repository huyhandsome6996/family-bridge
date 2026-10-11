#!/usr/bin/env python3
"""Feature-lab test harness manage.py (TEST ONLY — not production).

This harness exists solely so each feature branch can run its own module
tests in isolation with synthetic data. It is never deployed and never
serves real users. Production backend lives in backend/ (Agent A's branch,
integrated later at B18).
"""
import os
import sys


def main() -> None:
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    packages_dir = os.path.join(repo_root, "packages")
    for path in (repo_root, packages_dir):
        if path not in sys.path:
            sys.path.insert(0, path)
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "harness.settings")
    os.environ.setdefault("DJANGO_ENV", "test")
    from django.core.management import execute_from_command_line
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
