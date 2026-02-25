import jwt
import json
from datetime import datetime, timedelta, timezone
from functools import wraps
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from django.views.decorators.http import require_POST, require_GET
from django.contrib.auth import authenticate, login as auth_login, get_user_model
from django_ratelimit.decorators import ratelimit
from django.conf import settings as django_settings

User = get_user_model()

JWT_EXPIRY_HOURS = getattr(django_settings, 'JWT_EXPIRY_HOURS', 24)
JWT_PRIVATE_KEY = getattr(django_settings, 'JWT_PRIVATE_KEY', '')
JWT_PUBLIC_KEY = getattr(django_settings, 'JWT_PUBLIC_KEY', '')
JWT_REFRESH_MAX_AGE = 86400


def generate_jwt_token(user):
    payload = {
        'user_id': user.id,
        'sub': str(user.id),
        'username': user.username,
        'email': user.email,
        'exp': datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
        'iat': datetime.now(timezone.utc)
    }
    return jwt.encode(payload, JWT_PRIVATE_KEY, algorithm='RS256')


def verify_auth_token(token, verify_expiration=True):
    try:
        return jwt.decode(token, JWT_PUBLIC_KEY, algorithms=['RS256'], options={'verify_exp': verify_expiration})
    except jwt.ExpiredSignatureError:
        return 'expired'
    except jwt.InvalidTokenError:
        return 'invalid'


def get_user_from_token(token):
    payload = verify_auth_token(token)
    if isinstance(payload, dict) and 'user_id' in payload:
        try:
            return User.objects.get(id=payload['user_id'])
        except User.DoesNotExist:
            return None
    return None


def require_jwt(view_func):
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            if request.user.is_authenticated:
                return view_func(request, *args, **kwargs)
            return JsonResponse({'ok': False, 'error': 'AUTH_REQUIRED', 'message': 'Authentication required.'}, status=401)

        auth_header = request.headers.get('Authorization', '')
        token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else ''

        if not token:
            if request.user.is_authenticated:
                new_token = generate_jwt_token(request.user)
                response = JsonResponse({
                    'ok': False,
                    'error': 'TOKEN_REQUIRED',
                    'new_token': new_token,
                    'message': 'No JWT provided. New token issued.'
                }, status=401)
                response['X-New-Token'] = new_token
                return response
            return JsonResponse({'ok': False, 'error': 'AUTH_REQUIRED', 'message': 'Please log in.'}, status=401)

        payload = verify_auth_token(token)

        if payload == 'invalid':
            return JsonResponse({'ok': False, 'error': 'INVALID_TOKEN', 'message': 'Token is invalid.'}, status=401)

        if payload == 'expired':
            expired_payload = verify_auth_token(token, verify_expiration=False)
            if isinstance(expired_payload, dict) and 'user_id' in expired_payload:
                try:
                    user = User.objects.get(id=expired_payload['user_id'])
                    new_token = generate_jwt_token(user)
                    response = JsonResponse({
                        'ok': False,
                        'error': 'TOKEN_EXPIRED',
                        'new_token': new_token,
                        'message': 'Token expired. New token issued. Please retry.'
                    }, status=401)
                    response['X-New-Token'] = new_token
                    return response
                except User.DoesNotExist:
                    pass
            return JsonResponse({'ok': False, 'error': 'INVALID_TOKEN', 'message': 'Token is invalid.'}, status=401)

        if isinstance(payload, dict) and 'user_id' in payload:
            try:
                user = User.objects.get(id=payload['user_id'])
                request.jwt_user = user
                if not request.user.is_authenticated:
                    request.user = user
                return view_func(request, *args, **kwargs)
            except User.DoesNotExist:
                return JsonResponse({'ok': False, 'error': 'USER_NOT_FOUND', 'message': 'User account not found.'}, status=404)

        return JsonResponse({'ok': False, 'error': 'INVALID_TOKEN', 'message': 'Token is invalid.'}, status=401)

    return wrapper


@ratelimit(key='ip', rate='10/m', block=True)
@require_POST
@csrf_protect
@ensure_csrf_cookie
def api_jwt_login(request):
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'ok': False, 'error': 'INVALID_JSON', 'message': 'Invalid request body.'}, status=400)

    email = data.get('email', '').strip()
    password = data.get('password', '')

    if not email or not password:
        return JsonResponse({'ok': False, 'error': 'MISSING_CREDENTIALS', 'message': 'Email and password are required.'}, status=400)

    user = authenticate(request, username=email, password=password)

    if not user:
        try:
            u = User.objects.get(email__iexact=email)
            user = authenticate(request, username=u.username, password=password)
        except User.DoesNotExist:
            pass

    if not user:
        return JsonResponse({'ok': False, 'error': 'INVALID_CREDENTIALS', 'message': 'Invalid email or password.'}, status=401)

    if not user.is_active:
        return JsonResponse({'ok': False, 'error': 'INACTIVE', 'message': 'Account is inactive.'}, status=403)

    auth_login(request, user)

    token = generate_jwt_token(user)

    return JsonResponse({
        'ok': True,
        'token': token,
        'user': {
            'id': str(user.id),
            'username': user.username,
            'email': user.email,
        }
    })


@ratelimit(key='ip', rate='10/m', block=True)
@require_POST
@csrf_protect
@ensure_csrf_cookie
def api_jwt_refresh(request):
    auth_header = request.headers.get('Authorization', '')
    token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else ''

    if not token:
        if request.user.is_authenticated:
            new_token = generate_jwt_token(request.user)
            return JsonResponse({
                'ok': True,
                'token': new_token,
                'user': {
                    'id': str(request.user.id),
                    'username': request.user.username,
                    'email': request.user.email,
                }
            })
        return JsonResponse({'ok': False, 'error': 'TOKEN_REQUIRED', 'message': 'A token is required.'}, status=401)

    payload = verify_auth_token(token, verify_expiration=False)

    if payload in ('invalid', 'expired') or not isinstance(payload, dict):
        if request.user.is_authenticated:
            new_token = generate_jwt_token(request.user)
            return JsonResponse({
                'ok': True,
                'token': new_token,
                'user': {
                    'id': str(request.user.id),
                    'username': request.user.username,
                    'email': request.user.email,
                }
            })
        return JsonResponse({'ok': False, 'error': 'INVALID_TOKEN', 'message': 'Token is invalid.'}, status=401)

    exp = payload.get('exp', 0)
    now = datetime.now(timezone.utc).timestamp()
    if now - exp > JWT_REFRESH_MAX_AGE:
        return JsonResponse({'ok': False, 'error': 'TOKEN_TOO_OLD', 'message': 'Token expired too long ago. Please log in again.'}, status=401)

    user_id = payload.get('user_id')
    if not user_id:
        return JsonResponse({'ok': False, 'error': 'INVALID_TOKEN', 'message': 'Token is invalid.'}, status=401)

    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'USER_NOT_FOUND', 'message': 'User account not found.'}, status=404)

    if not user.is_active:
        return JsonResponse({'ok': False, 'error': 'INACTIVE', 'message': 'Account is inactive.'}, status=403)

    new_token = generate_jwt_token(user)

    return JsonResponse({
        'ok': True,
        'token': new_token,
        'user': {
            'id': str(user.id),
            'username': user.username,
            'email': user.email,
        }
    })


@ratelimit(key='ip', rate='60/m', block=True)
@require_GET
@csrf_protect
@ensure_csrf_cookie
def api_jwt_whoami(request):
    auth_header = request.headers.get('Authorization', '')
    token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else ''

    if not token:
        if request.user.is_authenticated:
            return JsonResponse({
                'ok': True,
                'user': {
                    'id': str(request.user.id),
                    'username': request.user.username,
                    'email': request.user.email,
                }
            })
        return JsonResponse({'ok': False, 'error': 'NOT_AUTHENTICATED', 'message': 'Not authenticated.'}, status=401)

    payload = verify_auth_token(token)

    if payload == 'expired':
        return JsonResponse({'ok': False, 'error': 'TOKEN_EXPIRED', 'message': 'Token has expired.'}, status=401)

    if payload == 'invalid' or not isinstance(payload, dict):
        return JsonResponse({'ok': False, 'error': 'INVALID_TOKEN', 'message': 'Token is invalid.'}, status=401)

    user_id = payload.get('user_id')
    if not user_id:
        return JsonResponse({'ok': False, 'error': 'INVALID_TOKEN', 'message': 'Token is invalid.'}, status=401)

    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'USER_NOT_FOUND', 'message': 'User account not found.'}, status=404)

    return JsonResponse({
        'ok': True,
        'user': {
            'id': str(user.id),
            'username': user.username,
            'email': user.email,
        }
    })