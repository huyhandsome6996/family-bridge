#!/usr/bin/env bash
# Run ONE feature's tests in the feature-lab harness (B00 contract).
# Usage: bash tests/feature-lab/scripts/test_feature.sh f07_mood
#   - SQLite by default: set FB_TEST_DB=mysql to run MySQL-gated suites.
# Each feature branch documents this exact command in its report so Huy and
# reviewers can run the branch from a clean checkout.
set -euo pipefail
FEATURE="${1:?usage: test_feature.sh <app_label, e.g. f07_mood>}"
cd "$(dirname "$0")/.."
export DJANGO_SETTINGS_MODULE=harness.settings
export DJANGO_ENV=test
export FB_FEATURES="$FEATURE"
python manage.py makemigrations --check --dry-run >/dev/null 2>&1 || true
python manage.py check --fail-level WARNING
python manage.py test "family_bridge_features.$FEATURE" -v 1
