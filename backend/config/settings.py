"""API foundation. Production requires explicit secrets and durable MySQL.

B18 wiring: the integrated feature packages (packages/family_bridge_features/*)
are mounted on this real backend — registry-driven URLs, F01 bearer-session
authentication, scoped throttle rates and the FamilyBridgeError envelope.
Missing packages fail loudly at startup (no silent partial wiring).
"""
import os
import sys
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BASE_DIR.parent
PACKAGES_DIR = REPO_ROOT / "packages"
for _candidate in (str(REPO_ROOT), str(PACKAGES_DIR)):
    if _candidate not in sys.path:
        sys.path.insert(0, _candidate)

load_dotenv(BASE_DIR / ".env", override=False)


def csv_env(name, default=""):
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


DJANGO_ENV = os.getenv("DJANGO_ENV", "production")
if DJANGO_ENV not in {"development", "test", "production"}:
    raise ImproperlyConfigured("DJANGO_ENV must be development, test or production")
DEBUG = DJANGO_ENV == "development"
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "")
if not SECRET_KEY:
    if DJANGO_ENV == "production":
        raise ImproperlyConfigured("DJANGO_SECRET_KEY is required")
    SECRET_KEY = "development-only-family-bridge-do-not-deploy-this-key"
if DJANGO_ENV == "production" and len(SECRET_KEY) < 50:
    raise ImproperlyConfigured("Use a random DJANGO_SECRET_KEY of at least 50 characters")

ALLOWED_HOSTS = csv_env("DJANGO_ALLOWED_HOSTS")
if DJANGO_ENV != "production":
    ALLOWED_HOSTS += ["localhost", "127.0.0.1", "testserver"]
if "*" in ALLOWED_HOSTS:
    raise ImproperlyConfigured("Use explicit DJANGO_ALLOWED_HOSTS")

INSTALLED_APPS = [
    "django.contrib.auth", "django.contrib.contenttypes", "django.contrib.sessions",
    "rest_framework", "corsheaders", "accounts", "core",
]

# --- B18 feature wiring (explicit allowlist, no plugin discovery) -----------
# Labels mirror family_bridge_core.registry.FEATURES backend.app_label.
# FB_FEATURES may narrow the set (ops/rollback); unknown labels refuse to
# boot, absent packages refuse to boot — wiring is never silently partial.
FEATURE_APP_LABELS = {
    "f01_identity", "f02_program", "f03_cards", "f04_ai", "f05_inbox",
    "f06_drafts", "f07_mood", "f08_journal", "f09_activities", "f10_signal",
    "f11_supporters", "f12_appointments", "f13_help", "f14_surveys",
    "f15_privacy", "admin_core",
}
import importlib.util as _ilu  # noqa: E402  (placement fixed: after sys.path)


def _label_present(label: str) -> bool:
    try:
        return _ilu.find_spec(f"family_bridge_features.{label}") is not None
    except (ImportError, ValueError):
        return False


_requested_features = [item.strip() for item in csv_env("FB_FEATURES", ",".join(sorted(FEATURE_APP_LABELS)))]
_unknown = [label for label in _requested_features if label not in FEATURE_APP_LABELS]
if _unknown:
    raise ImproperlyConfigured(f"FB_FEATURES contains unknown labels: {_unknown}")
_missing = [label for label in _requested_features if not _label_present(label)]
if _missing:
    raise ImproperlyConfigured(
        f"Feature packages missing from repository (packages/family_bridge_features): {_missing}")
FEATURE_APPS = _requested_features
INSTALLED_APPS += [f"family_bridge_features.{label}" for label in FEATURE_APPS]

# Zalo verification credentials (SEC-01): read from environment only. The
# verifier fails closed when either value is absent — login returns
# module_unavailable instead of pretending to authenticate.
ZALO_APP_ID = os.getenv("ZALO_APP_ID", "")
ZALO_APP_SECRET = os.getenv("ZALO_APP_SECRET", "")
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"
AUTH_USER_MODEL = "accounts.User"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
LANGUAGE_CODE = "vi"
TIME_ZONE = "Asia/Ho_Chi_Minh"
USE_I18N = True
USE_TZ = True

DB_ENGINE = os.getenv("DB_ENGINE", "mysql")
if DB_ENGINE == "sqlite" and DJANGO_ENV != "production":
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "db.sqlite3"}}
elif DB_ENGINE == "mysql":
    db_options = {
        "charset": "utf8mb4",
        "init_command": "SET sql_mode='STRICT_TRANS_TABLES'",
        "connect_timeout": 10,
    }
    if os.getenv("MYSQL_SSL_CA"):
        db_options["ssl"] = {"ca": os.environ["MYSQL_SSL_CA"]}
        db_options["ssl_mode"] = "VERIFY_IDENTITY"
    DATABASES = {"default": {
        "ENGINE": "django.db.backends.mysql",
        "NAME": os.getenv("MYSQL_DATABASE", "family_bridge"),
        "USER": os.getenv("MYSQL_USER", "family_bridge"),
        "PASSWORD": os.getenv("MYSQL_PASSWORD", ""),
        "HOST": os.getenv("MYSQL_HOST", "127.0.0.1"),
        "PORT": os.getenv("MYSQL_PORT", "3306"),
        "CONN_MAX_AGE": 60,
        "CONN_HEALTH_CHECKS": True,
        "OPTIONS": db_options,
    }}
else:
    raise ImproperlyConfigured("Production requires MySQL; SQLite is only for local checks")

CORS_ALLOWED_ORIGINS = csv_env("CORS_ALLOWED_ORIGINS")
if DJANGO_ENV == "development":
    CORS_ALLOWED_ORIGINS += ["http://localhost:3000", "http://127.0.0.1:3000"]
CORS_ALLOW_CREDENTIALS = False
CORS_URLS_REGEX = r"^/api/.*$"
REST_FRAMEWORK = {
    # B18: bearer application sessions issued by F01 after server-side Zalo
    # verification (contract rule: never trust client-provided identity).
    # simplejwt stays installed for the scaffold but issues no tokens here.
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "family_bridge_features.f01_identity.auth.FBSDSessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "EXCEPTION_HANDLER": "core.exceptions.api_exception_handler",
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    # Platform defaults pending the US-004 baseline validation catalog (DEC-17).
    # Health/ready endpoints are exempt via @throttle_classes([]) so monitoring
    # is never rate-limited; revisit rates per endpoint in US-004.
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    # Scoped rates = B18 integration union (f04 ai_refine + f14 survey_report
    # plus the baseline invite_claim/send_message), identical to the harness.
    "DEFAULT_THROTTLE_RATES": {
        "anon": "60/min", "user": "120/min",
        "invite_claim": "30/hour", "send_message": "60/hour",
        "ai_refine": "30/hour", "survey_report": "20/hour",
    },
}
SIMPLE_JWT = {"ACCESS_TOKEN_LIFETIME": timedelta(minutes=15)}
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

SECURE_SSL_REDIRECT = DJANGO_ENV == "production"
# Render terminates TLS and supplies this header. Use only behind a trusted proxy.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = DJANGO_ENV == "production"
CSRF_COOKIE_SECURE = DJANGO_ENV == "production"
SECURE_HSTS_SECONDS = 3600 if DJANGO_ENV == "production" else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = False
SECURE_HSTS_PRELOAD = False
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

# Console-only logging (SEC-22/SEC-27): plain level/name/message lines, no request
# bodies, no tokens, no DB credentials and no stack traces with DSN details.
# Note: never log request bodies, tokens, DB credentials or stack traces containing DSN.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"plain": {"format": "{levelname} {name} {message}", "style": "{"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "plain"}},
    "root": {"handlers": ["console"], "level": os.getenv("DJANGO_LOG_LEVEL", "INFO")},
    "loggers": {
        "django.request": {"handlers": ["console"], "level": "ERROR", "propagate": False},
        "django.security": {"handlers": ["console"], "level": "WARNING", "propagate": False},
    },
}
