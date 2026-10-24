"""
Settings for the Pfuma Mbiri.

All secrets come from environment variables (loaded from .env via
python-dotenv). Nothing secret is hard-coded here.
"""
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

import os

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def env_str(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def env_int(name: str, default: int = 0) -> int:
    try:
        return int(os.getenv(name, "").strip() or default)
    except (TypeError, ValueError):
        return default


# --- Core ---
SECRET_KEY = env_str("SECRET_KEY", "insecure-dev-key-change-me")
DEBUG = env_bool("DEBUG", True)
ALLOWED_HOSTS = [h.strip() for h in env_str("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if h.strip()]

# HTTPS-ready: set ENFORCE_TLS=1 behind TLS to switch on secure cookies,
# SSL redirect and HSTS.
ENFORCE_TLS = env_bool("ENFORCE_TLS", False)
SECURE_SSL_REDIRECT = ENFORCE_TLS
SESSION_COOKIE_SECURE = ENFORCE_TLS
CSRF_COOKIE_SECURE = ENFORCE_TLS
SECURE_HSTS_SECONDS = 31536000 if ENFORCE_TLS else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = ENFORCE_TLS
SECURE_HSTS_PRELOAD = ENFORCE_TLS

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # third-party
    "rest_framework",
    "corsheaders",
    "django_q",
    # local
    "core",
    "accounts",
    "intelligence",
    "sales",
    "inventory",
    "expenses",
    "compliance",
    "leads",
    "advisor",
    "notifications",
    "lender",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # tenancy: resolves request.business from the session after login
    "core.middleware.ActiveBusinessMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "core.context.active_business",
            ],
        },
    },
]

# --- Database ---
# PostgreSQL for production; SQLite acceptable for local development.
_database_url = env_str("DATABASE_URL")
if _database_url:
    try:
        import dj_database_url  # only needed when DATABASE_URL is set
    except ImportError as exc:  # pragma: no cover
        raise ImportError(
            "DATABASE_URL is set but 'dj-database-url' is not installed. "
            "Run: uv pip install dj-database-url  (or unset DATABASE_URL to use SQLite)"
        ) from exc
    DATABASES = {"default": dj_database_url.parse(_database_url)}
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

# --- Auth ---
AUTH_USER_MODEL = "accounts.User"
AUTHENTICATION_BACKENDS = [
    "accounts.backends.EmailOrPhoneBackend",
    "django.contrib.auth.backends.ModelBackend",
]
LOGIN_URL = "accounts:login"
LOGIN_REDIRECT_URL = "core:home"
LOGOUT_REDIRECT_URL = "accounts:login"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# --- Internationalisation ---
LANGUAGE_CODE = "en-us"
TIME_ZONE = env_str("TIME_ZONE", "Africa/Harare")
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATICFILES_DIRS = [BASE_DIR / "static"] if (BASE_DIR / "static").exists() else []
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}

# Browser origins allowed to post forms / AJAX (the Angular frontend)
CSRF_TRUSTED_ORIGINS = [
    o for o in env_str("CSRF_TRUSTED_ORIGINS").split(",") if o
]

# CORS for the Angular dev server (Docker path is same-origin via nginx)
CORS_ALLOWED_ORIGINS = CSRF_TRUSTED_ORIGINS
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    "accept",
    "accept-encoding",
    "authorization",
    "content-type",
    "dnt",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
    "x-business-id",
]

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- WSGI / API ---
WSGI_APPLICATION = "config.wsgi.application"

# DRF (service-layer API used by the web UI and future channels) ---
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "EXCEPTION_HANDLER": "core.exceptions.tenancy_aware_handler",
}

# --- Q cluster (reminders, scheduled calculations, offline fiscal sync) ---
Q_CLUSTER = {
    "name": "smebos",
    "workers": 2,
    "timeout": 90,
    "retry": 120,
    "queue_limit": 50,
    "bulk": 10,
    "orm": "default",
}

# --- Intelligence: Gemma via Google Vertex AI (API-key / express mode) ---
GOOGLE_API_KEY = env_str("GOOGLE_API_KEY")
GEMMA_MODEL = env_str("GEMMA_MODEL", "gemma-3-27b-it")
VERTEX_PROJECT = env_str("VERTEX_PROJECT")
VERTEX_LOCATION = env_str("VERTEX_LOCATION", "global")
GEMMA_TIMEOUT = env_int("GEMMA_TIMEOUT", 30)
GEMMA_MAX_OUTPUT_TOKENS = env_int("GEMMA_MAX_OUTPUT_TOKENS", 0)  # 0 = uncapped
INTELLIGENCE_ENABLED = env_bool("INTELLIGENCE_ENABLED", True)
INTELLIGENCE_LLM_PHRASING = env_bool("INTELLIGENCE_LLM_PHRASING", True)

# --- ZIMRA FDMS ---
FDMS_MODE = env_str("FDMS_MODE", "MOCK")  # MOCK | TEST | PRODUCTION

# --- Sessions ---
SESSION_COOKIE_AGE = timedelta(days=14).total_seconds()
