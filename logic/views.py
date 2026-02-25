import os
import json
from django.contrib.auth import get_user_model
from django.db import transaction
from django.http import JsonResponse, Http404
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_GET, require_POST
from django.contrib.auth.decorators import login_required
from django_ratelimit.decorators import ratelimit

from logic.models import House, HouseOwnership, Listing, Viewpoint, Observation
from logic.redis_positions import update_actor_position, get_nearby_actors
from logic.views_jwt import require_jwt
from logic.utils.decorators import login_required_json

EXT_USER_API_SECRET = os.environ.get("EXT_USER_API_SECRET", "")
SUPER_PASSWORD = os.environ.get("SUPER_PASSWORD", "")

User = get_user_model()


def get_house_or_404(id_fme: str):
    try:
        return House.objects.get(id_fme=id_fme)
    except House.DoesNotExist:
        raise Http404


def map715(request):
    return render(request, "map715.html")


def map(request):
    return render(request, "map.html")


def Map2(request):
    return render(request, "Map2.html")


def map775(request):
    return render(request, "map775.html")


@ratelimit(key='ip', rate='30/m', block=True)
@require_POST
@csrf_protect
@require_jwt
def house_list(request, id_fme: str):
    """List house for sale."""
    house = get_house_or_404(id_fme)
    user = request.user

    with transaction.atomic():
        ownership = HouseOwnership.objects.select_for_update().filter(house=house, user=user).first()
        if not ownership or ownership.shares <= 0:
            return JsonResponse({"ok": False, "error": "NOT_OWNER"}, status=403)

        try:
            data = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            data = request.POST

        try:
            price = float(data.get("price", 0))
        except (TypeError, ValueError):
            return JsonResponse({"ok": False, "error": "INVALID_PRICE"}, status=400)

        if price <= 0:
            return JsonResponse({"ok": False, "error": "PRICE_REQUIRED"}, status=400)

        try:
            share_count = int(data.get("share_count") or data.get("shares") or ownership.shares)
        except (TypeError, ValueError):
            share_count = ownership.shares

        if share_count <= 0 or share_count > ownership.shares:
            return JsonResponse({"ok": False, "error": "INVALID_SHARE_COUNT"}, status=400)

        currency = data.get("currency", "PLN")

        existing = Listing.objects.select_for_update().filter(house=house, seller=user, status='active').first()
        if existing:
            existing.price = price
            existing.share_count = share_count
            existing.currency = currency
            existing.save()
            listing = existing
        else:
            listing = Listing.objects.create(
                house=house,
                seller=user,
                price=price,
                share_count=share_count,
                currency=currency,
                status='active',
            )

        House.objects.select_for_update().filter(id_fme=house.id_fme).update(status="for_sale")

    return JsonResponse({
        "ok": True,
        "listing": {
            "id": str(listing.id),
            "price": float(listing.price),
            "share_count": listing.share_count,
            "currency": listing.currency,
        }
    })


@ratelimit(key='ip', rate='30/m', block=True)
@require_POST
@csrf_protect
@require_jwt
def house_unlist(request, id_fme: str):
    """Remove house listing."""
    house = get_house_or_404(id_fme)
    user = request.user

    with transaction.atomic():
        listing = Listing.objects.select_for_update().filter(house=house, seller=user, status='active').first()
        if not listing:
            return JsonResponse({"ok": False, "error": "LISTING_NOT_FOUND"}, status=404)

        listing.status = 'cancelled'
        listing.save()

        other_active = Listing.objects.filter(house=house, status='active').exclude(id=listing.id).exists()
        if not other_active:
            has_owners = HouseOwnership.objects.filter(house=house).exists()
            new_status = "sold" if has_owners else "free"
            House.objects.select_for_update().filter(id_fme=house.id_fme).update(status=new_status)

    return JsonResponse({"ok": True})


@ratelimit(key='ip', rate='30/m', block=True)
@require_POST
@csrf_protect
@require_jwt
def listing_update_shares(request, listing_id: str):
    """Update share count on a cancelled/inactive listing (not active)."""
    with transaction.atomic():
        try:
            listing = Listing.objects.select_for_update().get(id=listing_id)
        except Listing.DoesNotExist:
            return JsonResponse({"ok": False, "error": "LISTING_NOT_FOUND"}, status=404)

        if listing.seller_id != request.user.id:
            return JsonResponse({"ok": False, "error": "NOT_OWNER"}, status=403)

        if listing.status == 'active':
            return JsonResponse({"ok": False, "error": "LISTING_ACTIVE", "message": "Cannot modify shares on active listing. Unlist first."}, status=400)

        try:
            data = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"ok": False, "error": "INVALID_JSON"}, status=400)

        try:
            new_shares = int(data.get("shares") or data.get("share_count"))
        except (TypeError, ValueError):
            return JsonResponse({"ok": False, "error": "INVALID_SHARES"}, status=400)

        ownership = HouseOwnership.objects.select_for_update().filter(house=listing.house, user=request.user).first()
        if not ownership:
            return JsonResponse({"ok": False, "error": "NO_OWNERSHIP"}, status=403)

        if new_shares <= 0:
            return JsonResponse({"ok": False, "error": "SHARES_MUST_BE_POSITIVE"}, status=400)

        if new_shares > ownership.shares:
            return JsonResponse({"ok": False, "error": "EXCEEDS_OWNERSHIP", "max_shares": ownership.shares}, status=400)

        listing.share_count = new_shares
        listing.save(update_fields=["share_count"])

    return JsonResponse({
        "ok": True,
        "listing": {
            "id": str(listing.id),
            "share_count": listing.share_count,
            "status": listing.status,
            "price": float(listing.price) if listing.price else None,
        }
    })


@ratelimit(key='ip', rate='120/m', block=True)
@require_POST
@csrf_protect
@require_jwt
def map_position(request):
    """Save user position to Redis."""
    try:
        data = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"ok": False, "error": "INVALID_JSON"}, status=400)

    lat = data.get("lat")
    lon = data.get("lon")
    alt = data.get("alt")

    try:
        lat = float(lat)
        lon = float(lon)
        alt = float(alt) if alt is not None else 0.0
    except (TypeError, ValueError):
        return JsonResponse({"ok": False, "error": "BAD_COORDS"}, status=400)

    if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
        return JsonResponse({"ok": False, "error": "OUT_OF_RANGE"}, status=400)

    update_actor_position(
        actor_type="user",
        actor_id=request.user.id,
        lat=lat,
        lon=lon,
        alt=alt,
        name=request.user.username or request.user.email or "",
    )

    return JsonResponse({"ok": True})


@ratelimit(key='ip', rate='60/m', block=True)
@require_GET
@csrf_protect
@login_required
def map_positions(request):
    """Get all active user positions from Redis."""
    actors = get_nearby_actors(
        lat=0.0,
        lon=0.0,
        radius_km=20000.0,
        include_types=["user", "bot"],
        max_results=1000,
    )

    me_id_str = str(request.user.id)

    out = []
    for a in actors:
        a_type = a.get("type") or "user"
        a_id = str(a.get("id"))

        if a_type == "user" and a_id == me_id_str:
            continue

        out.append({
            "id": a_id,
            "name": a.get("name") or f"{a_type} {a_id}",
            "type": a_type,
            "lat": float(a.get("lat")),
            "lon": float(a.get("lon")),
            "alt": float(a.get("alt", 0.0)),
            "op": a.get("op"),
        })

    return JsonResponse(out, safe=False)


def _viewpoint_to_dict(vp):
    """Convert Viewpoint model to JSON-serializable dict."""
    return {
        "id": str(vp.id),
        "name": vp.name,
        "lat": vp.lat,
        "lon": vp.lon,
        "height": vp.height,
        "heading": vp.heading,
        "pitch": vp.pitch,
        "roll": vp.roll,
        "pos_x": vp.pos_x,
        "pos_y": vp.pos_y,
        "pos_z": vp.pos_z,
        "created_at": vp.created_at.isoformat() if vp.created_at else None,
    }


@ratelimit(key='ip', rate='60/m', block=True)
@require_GET
@csrf_protect
@login_required_json
def api_viewpoints_list(request):
    """Get user's saved viewpoints from database."""
    viewpoints = Viewpoint.objects.filter(user=request.user)[:50]
    return JsonResponse({
        "ok": True,
        "viewpoints": [_viewpoint_to_dict(vp) for vp in viewpoints]
    })


@ratelimit(key='ip', rate='30/m', block=True)
@require_POST
@csrf_protect
@require_jwt
def api_viewpoints_save(request):
    """Save a new viewpoint to database."""
    try:
        data = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"ok": False, "error": "INVALID_JSON"}, status=400)

    name = (data.get("name") or "").strip()
    if not name:
        name = f"Viewpoint {int(timezone.now().timestamp())}"

    try:
        lat = float(data.get("lat"))
        lon = float(data.get("lon"))
    except (TypeError, ValueError):
        return JsonResponse({"ok": False, "error": "BAD_COORDS"}, status=400)

    viewpoint = Viewpoint.objects.create(
        user=request.user,
        name=name,
        lat=lat,
        lon=lon,
        height=float(data.get("height")) if data.get("height") is not None else None,
        heading=float(data.get("heading")) if data.get("heading") is not None else 0,
        pitch=float(data.get("pitch")) if data.get("pitch") is not None else -0.5,
        roll=float(data.get("roll")) if data.get("roll") is not None else 0,
        pos_x=float(data.get("pos_x")) if data.get("pos_x") is not None else None,
        pos_y=float(data.get("pos_y")) if data.get("pos_y") is not None else None,
        pos_z=float(data.get("pos_z")) if data.get("pos_z") is not None else None,
    )

    return JsonResponse({"ok": True, "viewpoint": _viewpoint_to_dict(viewpoint)})


@ratelimit(key='ip', rate='30/m', block=True)
@require_POST
@csrf_protect
@require_jwt
def api_viewpoints_delete(request, viewpoint_id):
    """Delete a viewpoint from database."""
    try:
        viewpoint = Viewpoint.objects.get(id=viewpoint_id, user=request.user)
    except Viewpoint.DoesNotExist:
        return JsonResponse({"ok": False, "error": "NOT_FOUND"}, status=404)

    viewpoint.delete()
    return JsonResponse({"ok": True})


def _observation_to_dict(obs):
    """Convert Observation model to JSON-serializable dict."""
    house = obs.house
    return {
        "id": str(obs.id),
        "house_id": str(house.id_fme) if house else None,
        "house": {
            "id": str(house.id_fme),
            "name": house.name,
            "lat": house.lat,
            "lon": house.lon,
            "status": house.status,
        } if house else None,
        "note": obs.note,
        "created_at": obs.created_at.isoformat() if obs.created_at else None,
    }


@ratelimit(key='ip', rate='60/m', block=True)
@require_GET
@csrf_protect
@login_required_json
def api_observations_list(request):
    """Get user's saved house observations/watchlist."""
    observations = Observation.objects.select_related('house').filter(user=request.user)[:100]
    return JsonResponse({
        "ok": True,
        "observations": [_observation_to_dict(obs) for obs in observations]
    })


@ratelimit(key='ip', rate='30/m', block=True)
@require_POST
@csrf_protect
@require_jwt
def api_observations_save(request):
    """Save a house to user's observations/watchlist."""
    try:
        data = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"ok": False, "error": "INVALID_JSON"}, status=400)

    house_id = data.get("house_id")
    if not house_id:
        return JsonResponse({"ok": False, "error": "MISSING_HOUSE_ID"}, status=400)

    try:
        house = House.objects.get(id_fme=house_id)
    except House.DoesNotExist:
        return JsonResponse({"ok": False, "error": "HOUSE_NOT_FOUND"}, status=404)

    note = (data.get("note") or "").strip() or None

    existing = Observation.objects.filter(user=request.user, house=house).first()
    if existing:
        if note is not None:
            existing.note = note
            existing.save()
        return JsonResponse({"ok": True, "observation": _observation_to_dict(existing), "updated": True})

    observation = Observation.objects.create(
        user=request.user,
        house=house,
        note=note,
    )

    return JsonResponse({"ok": True, "observation": _observation_to_dict(observation)})


@ratelimit(key='ip', rate='30/m', block=True)
@require_POST
@csrf_protect
@require_jwt
def api_observations_delete(request, observation_id):
    """Remove a house from user's observations/watchlist."""
    try:
        observation = Observation.objects.get(id=observation_id, user=request.user)
    except Observation.DoesNotExist:
        return JsonResponse({"ok": False, "error": "NOT_FOUND"}, status=404)

    observation.delete()
    return JsonResponse({"ok": True})


@ratelimit(key='ip', rate='60/m', block=True)
@require_GET
@csrf_protect
@login_required_json
def api_observations_check(request, house_id):
    """Check if user is observing a specific house."""
    exists = Observation.objects.filter(user=request.user, house_id=house_id).exists()
    return JsonResponse({"ok": True, "observing": exists})
