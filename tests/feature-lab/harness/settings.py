"""Feature-lab harness settings — TEST ONLY.

- SQLite by default (local checks only; never claimed as MySQL evidence).
- Set FB_TEST_DB=mysql with a reachable MySQL/MariaDB to run the gated
  race/concurrency suites; those suites are skipped with an explicit reason
  otherwise and reported NOT_RUN in feature reports.
- AUTH_USER_MODEL points at the test-only labusers.User (UUID pk, mirrors
  backend/accounts User shape). At integration (B18) feature apps are wired
  to accounts.User via settings.AUTH_USER_MODEL; migrations serialize the
  swappable reference, so no migration rewrite is needed.
- Production guard: this settings module refuses to run in production env.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
REPO_ROOT = BASE_DIR.parents[1]
PACKAGES_DIR = REPO_ROOT / "packages"
FEATURE_LAB_DIR = REPO_ROOT / "tests" / "feature-lab"

for candidate in (str(REPO_ROOT), str(PACKAGES_DIR), str(FEATURE_LAB_DIR)):
    if candidate not in sys.path:
        sys.path.insert(0, candidate)

DJANGO_ENV = os.getenv("DJANGO_ENV", "test")
if DJANGO_ENV == "production":
    raise RuntimeError("harness.settings is test-only; refusing production")

SECRET_KEY = os.getenv(
    "DJANGO_SECRET_KEY",
    "feature-lab-test-only-secret-key-not-for-production-use-000000000000",
)
DEBUG = DJANGO_ENV == "development"
ALLOWED_HOSTS = ["*"]  # test harness only (localhost preview + tests)

DJANGO_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.staticfiles",
    "harness",
]
THIRD_PARTY_APPS = ["rest_framework"]

# Features selected for this run, e.g. FB_FEATURES="f07_mood,f15_privacy"
_requested = [name.strip() for name in os.getenv("FB_FEATURES", "").split(",") if name.strip()]
VALID_LABELS = {
    "f01_identity", "f02_program", "f03_cards", "f04_ai", "f05_inbox",
    "f06_drafts", "f07_mood", "f08_journal", "f09_activities", "f10_signal",
    "f11_supporters", "f12_appointments", "f13_help", "f14_surveys",
    "f15_privacy", "admin_core", "ops_core",
}
unknown = [name for name in _requested if name not in VALID_LABELS]
if unknown:
    raise RuntimeError(f"FB_FEATURES contains unknown labels: {unknown}")

INSTALLED_APPS = (
    DJANGO_APPS + THIRD_PARTY_APPS
    + ["labusers"]
    + [f"family_bridge_features.{label}" for label in _requested]
)

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "harness.urls"
WSGI_APPLICATION = "harness.wsgi.application"
TEMPLATES = []

DB_ENGINE = os.getenv("FB_TEST_DB", "sqlite")
if DB_ENGINE == "sqlite":
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3",
                             "NAME": str(BASE_DIR / "feature-lab.sqlite3")}}
elif DB_ENGINE == "mysql":
    DATABASES = {"default": {
        "ENGINE": "django.db.backends.mysql",
        "NAME": os.getenv("FB_MYSQL_DB", "feature_lab"),
        "USER": os.getenv("FB_MYSQL_USER", "root"),
        "PASSWORD": os.getenv("FB_MYSQL_PASSWORD", ""),
        "HOST": os.getenv("FB_MYSQL_HOST", "127.0.0.1"),
        "PORT": os.getenv("FB_MYSQL_PORT", "3306"),
        "OPTIONS": {"charset": "utf8mb4"},
        "TEST": {"CHARSET": "utf8mb4", "COLLATION": "utf8mb4_unicode_ci"},
    }}
else:
    raise RuntimeError(f"FB_TEST_DB must be sqlite or mysql, got {DB_ENGINE}")

AUTH_USER_MODEL = "labusers.User"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["harness.auth.AlwaysChallengeAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "EXCEPTION_HANDLER": "family_bridge_core.drf.fb_exception_handler",
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.ScopedRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {"invite_claim": "30/hour", "send_message": "60/hour"},
    "UNAUTHENTICATED_USER": None,
}

USE_TZ = True
TIME_ZONE = "Asia/Ho_Chi_Minh"
USE_I18N = False
STATIC_URL = "/static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Harness-local knobs (test only, never production defaults)
FEATURE_LAB = {
    "features": _requested,
    "db_engine": DB_ENGINE,
}
