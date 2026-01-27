import json
from json import JSONDecodeError

from django.contrib.auth import authenticate, login as auth_login, logout as django_logout, get_user_model
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie, csrf_exempt
from django.views.decorators.http import require_POST, require_GET
from django_ratelimit.decorators import ratelimit
import html
import re
from django.contrib.auth.decorators import login_required
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from .forms import LoginForm, RegisterForm
from .views_jwt import generate_jwt_token, require_jwt
from .views_emails import send_welcome_email

User = get_user_model()


@ratelimit(key='ip', rate='10/m', block=True)
@require_POST
@csrf_exempt
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

    user = authenticate(request, username=email, password=password)

    if not user:
        try:
            u = User.objects.get(email__iexact=email)
            user = authenticate(request, username=u.username, password=password)
        except User.DoesNotExist:
            return JsonResponse({"ok": False, "error": "INVALID_CREDENTIALS"}, status=400)

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
@csrf_exempt
def api_register(request):
    try:
        data = json.loads(request.body)
    except JSONDecodeError:
        return JsonResponse({"ok": False, "error": "INVALID_JSON"}, status=400)

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


@require_POST
@csrf_protect
def api_logout(request):
    django_logout(request)
    return JsonResponse({"ok": True})


@require_GET
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


@ensure_csrf_cookie
@require_GET
def api_csrf(request):
    return JsonResponse({"ok": True})


@require_GET
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


def super_clean(val, max_len=255):
    if val is None:
        return ''
    val = str(val).strip()
    val = html.escape(val)
    val = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', val)
    return val[:max_len]


@csrf_protect
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

        user = request.user

        if 'first_name' in data:
            if len(data['first_name']) > 15:
                return JsonResponse({"ok": False, "error": "FIRST_NAME_TOO_LONG"}, status=400)
            user.first_name = super_clean(data['first_name'], 15)

        if 'last_name' in data:
            if len(data['last_name']) > 15:
                return JsonResponse({"ok": False, "error": "LAST_NAME_TOO_LONG"}, status=400)
            user.last_name = super_clean(data['last_name'], 15)

        if 'company_name' in data:
            if len(data['company_name']) > 30:
                return JsonResponse({"ok": False, "error": "COMPANY_NAME_TOO_LONG"}, status=400)
            user.company_name = super_clean(data['company_name'], 30)

        if 'address' in data:
            if len(data['address']) > 50:
                return JsonResponse({"ok": False, "error": "ADDRESS_TOO_LONG"}, status=400)
            user.address = super_clean(data['address'], 50)

        if 'city' in data:
            if len(data['city']) > 15:
                return JsonResponse({"ok": False, "error": "CITY_TOO_LONG"}, status=400)
            user.city = super_clean(data['city'], 15)

        if 'postal_code' in data:
            if len(data['postal_code']) > 10:
                return JsonResponse({"ok": False, "error": "POSTAL_CODE_TOO_LONG"}, status=400)
            user.postal_code = super_clean(data['postal_code'], 10)

        if 'country' in data:
            if len(data['country']) > 20:
                return JsonResponse({"ok": False, "error": "COUNTRY_TOO_LONG"}, status=400)
            user.country = super_clean(data['country'], 20)

        if 'vat_number' in data:
            if len(data['vat_number']) > 11:
                return JsonResponse({"ok": False, "error": "VAT_NUMBER_TOO_LONG"}, status=400)
            user.vat_number = super_clean(data['vat_number'], 11)

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
