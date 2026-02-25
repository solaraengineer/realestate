import json
import re
from json import JSONDecodeError

from django.contrib.auth import authenticate, login as auth_login, logout as django_logout, get_user_model
from django.db import transaction
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from django.views.decorators.http import require_POST, require_GET
from django_ratelimit.decorators import ratelimit
import html
from django.contrib.auth.decorators import login_required
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from .forms import LoginForm, RegisterForm
from .views_jwt import generate_jwt_token, require_jwt
from .views_emails import send_welcome_email

User = get_user_model()

SAFE_TEXT = re.compile(r'^[A-Za-z0-9 !@#.\-]*$')
SAFE_USERNAME = re.compile(r'^[A-Za-z0-9!@#.\-]{3,30}$')
SAFE_EMAIL = re.compile(r'^[A-Za-z0-9.!#\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$')
SAFE_POSTAL = re.compile(r'^[A-Za-z0-9 \-]{2,10}$')
SAFE_VAT = re.compile(r'^[A-Za-z0-9\-]{2,11}$')


def validate_field(value, pattern, max_len):
    if not value:
        return True
    if len(value) > max_len:
        return False
    if not pattern.match(value):
        return False
    return True


def sanitize(val, max_len=255):
    if val is None:
        return ''
    val = str(val).strip()
    val = html.escape(val)
    val = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', val)
    return val[:max_len]


@ratelimit(key='ip', rate='10/m', block=True)
@require_POST
@csrf_protect
@ensure_csrf_cookie
def api_login(request):
    try:
        data = json.loads(request.body)
    except ValueError:
        return JsonResponse({"ok": False, "error": "INVALID_JSON"}, status=400)

    form = LoginForm(data)
    if not form.is_valid():
        return JsonResponse({"ok": False, "error": "MISSING_CREDENTIALS"}, status=400)

    cd = form.cleaned_data
    email = cd['email']
    password = cd['password']

    if not SAFE_EMAIL.match(email):
        return JsonResponse({"ok": False, "error": "INVALID_EMAIL_FORMAT"}, status=400)

    user = authenticate(request, username=email, password=password)

    if not user:
        try:
            u = User.objects.get(email__iexact=email)
            user = authenticate(request, username=u.username, password=password)
        except User.DoesNotExist:
            pass

    if not user:
        return JsonResponse({"ok": False, "error": "INVALID_CREDENTIALS"}, status=401)

    if not user.is_active:
        return JsonResponse({"ok": False, "error": "INACTIVE"}, status=403)

    auth_login(request, user)
    token = generate_jwt_token(user)

    return JsonResponse({
        "ok": True,
        "token": token,
        "user": {
            "id": str(user.id),
            "username": user.username,
            "email": user.email,
        }
    })


@ratelimit(key='ip', rate='5/m', block=True)
@require_POST
@csrf_protect
@ensure_csrf_cookie
def api_register(request):
    try:
        data = json.loads(request.body)
    except JSONDecodeError:
        return JsonResponse({"ok": False, "error": "INVALID_JSON"}, status=400)

    raw_username = data.get('username', '')
    raw_email = data.get('email', '')

    if not SAFE_USERNAME.match(raw_username):
        return JsonResponse({"ok": False, "error": "INVALID_USERNAME_FORMAT"}, status=400)

    if not SAFE_EMAIL.match(raw_email):
        return JsonResponse({"ok": False, "error": "INVALID_EMAIL_FORMAT"}, status=400)

    form = RegisterForm(data)
    if not form.is_valid():
        errors_str = str(form.errors)
        if 'PASSWORD_MISMATCH' in errors_str:
            return JsonResponse({"ok": False, "error": "PASSWORD_MISMATCH"}, status=400)
        if 'EMAIL_EXISTS' in errors_str:
            return JsonResponse({"ok": False, "error": "EMAIL_EXISTS"}, status=400)
        if 'USERNAME_EXISTS' in errors_str:
            return JsonResponse({"ok": False, "error": "USERNAME_EXISTS"}, status=400)
        return JsonResponse({"ok": False, "error": "VALIDATION_ERROR"}, status=400)

    cd = form.cleaned_data
    username = cd['username']
    email = cd['email']
    password = cd['password']

    user = User.objects.create_user(username=username, email=email, password=password)
    auth_login(request, user)

    token = generate_jwt_token(user)

    send_welcome_email.delay(user.id)

    return JsonResponse({
        "ok": True,
        "token": token,
        "user": {
            "id": str(user.id),
            "username": user.username,
            "email": user.email,
        }
    }, status=201)


@ratelimit(key='ip', rate='30/m', block=True)
@require_POST
@csrf_protect
@ensure_csrf_cookie
def api_logout(request):
    django_logout(request)
    return JsonResponse({"ok": True})


@ratelimit(key='ip', rate='60/m', block=True)
@require_GET
@csrf_protect
@ensure_csrf_cookie
def api_whoami(request):
    if request.user.is_authenticated:
        u = request.user
        return JsonResponse({
            "ok": True,
            "user": {
                "id": str(u.id),
                "username": u.username,
                "email": u.email,
            }
        })
    return JsonResponse({"ok": False})


@ratelimit(key='ip', rate='60/m', block=True)
@require_GET
@csrf_protect
@ensure_csrf_cookie
@login_required
def api_profile(request):
    u = request.user
    return JsonResponse({
        "ok": True,
        "user": {
            "id": str(u.id),
            "username": u.username,
            "email": u.email,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "company_name": getattr(u, 'company_name', ''),
            "address": getattr(u, 'address', ''),
            "city": getattr(u, 'city', ''),
            "postal_code": getattr(u, 'postal_code', ''),
            "country": getattr(u, 'country', ''),
            "vat_number": getattr(u, 'vat_number', ''),
            "two_factor_enabled": getattr(u, 'two_factor_enabled', False),
        }
    })


@ratelimit(key='ip', rate='30/m', block=True)
@csrf_protect
@ensure_csrf_cookie
@require_jwt
def api_profile_update(request):
    if request.method == 'GET':
        user = request.user
        return JsonResponse({
            "ok": True,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "email": user.email,
            "address": getattr(user, 'address', ''),
            "city": getattr(user, 'city', ''),
            "postal_code": getattr(user, 'postal_code', ''),
            "country": getattr(user, 'country', ''),
            "company_name": getattr(user, 'company_name', ''),
            "vat_number": getattr(user, 'vat_number', ''),
            "two_factor_enabled": getattr(user, 'two_factor_enabled', False),
        })
    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({"ok": False, "error": "INVALID_JSON"}, status=400)

        field_rules = {
            'first_name':   (SAFE_TEXT, 15, "FIRST_NAME"),
            'last_name':    (SAFE_TEXT, 15, "LAST_NAME"),
            'company_name': (SAFE_TEXT, 30, "COMPANY_NAME"),
            'address':      (SAFE_TEXT, 50, "ADDRESS"),
            'city':         (SAFE_TEXT, 15, "CITY"),
            'postal_code':  (SAFE_POSTAL, 10, "POSTAL_CODE"),
            'country':      (SAFE_TEXT, 20, "COUNTRY"),
            'vat_number':   (SAFE_VAT, 11, "VAT_NUMBER"),
        }

        for field, (pattern, max_len, error_prefix) in field_rules.items():
            if field in data:
                val = data[field]
                if not isinstance(val, str):
                    return JsonResponse({"ok": False, "error": f"INVALID_{error_prefix}"}, status=400)
                if len(val) > max_len:
                    return JsonResponse({"ok": False, "error": f"{error_prefix}_TOO_LONG"}, status=400)
                if val and not pattern.match(val):
                    return JsonResponse({"ok": False, "error": f"INVALID_{error_prefix}_FORMAT"}, status=400)

        with transaction.atomic():
            user = User.objects.select_for_update().get(pk=request.user.pk)

            for field, (pattern, max_len, error_prefix) in field_rules.items():
                if field in data:
                    setattr(user, field, sanitize(data[field], max_len))

            if 'two_factor_enabled' in data:
                user.two_factor_enabled = bool(data['two_factor_enabled'])

            if 'new_password' in data and data['new_password']:
                if not data.get('current_password'):
                    return JsonResponse({"ok": False, "error": "CURRENT_PASSWORD_REQUIRED"}, status=400)
                if not user.check_password(data['current_password']):
                    return JsonResponse({"ok": False, "error": "WRONG_PASSWORD"}, status=400)
                try:
                    validate_password(data['new_password'], user=user)
                except ValidationError as e:
                    return JsonResponse({"ok": False, "error": "WEAK_PASSWORD", "messages": list(e.messages)}, status=400)
                user.set_password(data['new_password'])

            user.save()

        return JsonResponse({
            "ok": True,
            "user": {
                "id": str(user.id),
                "username": user.username,
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "company_name": getattr(user, 'company_name', ''),
                "address": getattr(user, 'address', ''),
                "city": getattr(user, 'city', ''),
                "postal_code": getattr(user, 'postal_code', ''),
                "country": getattr(user, 'country', ''),
                "vat_number": getattr(user, 'vat_number', ''),
                "two_factor_enabled": getattr(user, 'two_factor_enabled', False),
            }
        })