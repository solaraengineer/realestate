"""
Django settings for settings project.
"""

from pathlib import Path
import base64
import os

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent
RATELIMIT_IP_META_KEY = "REMOTE_ADDR"
AUTH_USER_MODEL = 'logic.User'
LOGIN_URL = '/'
STRIPE_SECRET_KEY = os.getenv('STRIPE_SECRET_KEY')
STRIPE_PUBLIC_KEY = os.getenv('STRIPE_PUBLIC_KEY')
STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET')

SECRET_KEY = os.getenv('DJANGO_SECRET_KEY')

DEBUG = True

ALLOWED_HOSTS = ['*']

STATIC_URL = '/static/'

STATICFILES_DIRS = [
    BASE_DIR / "static",
]

STATIC_ROOT = BASE_DIR / "staticfiles"

RECAPTCHA_SECRET_KEY = os.getenv('RECAPTCHA_SECRET_KEY')

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("DB_NAME"),
        "USER": os.getenv("DB_USER"),
        "PASSWORD": os.getenv("DB_PASSWORD"),
        "HOST": os.getenv("DB_HOST"),
        "PORT": os.getenv("DB_PORT", "5432"),
        "OPTIONS": {
            "sslmode": "require",
        },
    }
}

INSTALLED_APPS = [
    'logic',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'channels',
]

ASGI_APPLICATION = "settings.asgi.application"

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [(os.getenv("REDIS_HOST", "redis"), int(os.getenv("REDIS_PORT", 6379)))],
        },
    },
}
CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": f"redis://{os.getenv('REDIS_HOST', 'redis')}:{os.getenv('REDIS_PORT', 6379)}/0",
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
        },
    }
}

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'settings.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'settings.wsgi.application'

AUTH_PASSWORD_VALIDATORS = []

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
CSRF_TRUSTED_ORIGINS = ['https://cryptoearthcoin.com', 'https://www.cryptoearthcoin.com', 'http://3.120.82.242', 'https://3.120.82.242', 'http://18.156.60.42', 'https://18.156.60.42']
SECURE_SSL_REDIRECT = False
USE_X_FORWARDED_HOST = True

# ═══════════════════════════════════════════════════════════════════════════
# Celery Configuration
# ═══════════════════════════════════════════════════════════════════════════
CELERY_BROKER_URL = f"redis://{os.getenv('REDIS_HOST', 'redis')}:{os.getenv('REDIS_PORT', 6379)}/1"
CELERY_RESULT_BACKEND = f"redis://{os.getenv('REDIS_HOST', 'redis')}:{os.getenv('REDIS_PORT', 6379)}/1"
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = 'UTC'
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 30 * 60  # 30 minutes

# ═══════════════════════════════════════════════════════════════════════════
# Email Configuration (Google SMTP)
# ═══════════════════════════════════════════════════════════════════════════
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp.gmail.com'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = os.getenv('GOOGLE_SMTP_USER', '')
EMAIL_HOST_PASSWORD = os.getenv('GOOGLE_SMTP_PASSWORD', '')  # App password
DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL', 'noreply@cryptoearthcoin.com')
EMAIL_SUBJECT_PREFIX = '[CryptoEarthCoin] '

# ═══════════════════════════════════════════════════════════════════════════
# JWT Configuration (RSA-3072 with RS256)
# ═══════════════════════════════════════════════════════════════════════════
JWT_ALGORITHM = "RS256"  # RSA with SHA-256
JWT_ISSUER = "cryptoearthcoin.com"

# RSA-3072 Private Key (keep secret!)
# Generate with: openssl genrsa -out private.pem 3072
JWT_PRIVATE_KEY = base64.b64decode(os.getenv('JWT_PRIVATE_KEY')).decode('utf-8')
JWT_PUBLIC_KEY = base64.b64decode(os.getenv('JWT_PUBLIC_KEY')).decode('utf-8')

print(">>> DJANGO LOADED FROM:", BASE_DIR)

