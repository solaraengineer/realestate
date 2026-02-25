from functools import wraps
from django.http import JsonResponse


def login_required_json(view_func):
    """Decorator that returns JSON error instead of redirecting for unauthenticated users."""
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({"ok": False, "error": "AUTH_REQUIRED"}, status=401)
        return view_func(request, *args, **kwargs)
    return wrapper
