"""
JWT Authentication with RSA-3072 / RS256
"""
import jwt
import json
from datetime import datetime, timedelta
from functools import wraps

from django.conf import settings
from django.http import JsonResponse
from django.contrib.auth import get_user_model

User = get_user_model()


def get_jwt_private_key():
    """Get RSA private key from settings."""
    return settings.JWT_PRIVATE_KEY


def get_jwt_public_key():
    """Get RSA public key from settings."""
    return settings.JWT_PUBLIC_KEY


def generate_jwt_token(user, expires_in_hours=24):
    """
    Generate a JWT token for a user using RS256 (RSA with SHA-256).

    Args:
        user: Django User instance
        expires_in_hours: Token validity period (default 24 hours)

    Returns:
        str: Encoded JWT token
    """
    now = datetime.utcnow()
    payload = {
        "sub": str(user.id),
        "username": user.username,
        "email": user.email,
        "iat": now,
        "exp": now + timedelta(hours=expires_in_hours),
        "iss": settings.JWT_ISSUER,
    }
    private_key = get_jwt_private_key()
    token = jwt.encode(payload, private_key, algorithm=settings.JWT_ALGORITHM)

    return token


def decode_jwt_token(token):
    """
    Decode and verify a JWT token.

    Args:
        token: JWT token string

    Returns:
        dict: Decoded payload if valid

    Raises:
        jwt.ExpiredSignatureError: Token has expired
        jwt.InvalidTokenError: Token is invalid
    """
    public_key = get_jwt_public_key()
    payload = jwt.decode(
        token,
        public_key,
        algorithms=[settings.JWT_ALGORITHM],
        issuer=settings.JWT_ISSUER,
    )
    return payload


def jwt_required(view_func):
    """
    Decorator that requires a valid JWT token in the Authorization header.

    If JWT is expired/invalid but user has valid session, issues new token
    in response header 'X-New-Token'.

    Usage:
        @jwt_required
        def my_view(request):
            # request.jwt_user is the authenticated user
            # request.jwt_payload is the decoded token payload
            # request.jwt_new_token is set if a new token was issued
            pass

    Authorization header format:
        Authorization: Bearer <token>
    """
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        new_token = None

        # Try JWT auth first
        if auth_header:
            parts = auth_header.split()
            if len(parts) == 2 and parts[0].lower() == "bearer":
                token = parts[1]

                try:
                    payload = decode_jwt_token(token)
                    user_id = payload.get("sub")

                    if user_id:
                        try:
                            user = User.objects.get(id=int(user_id))
                            if user.is_active:
                                request.jwt_user = user
                                request.jwt_payload = payload
                                request.jwt_new_token = None
                                return view_func(request, *args, **kwargs)
                        except (User.DoesNotExist, ValueError):
                            pass

                except jwt.ExpiredSignatureError:
                    # Token expired - check if session user exists to issue new token
                    pass
                except jwt.InvalidTokenError:
                    # Invalid token - check if session user exists
                    pass

        # JWT failed or missing - fallback to session auth
        if request.user.is_authenticated:
            user = request.user

            # Generate new token for the session user
            new_token = generate_jwt_token(user)

            # Attach to request
            request.jwt_user = user
            request.jwt_payload = {
                "sub": str(user.id),
                "username": user.username,
                "email": user.email,
            }
            request.jwt_new_token = new_token

            # Call the view
            response = view_func(request, *args, **kwargs)

            # Add new token to response header
            response['X-New-Token'] = new_token

            return response

        # No valid auth at all
        return JsonResponse(
            {"ok": False, "error": "AUTH_REQUIRED"},
            status=401
        )

    return wrapper


def jwt_or_session_required(view_func):
    """
    Decorator that accepts either JWT token OR session auth.
    If JWT fails but session is valid, issues new token in X-New-Token header.

    Useful for endpoints that need to work with both auth methods.
    """
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        new_token = None
        user = None
        payload = None

        # Try JWT auth first
        if auth_header:
            parts = auth_header.split()
            if len(parts) == 2 and parts[0].lower() == "bearer":
                token = parts[1]

                try:
                    payload = decode_jwt_token(token)
                    user_id = payload.get("sub")

                    if user_id:
                        try:
                            user = User.objects.get(id=int(user_id))
                            if not user.is_active:
                                user = None
                        except (User.DoesNotExist, ValueError):
                            pass

                except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
                    # Token invalid - will fallback to session
                    pass

        # Fallback to session if JWT failed
        if not user and request.user.is_authenticated:
            user = request.user
            payload = {
                "sub": str(user.id),
                "username": user.username,
                "email": user.email,
            }
            # Issue new token
            new_token = generate_jwt_token(user)

        if not user:
            return JsonResponse(
                {"ok": False, "error": "AUTH_REQUIRED"},
                status=401
            )

        # Attach to request
        request.jwt_user = user
        request.jwt_payload = payload
        request.jwt_new_token = new_token

        # Call the view
        response = view_func(request, *args, **kwargs)

        # Add new token to response header if issued
        if new_token:
            response['X-New-Token'] = new_token

        return response

    return wrapper


def refresh_jwt_token(token):
    payload = decode_jwt_token(token)
    user_id = payload.get("sub")

    try:
        user = User.objects.get(id=int(user_id))
    except (User.DoesNotExist, ValueError):
        raise jwt.InvalidTokenError("User not found")

    return generate_jwt_token(user)


# ═══════════════════════════════════════════════════════════════════════════
# JWT API ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════

from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST, require_GET
from django.contrib.auth import authenticate


@csrf_exempt
@require_POST
def api_jwt_login(request):
    """
    Authenticate user and return JWT token.

    POST /api/jwt/login/
    Body: {"email": "...", "password": "..."}

    Returns: {"ok": true, "token": "...", "user": {...}}
    """
    try:
        data = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"ok": False, "error": "INVALID_JSON"}, status=400)

    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return JsonResponse({"ok": False, "error": "MISSING_CREDENTIALS"}, status=400)

    # Try to find user by email
    try:
        user_obj = User.objects.get(email__iexact=email)
        username = user_obj.username
    except User.DoesNotExist:
        return JsonResponse({"ok": False, "error": "INVALID_CREDENTIALS"}, status=401)

    # Authenticate
    user = authenticate(request, username=username, password=password)

    if user is None:
        return JsonResponse({"ok": False, "error": "INVALID_CREDENTIALS"}, status=401)

    if not user.is_active:
        return JsonResponse({"ok": False, "error": "USER_INACTIVE"}, status=401)

    # Generate token
    token = generate_jwt_token(user)

    return JsonResponse({
        "ok": True,
        "token": token,
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
        }
    })


@csrf_exempt
@require_POST
def api_jwt_refresh(request):
    """
    Refresh JWT token.

    POST /api/jwt/refresh/
    Header: Authorization: Bearer <token>

    Returns: {"ok": true, "token": "..."}
    """
    auth_header = request.META.get("HTTP_AUTHORIZATION", "")

    if not auth_header:
        return JsonResponse({"ok": False, "error": "MISSING_AUTH_HEADER"}, status=401)

    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return JsonResponse({"ok": False, "error": "INVALID_AUTH_FORMAT"}, status=401)

    token = parts[1]

    try:
        new_token = refresh_jwt_token(token)
    except jwt.ExpiredSignatureError:
        return JsonResponse({"ok": False, "error": "TOKEN_EXPIRED"}, status=401)
    except jwt.InvalidTokenError as e:
        return JsonResponse({"ok": False, "error": "INVALID_TOKEN", "message": str(e)}, status=401)

    return JsonResponse({"ok": True, "token": new_token})


@jwt_required
@require_GET
def api_jwt_whoami(request):
    """
    Get current user info from JWT token.

    GET /api/jwt/whoami/
    Header: Authorization: Bearer <token>

    Returns: {"ok": true, "user": {...}}
    """
    user = request.jwt_user

    return JsonResponse({
        "ok": True,
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
        }
    })


