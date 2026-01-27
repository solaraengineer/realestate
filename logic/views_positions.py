import json
import os
from functools import wraps
from django.http import JsonResponse
from django.views.decorators.http import require_POST, require_GET
from django.views.decorators.csrf import csrf_exempt

from .redis_positions import update_actor_position, get_nearby_actors
from .views_jwt import require_jwt

# Internal API secret for server-to-server calls (bots)
INTERNAL_API_SECRET = os.environ.get("INTERNAL_API_SECRET", "")


def require_internal_secret(view_func):
    """Require internal API secret for server-to-server calls."""
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        secret = request.headers.get('X-Internal-Secret', '')
        if not INTERNAL_API_SECRET or secret != INTERNAL_API_SECRET:
            return JsonResponse({"ok": False, "error": "FORBIDDEN"}, status=403)
        return view_func(request, *args, **kwargs)
    return wrapper


@csrf_exempt
@require_internal_secret
@require_POST
def api_update_position(request):
    """
    Update actor position (internal API for bots).
    Requires X-Internal-Secret header.
    """
    try:
        data = json.loads(request.body.decode("utf-8"))
    except json.JSONDecodeError:
        return JsonResponse({"ok": False, "error": "invalid_json"}, status=400)

    actor_type = data.get("type")
    actor_id = data.get("id")
    lat = data.get("lat")
    lon = data.get("lon")

    if actor_type not in ("user", "bot"):
        return JsonResponse({"ok": False, "error": "invalid_type"}, status=400)

    if actor_id is None or lat is None or lon is None:
        return JsonResponse({"ok": False, "error": "missing_fields"}, status=400)

    try:
        lat = float(lat)
        lon = float(lon)
    except ValueError:
        return JsonResponse({"ok": False, "error": "invalid_lat_lon"}, status=400)

    heading = data.get("heading")
    speed = data.get("speed")
    try:
        heading_val = float(heading) if heading is not None else None
    except ValueError:
        heading_val = None
    try:
        speed_val = float(speed) if speed is not None else None
    except ValueError:
        speed_val = None

    update_actor_position(
        actor_type=actor_type,
        actor_id=actor_id,
        lat=lat,
        lon=lon,
        heading=heading_val,
        speed=speed_val,
    )

    return JsonResponse({"ok": True})


@require_jwt
@require_GET
def api_nearby_positions(request):
    """Get nearby positions. Requires authentication."""
    try:
        lat = float(request.GET.get("lat"))
        lon = float(request.GET.get("lon"))
    except (TypeError, ValueError):
        return JsonResponse({"ok": False, "error": "invalid_lat_lon"}, status=400)

    try:
        radius_km = float(request.GET.get("radius_km", "1.0"))
    except ValueError:
        radius_km = 1.0

    types_param = request.GET.get("types")
    include_types = None
    if types_param:
        include_types = [t for t in types_param.split(",") if t in ("user", "bot")]
        if not include_types:
            include_types = None

    max_results_param = request.GET.get("max_results")
    try:
        max_results = int(max_results_param) if max_results_param else 200
    except ValueError:
        max_results = 200

    actors = get_nearby_actors(
        lat=lat,
        lon=lon,
        radius_km=radius_km,
        max_results=max_results,
        include_types=include_types,
    )

    return JsonResponse(
        {
            "ok": True,
            "count": len(actors),
            "actors": actors,
        }
    )
