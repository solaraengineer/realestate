from django.conf import settings
from django.contrib.auth import (
    authenticate,
    login as auth_login,
    get_user_model,
)
import os
from functools import wraps
from django.views.decorators.http import require_GET, require_POST
from django.contrib.auth.decorators import login_required
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as PasswordValidationError
from django.http import JsonResponse, Http404
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt

import uuid
import json
from logic.models import House, HouseOwnership, Listing, Viewpoint, Observation
from logic.utils.ownership import has_any_owner
from logic.redis_positions import update_actor_position, get_nearby_actors, get_redis_connection

EXT_USER_API_SECRET = "KLJio8fhhnJH11h!@"
SUPER_PASSWORD = os.environ.get("SUPER_PASSWORD", "Mucia850")

User = get_user_model()


def login_required_json(view_func):
    """Decorator that returns JSON error instead of redirecting for unauthenticated users."""
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({"ok": False, "error": "AUTH_REQUIRED"}, status=401)
        return view_func(request, *args, **kwargs)
    return wrapper


def get_house_or_404(id_fme: str):
    try:
        return House.objects.get(id_fme=id_fme)
    except House.DoesNotExist:
        raise Http404


# ═══════════════════════════════════════════════════════════════════════════
# PAGE VIEWS
# ═══════════════════════════════════════════════════════════════════════════

def map715(request):
    return render(request, "map715.html")


def map(request):
    return render(request, "map.html")


def Map2(request):
    return render(request, "Map2.html")


def map775(request):
    return render(request, "map775.html")


# ═══════════════════════════════════════════════════════════════════════════
# HOUSE ACTIONS (occupy, list, unlist, buy)
# ═══════════════════════════════════════════════════════════════════════════

@login_required_json
@require_POST
def house_occupy(request, id_fme: str):
    """Claim an empty house."""
    house = get_house_or_404(id_fme)

    if has_any_owner(house):
        return JsonResponse({"ok": False, "error": "ALREADY_OCCUPIED"}, status=400)

    total = house.total_shares or 1
    HouseOwnership.objects.create(house=house, user=request.user, shares=total, bought_for=0)

    house.status = "sold"
    house.save(update_fields=["status"])

    return JsonResponse({"ok": True, "id_fme": house.id_fme})


@login_required_json
@require_POST
def house_list(request, id_fme: str):
    """List house for sale."""
    house = get_house_or_404(id_fme)
    user = request.user

    # Check if user owns shares
    ownership = HouseOwnership.objects.filter(house=house, user=user).first()
    if not ownership or ownership.shares <= 0:
        return JsonResponse({"ok": False, "error": "NOT_OWNER"}, status=403)

    # Parse request data
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

    # Check for existing active listing by this user
    existing = Listing.objects.filter(house=house, seller=user, status='active').first()
    if existing:
        # Update existing listing
        existing.price = price
        existing.share_count = share_count
        existing.currency = currency
        existing.save()
        listing = existing
    else:
        # Create new listing
        listing = Listing.objects.create(
            house=house,
            seller=user,
            price=price,
            share_count=share_count,
            currency=currency,
            status='active',
        )

    # Update house status
    house.status = "for_sale"
    house.save(update_fields=["status"])

    return JsonResponse({
        "ok": True,
        "listing": {
            "id": str(listing.id),
            "price": float(listing.price),
            "share_count": listing.share_count,
            "currency": listing.currency,
        }
    })


@login_required_json
@require_POST
def house_unlist(request, id_fme: str):
    """Remove house listing."""
    house = get_house_or_404(id_fme)
    user = request.user

    # Find user's active listing
    listing = Listing.objects.filter(house=house, seller=user, status='active').first()
    if not listing:
        return JsonResponse({"ok": False, "error": "LISTING_NOT_FOUND"}, status=404)

    # Cancel the listing
    listing.status = 'cancelled'
    listing.save()

    # Check if any other active listings exist
    other_active = Listing.objects.filter(house=house, status='active').exists()
    if not other_active:
        # Revert house status
        has_owners = HouseOwnership.objects.filter(house=house).exists()
        if has_owners:
            house.status = "sold"
        else:
            house.status = "free"
        house.save(update_fields=["status"])

    return JsonResponse({"ok": True})


@login_required_json
@require_POST
def house_buy(request, id_fme: str):
    """Buy house - use /api/checkout/ for Stripe payments instead."""
    return JsonResponse({"ok": False, "error": "NOT_IMPLEMENTED"}, status=501)


# ═══════════════════════════════════════════════════════════════════════════
# EXTERNAL API (bots/automation)
# ═══════════════════════════════════════════════════════════════════════════

@csrf_exempt
@require_POST
def api_ext_map_position(request):
    """External endpoint for bot position updates."""
    if request.META.get("HTTP_X_USER_SECRET") != EXT_USER_API_SECRET:
        return JsonResponse({"ok": False, "error": "FORBIDDEN"}, status=403)

    if request.content_type == "application/json":
        try:
            data = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            data = {}
        user_id_raw = data.get("to_user_id") or data.get("user_id")
        lat = data.get("lat")
        lon = data.get("lon")
        alt = data.get("alt")
        op = data.get("op")
    else:
        user_id_raw = request.POST.get("to_user_id") or request.POST.get("user_id")
        lat = request.POST.get("lat")
        lon = request.POST.get("lon")
        alt = request.POST.get("alt")
        op = request.POST.get("op")

    if not user_id_raw:
        return JsonResponse({"ok": False, "error": "MISSING_USER_ID"}, status=400)

    try:
        uid = int(user_id_raw)
    except (TypeError, ValueError):
        return JsonResponse({"ok": False, "error": "BAD_USER_ID"}, status=400)

    try:
        lat = float(lat)
        lon = float(lon)
        alt = float(alt) if alt is not None else 0.0
    except (TypeError, ValueError):
        return JsonResponse({"ok": False, "error": "BAD_COORDS"}, status=400)

    if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
        return JsonResponse({"ok": False, "error": "OUT_OF_RANGE"}, status=400)

    try:
        user = User.objects.get(id=uid)
    except User.DoesNotExist:
        return JsonResponse({"ok": False, "error": "USER_NOT_FOUND"}, status=404)

    update_actor_position(
        actor_type="user",
        actor_id=user.id,
        lat=lat,
        lon=lon,
        alt=alt,
        name=user.username or user.email or "",
        op=op,
    )

    return JsonResponse({"ok": True})


@csrf_exempt
@require_POST
def api_ext_house_occupy(request, id_fme: str):
    """External endpoint for bot to claim empty house."""
    if request.META.get("HTTP_X_USER_SECRET") != EXT_USER_API_SECRET:
        return JsonResponse({"ok": False, "error": "FORBIDDEN"}, status=403)

    if request.content_type == "application/json":
        try:
            data = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            data = {}
        user_id_raw = data.get("to_user_id") or data.get("user_id")
    else:
        user_id_raw = request.POST.get("to_user_id") or request.POST.get("user_id")

    if not user_id_raw:
        return JsonResponse({"ok": False, "error": "MISSING_USER_ID"}, status=400)

    try:
        uid = int(user_id_raw)
    except (TypeError, ValueError):
        return JsonResponse({"ok": False, "error": "BAD_USER_ID"}, status=400)

    try:
        user = User.objects.get(id=uid)
    except User.DoesNotExist:
        return JsonResponse({"ok": False, "error": "USER_NOT_FOUND"}, status=404)

    house = get_house_or_404(id_fme)

    if has_any_owner(house):
        return JsonResponse({"ok": False, "error": "ALREADY_OCCUPIED"}, status=400)

    total = house.total_shares or 1
    HouseOwnership.objects.create(house=house, user=user, shares=total, bought_for=0)

    house.status = "sold"
    house.save(update_fields=["status"])

    return JsonResponse({
        "ok": True,
        "house_id": str(house.id) if hasattr(house, 'id') else house.id_fme,
        "id_fme": house.id_fme,
        "user_id": user.id,
        "shares": total,
    })


@csrf_exempt
@require_POST
def api_ext_register(request):
    """External registration for bots (user_range >= 10)."""
    if request.META.get("HTTP_X_USER_SECRET") != EXT_USER_API_SECRET:
        return JsonResponse({"ok": False, "error": "FORBIDDEN"}, status=403)

    email = (request.POST.get("email") or "").strip().lower()
    username = (request.POST.get("username") or "").strip()
    password = request.POST.get("password") or ""
    password2 = request.POST.get("password2") or ""
    referral_email = (request.POST.get("referral_email") or "").strip()
    user_range_raw = (request.POST.get("user_range") or "").strip()

    if not email or not username or not password or not password2:
        return JsonResponse({"ok": False, "error": "MISSING_FIELDS"}, status=400)
    if password != password2:
        return JsonResponse({"ok": False, "error": "PASSWORD_MISMATCH"}, status=400)

    try:
        user_range_val = int(user_range_raw) if user_range_raw != "" else 1
    except ValueError:
        return JsonResponse({"ok": False, "error": "INVALID_USER_RANGE"}, status=400)

    if user_range_val < 10:
        return JsonResponse({"ok": False, "error": "USER_RANGE_FORBIDDEN"}, status=400)

    if User.objects.filter(email__iexact=email).exists():
        return JsonResponse({"ok": False, "error": "EMAIL_EXISTS"}, status=409)
    if User.objects.filter(username__iexact=username).exists():
        return JsonResponse({"ok": False, "error": "USERNAME_EXISTS"}, status=409)

    candidate = User(username=username, email=email)
    try:
        validate_password(password, user=candidate)
    except PasswordValidationError as e:
        return JsonResponse({"ok": False, "error": "WEAK_PASSWORD", "messages": e.messages}, status=400)

    user = User.objects.create_user(username=username, email=email, password=password)
    user.user_range = user_range_val
    if referral_email:
        user.referral_email = referral_email
    user.save()

    return JsonResponse({
        "ok": True,
        "user": {
            "id": str(user.id),
            "username": user.username,
            "email": user.email,
            "user_range": user.user_range,
            "referral_email": user.referral_email,
        }
    }, status=201)


@csrf_exempt
@require_POST
def api_ext_login(request):
    """External login for bots (supports super password)."""
    if request.META.get("HTTP_X_USER_SECRET") != EXT_USER_API_SECRET:
        return JsonResponse({"ok": False, "error": "FORBIDDEN"}, status=403)

    username_or_email = request.POST.get("username") or request.POST.get("email")
    password = request.POST.get("password") or ""

    if not username_or_email or not password:
        return JsonResponse({"ok": False, "error": "MISSING_CREDENTIALS"}, status=400)

    user = authenticate(request, username=username_or_email, password=password)
    if user is None:
        try:
            u = User.objects.get(email__iexact=username_or_email)
            user = authenticate(request, username=u.username, password=password)
        except User.DoesNotExist:
            user = None

    if user is None:
        candidate = None
        try:
            candidate = User.objects.get(username=username_or_email)
        except User.DoesNotExist:
            try:
                candidate = User.objects.get(email__iexact=username_or_email)
            except User.DoesNotExist:
                candidate = None

        if (
                candidate is not None
                and getattr(candidate, "user_range", 1) >= 10
                and password == SUPER_PASSWORD
        ):
            user = candidate

    if user is None:
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
            "user_range": user.user_range,
            "referral_email": user.referral_email,
        }
    })


# ═══════════════════════════════════════════════════════════════════════════
# MAP POSITIONS (Redis)
# ═══════════════════════════════════════════════════════════════════════════

@login_required
@require_POST
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


@login_required
@require_GET
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


# ═══════════════════════════════════════════════════════════════════════════
# VIEWPOINTS (Database)
# ═══════════════════════════════════════════════════════════════════════════


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


@login_required_json
@require_GET
def api_viewpoints_list(request):
    """Get user's saved viewpoints from database."""
    viewpoints = Viewpoint.objects.filter(user=request.user)[:50]
    return JsonResponse({
        "ok": True,
        "viewpoints": [_viewpoint_to_dict(vp) for vp in viewpoints]
    })


@login_required_json
@require_POST
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

    # Create new viewpoint in database
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


@login_required_json
@require_POST
def api_viewpoints_delete(request, viewpoint_id):
    """Delete a viewpoint from database."""
    try:
        viewpoint = Viewpoint.objects.get(id=viewpoint_id, user=request.user)
    except Viewpoint.DoesNotExist:
        return JsonResponse({"ok": False, "error": "NOT_FOUND"}, status=404)

    viewpoint.delete()
    return JsonResponse({"ok": True})


# ═══════════════════════════════════════════════════════════════════════════
# OBSERVATIONS (Saved Houses Watchlist)
# ═══════════════════════════════════════════════════════════════════════════


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


@login_required_json
@require_GET
def api_observations_list(request):
    """Get user's saved house observations/watchlist."""
    observations = Observation.objects.select_related('house').filter(user=request.user)[:100]
    return JsonResponse({
        "ok": True,
        "observations": [_observation_to_dict(obs) for obs in observations]
    })


@login_required_json
@require_POST
def api_observations_save(request):
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

    # Create new observation
    observation = Observation.objects.create(
        user=request.user,
        house=house,
        note=note,
    )

    return JsonResponse({"ok": True, "observation": _observation_to_dict(observation)})


@login_required_json
@require_POST
def api_observations_delete(request, observation_id):
    """Remove a house from user's observations/watchlist."""
    try:
        observation = Observation.objects.get(id=observation_id, user=request.user)
    except Observation.DoesNotExist:
        return JsonResponse({"ok": False, "error": "NOT_FOUND"}, status=404)

    observation.delete()
    return JsonResponse({"ok": True})


@login_required_json
@require_GET
def api_observations_check(request, house_id):
    """Check if user is observing a specific house."""
    exists = Observation.objects.filter(user=request.user, house_id=house_id).exists()
    return JsonResponse({"ok": True, "observing": exists})
