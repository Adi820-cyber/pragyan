"""
Django settings for Reskure.

Security-relevant values come from the environment. In DEBUG (local development)
a throwaway secret key is generated per process; with DEBUG off the app refuses
to start without SECRET_KEY and ALLOWED_HOSTS.
"""

from pathlib import Path
import os

from django.core.exceptions import ImproperlyConfigured
from django.core.management.utils import get_random_secret_key

try:  # optional: load backend/.env if present
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:  # pragma: no cover
    pass

BASE_DIR = Path(__file__).resolve().parent.parent


def _env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


DEBUG = os.getenv("DEBUG", "False").lower() in ("true", "1", "yes")

SECRET_KEY = os.getenv("SECRET_KEY", "")
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = get_random_secret_key()
    else:
        raise ImproperlyConfigured("SECRET_KEY must be set when DEBUG is off.")

ALLOWED_HOSTS = _env_list("ALLOWED_HOSTS", "localhost,127.0.0.1,.ngrok-free.dev,.ngrok-free.app,.ngrok.io,.onrender.com,*" if DEBUG else "*")
if not DEBUG and not ALLOWED_HOSTS:
    raise ImproperlyConfigured("ALLOWED_HOSTS must be set when DEBUG is off.")

# Application definition
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    "rest_framework",
    "rest_framework.authtoken",
    "corsheaders",
    "drf_spectacular",

    "apps.core.apps.CoreConfig",
    "apps.authorization.apps.AuthorizationConfig",
    "apps.risk.apps.RiskConfig",
    "apps.compliance.apps.ComplianceConfig",
    "apps.evidence.apps.EvidenceConfig",
    "apps.workflows.apps.WorkflowsConfig",
    "apps.assets.apps.AssetsConfig",
    "apps.secops.apps.SecopsConfig",
    "apps.ai_audit.apps.AiAuditConfig",
    "apps.network.apps.NetworkConfig",
    "apps.ciso_assistant.apps.CisoAssistantConfig",
    "apps.cloud_security.apps.CloudSecurityConfig",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.core.middleware.TenantContextMiddleware",
]

ROOT_URLCONF = "reskure.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "reskure.wsgi.application"

# Database: SQLite for the local demo, PostgreSQL for shared pilots.
DB_ENGINE = os.getenv("DB_ENGINE", "sqlite")

if os.getenv("DATABASE_URL"):
    try:
        import dj_database_url
        DATABASES = {"default": dj_database_url.config(conn_max_age=600, ssl_require=False)}
    except Exception:
        DATABASES = {
            "default": {
                "ENGINE": "django.db.backends.sqlite3",
                "NAME": BASE_DIR / "db.sqlite3",
            }
        }
elif DB_ENGINE == "postgresql":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.getenv("DB_NAME", "reskure"),
            "USER": os.getenv("DB_USER", "reskure_admin"),
            "PASSWORD": os.environ["DB_PASSWORD"],
            "HOST": os.getenv("DB_HOST", "localhost"),
            "PORT": os.getenv("DB_PORT", "5432"),
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# Uploaded datasets and evidence live in private storage and are never served
# directly; downloads go through authorised API endpoints.
ALLOW_DEMO_SEED = os.getenv("ALLOW_DEMO_SEED", str(DEBUG)).lower() in ("true", "1", "yes")
AUDIT_RUN_TIMEOUT_SECONDS = int(os.getenv("AUDIT_RUN_TIMEOUT_SECONDS", "900"))
PRIVATE_MEDIA_ROOT = Path(os.getenv("PRIVATE_MEDIA_ROOT", str(BASE_DIR / "private_media")))
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(20 * 1024 * 1024)))
MAX_DATASET_ROWS = int(os.getenv("MAX_DATASET_ROWS", "200000"))
DATA_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_BYTES
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.core.auth.TenantTokenAuthentication",
        "apps.core.auth.TenantSessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_FILTER_BACKENDS": [
        "apps.core.filters.TenantFilterBackend",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.ScopedRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {"login": "10/min"},
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Reskure AI Audit API",
    "DESCRIPTION": "Responsible AI governance and compliance toolkit: bias, drift, explainability and DPDP/GDPR readiness.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    # API documentation is public in local development only.
    "SERVE_PERMISSIONS": [
        "rest_framework.permissions.AllowAny" if DEBUG else "rest_framework.permissions.IsAdminUser"
    ],
}

# CORS: explicit origins only.
CORS_ALLOWED_ORIGINS = _env_list("CORS_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
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
    "x-tenant-id",
]
CSRF_TRUSTED_ORIGINS = _env_list("CSRF_TRUSTED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,https://*.ngrok-free.dev,https://*.ngrok-free.app,https://*.ngrok.io,https://*.onrender.com" if DEBUG else "https://*.onrender.com")

if not DEBUG:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
