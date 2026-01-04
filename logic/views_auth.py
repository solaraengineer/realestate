import json
from json import JSONDecodeError

from django.contrib.auth import authenticate, login as auth_login, logout as django_logout, get_user_model
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie, csrf_exempt
from django.views.decorators.http import require_POST, require_GET
from django_ratelimit.decorators import ratelimit
import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_POST, require_GET
from django.contrib.auth.decorators import login_required
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from .forms import LoginForm, RegisterForm

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
            pass

    if not user:
        return JsonResponse({"ok": False, "error": "INVALID_CREDENTIALS"}, status=401)

    if not user.is_active:
        return JsonResponse({"ok": False, "error": "INACTIVE"}, status=403)

    auth_login(request, user)

    return JsonResponse({
        "ok": True,
        "user": {
            "id": str(user.id),
            "username": user.username,
            "email": user.email,
        }
    })


@ratelimit(key='ip', rate='5/m', block=True)
@require_POST
@csrf_protect
def api_register(request):
    try:
        data = json.loads(request.body)
    except JSONDecodeError:
        return JsonResponse({"ok": False, "error": "INVALID_JSON"}, status=400)

    form = RegisterForm(data)
    if not form.is_valid():
        if 'PASSWORD_MISMATCH' in str(form.errors):
            return JsonResponse({"ok": False, "error": "PASSWORD_MISMATCH"}, status=400)
        return JsonResponse({"ok": False, "error": "MISSING_FIELDS"}, status=400)

    cd = form.cleaned_data
    username = cd['username']
    email = cd['email'].lower()
    password = cd['password']

    if User.objects.filter(email__iexact=email).exists():
        return JsonResponse({"ok": False, "error": "EMAIL_EXISTS"}, status=400)

    if User.objects.filter(username__iexact=username).exists():
        return JsonResponse({"ok": False, "error": "USERNAME_EXISTS"}, status=400)

    user = User.objects.create_user(username=username, email=email, password=password)
    auth_login(request, user)

    return JsonResponse({
        "ok": True,
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


User = get_user_model()


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


@require_POST
@csrf_protect
@login_required
def api_profile_update(request):
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"ok": False, "error": "INVALID_JSON"}, status=400)

    u = request.user

    if 'first_name' in data:
        u.first_name = data['first_name'].strip()[:150]

    if 'last_name' in data:
        u.last_name = data['last_name'].strip()[:150]

    if 'company_name' in data:
        u.company_name = data['company_name'].strip()[:255]

    if 'address' in data:
        u.address = data['address'].strip()[:255]

    if 'city' in data:
        u.city = data['city'].strip()[:100]

    if 'postal_code' in data:
        u.postal_code = data['postal_code'].strip()[:20]

    if 'country' in data:
        u.country = data['country'].strip()[:100]

    if 'vat_number' in data:
        u.vat_number = data['vat_number'].strip()[:50]

    if 'two_factor_enabled' in data:
        u.two_factor_enabled = bool(data['two_factor_enabled'])

    u.save()

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


@require_POST
@csrf_protect
@login_required
def api_password_change(request):
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"ok": False, "error": "INVALID_JSON"}, status=400)

    password = data.get('password', '')
    password2 = data.get('password2', '')

    if not password or not password2:
        return JsonResponse({"ok": False, "error": "MISSING_FIELDS"}, status=400)

    if password != password2:
        return JsonResponse({"ok": False, "error": "PASSWORD_MISMATCH"}, status=400)

    try:
        validate_password(password, user=request.user)
    except ValidationError as e:
        return JsonResponse({"ok": False, "error": "WEAK_PASSWORD", "messages": list(e.messages)}, status=400)

    request.user.set_password(password)
    request.user.save()

    return JsonResponse({"ok": True})