from django.http import JsonResponse, Http404
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from django.views.decorators.http import require_GET
from django.contrib.auth import get_user_model
from django.db.models import Prefetch
from django.core.paginator import Paginator
from django_ratelimit.decorators import ratelimit

from logic.models import Transaction, House, Listing, HouseOwnership
from .views_jwt import require_jwt

User = get_user_model()


@ratelimit(key='ip', rate='30/m', block=True)
@require_GET
@csrf_protect
@ensure_csrf_cookie
@require_jwt
def house_detail(request, id_fme: str):
    try:
        h = House.objects.get(id_fme=id_fme)
    except House.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'HOUSE_NOT_FOUND'}, status=404)

    a = h.attrs or {}

    def _num(x):
        try:
            return float(x)
        except (TypeError, ValueError):
            return None

    lat = _num(getattr(h, "lat", None)) or _num(a.get("FME_lat")) or _num(a.get("lat"))
    lon = _num(getattr(h, "lon", None)) or _num(a.get("FME_lon")) or _num(a.get("lon"))

    active_listings = list(Listing.objects.filter(house=h, status='active').select_related('seller'))

    status = h.status or 'free'

    if active_listings:
        lst0 = active_listings[0]
        price = float(lst0.price) if lst0.price is not None else None
        currency = getattr(lst0, 'currency', 'PLN') or 'PLN'
        status = 'for_sale'
        listing_id = str(lst0.id)
        listing_shares = getattr(lst0, "share_count", None)
    else:
        price = None
        currency = None
        listing_id = None
        listing_shares = None

    total_shares_value = getattr(h, "total_shares", 1) or 1
    owners_data = []

    ownerships = HouseOwnership.objects.filter(house=h).select_related('user')

    for ho in ownerships:
        u = getattr(ho, 'user', None)
        if not u:
            continue
        username = u.username or u.email or f"User {u.id}"
        percent = (ho.shares / total_shares_value) * 100.0 if total_shares_value else None
        owners_data.append({
            "user_id": u.id,
            "username": username,
            "email": u.email,
            "shares": ho.shares,
            "percent": round(percent, 2) if percent is not None else None,
        })

    main_owner_id = None
    owner_username = None
    owner_email = None

    if owners_data:
        main = max(owners_data, key=lambda o: o.get("shares", 0))
        main_owner_id = main["user_id"]
        owner_username = main["username"]
        owner_email = main.get("email")

    if not active_listings:
        if not owners_data:
            status = 'free'
        elif len(owners_data) == 1 and owners_data[0]["shares"] == total_shares_value:
            status = 'sold'
        else:
            status = 'fractional'

    listings_data = []
    for lst in active_listings:
        seller_user = lst.seller
        listings_data.append({
            "id": str(lst.id),
            "seller_id": lst.seller_id,
            "seller_username": seller_user.username if seller_user else None,
            "share_count": int(lst.share_count) if getattr(lst, "share_count", None) is not None else None,
            "price": float(lst.price) if lst.price is not None else None,
            "currency": getattr(lst, 'currency', 'PLN') or "PLN",
        })

    return JsonResponse({
        "ok": True,
        "id_fme": h.id_fme,
        "name": h.name,
        "status": status,
        "levels": float(h.fme_levels) if h.fme_levels is not None else None,
        "height": float(h.fme_height) if h.fme_height is not None else None,
        "h3_res": h.h3_res,
        "h3_id": h.h3_id,
        "created_at": h.created_at.isoformat() if h.created_at else None,
        "attrs": h.attrs,
        "lat": lat,
        "lon": lon,
        "owner_id": main_owner_id,
        "owner_username": owner_username,
        "owner_email": owner_email,
        "price": price,
        "currency": currency,
        "listing_id": listing_id,
        "total_shares": total_shares_value,
        "listing_shares": listing_shares,
        "owners": owners_data,
        "listings": listings_data,
    })


@ratelimit(key='ip', rate='30/m', block=True)
@require_GET
@csrf_protect
@ensure_csrf_cookie
@require_jwt
def listings_nearby(request):
    page = request.GET.get("page", 1)
    per_page = request.GET.get("per_page", 20)
    price_min_raw = request.GET.get("price_min")
    price_max_raw = request.GET.get("price_max")

    try:
        per_page = max(1, min(int(per_page), 100))
    except (ValueError, TypeError):
        return JsonResponse({'ok': False, 'error': 'INVALID_PER_PAGE'}, status=400)

    try:
        page = max(1, int(page))
    except (ValueError, TypeError):
        return JsonResponse({'ok': False, 'error': 'INVALID_PAGE'}, status=400)

    qs = Listing.objects.filter(status="active").select_related('house').order_by('price')

    if price_min_raw:
        try:
            qs = qs.filter(price__gte=float(price_min_raw))
        except (ValueError, TypeError):
            return JsonResponse({'ok': False, 'error': 'INVALID_PRICE_MIN'}, status=400)

    if price_max_raw:
        try:
            qs = qs.filter(price__lte=float(price_max_raw))
        except (ValueError, TypeError):
            return JsonResponse({'ok': False, 'error': 'INVALID_PRICE_MAX'}, status=400)

    paginator = Paginator(qs, per_page)
    page_obj = paginator.get_page(page)

    user_id = request.user.id
    results = []

    for lst in page_obj.object_list:
        h = lst.house
        if not h:
            continue

        results.append({
            "id_fme": h.id_fme,
            "name": h.name or h.id_fme,
            "price": float(lst.price) if lst.price is not None else None,
            "currency": getattr(lst, 'currency', 'PLN') or "PLN",
            "lat": h.lat,
            "lon": h.lon,
            "height": float(h.fme_height) if h.fme_height else None,
            "total_shares": int(getattr(h, "total_shares", 1) or 1),
            "listing_id": str(lst.id),
            "share_count": int(lst.share_count) if lst.share_count is not None else None,
            "is_mine": (lst.seller_id == user_id),
            "seller_id": lst.seller_id,
        })

    return JsonResponse({
        "ok": True,
        "results": results,
        "page": page_obj.number,
        "pages": paginator.num_pages,
        "total": paginator.count,
    })


@ratelimit(key='ip', rate='30/m', block=True)
@require_GET
@csrf_protect
@ensure_csrf_cookie
@require_jwt
def houses_free_nearby(request):
    page = request.GET.get("page", 1)
    per_page = request.GET.get("per_page", 20)

    try:
        per_page = max(1, min(int(per_page), 100))
    except (ValueError, TypeError):
        return JsonResponse({'ok': False, 'error': 'INVALID_PER_PAGE'}, status=400)

    try:
        page = max(1, int(page))
    except (ValueError, TypeError):
        return JsonResponse({'ok': False, 'error': 'INVALID_PAGE'}, status=400)

    qs = House.objects.filter(
        ownerships__isnull=True,
        lat__isnull=False,
        lon__isnull=False,
    ).order_by('id_fme')

    paginator = Paginator(qs, per_page)
    page_obj = paginator.get_page(page)

    results = []
    for h in page_obj.object_list:
        height = None
        try:
            height = float(h.fme_height) if h.fme_height is not None else None
        except (ValueError, TypeError):
            pass

        results.append({
            "id_fme": h.id_fme,
            "name": h.name or h.id_fme,
            "lat": h.lat,
            "lon": h.lon,
            "height": height,
            "total_shares": int(getattr(h, "total_shares", 1) or 1),
        })

    return JsonResponse({
        "ok": True,
        "results": results,
        "page": page_obj.number,
        "pages": paginator.num_pages,
        "total": paginator.count,
    })


@ratelimit(key='ip', rate='30/m', block=True)
@require_GET
@csrf_protect
@ensure_csrf_cookie
@require_jwt
def api_my_houses(request):
    user_listings_prefetch = Prefetch(
        'house__listings',
        queryset=Listing.objects.filter(seller=request.user, status='active'),
        to_attr='user_active_listings'
    )
    ownerships = HouseOwnership.objects.filter(user=request.user).select_related('house').prefetch_related(user_listings_prefetch)

    houses = []
    for o in ownerships:
        h = o.house
        total = h.total_shares or 1

        user_listings = getattr(h, 'user_active_listings', [])
        listing = user_listings[0] if user_listings else None

        houses.append({
            "id_fme": h.id_fme,
            "name": h.name or h.id_fme,
            "lat": h.lat,
            "lon": h.lon,
            "shares": o.shares,
            "total_shares": total,
            "percent": round((o.shares / total) * 100, 2),
            "has_listing": listing is not None,
            "listing_id": str(listing.id) if listing else None,
            "listing_price": float(listing.price) if listing else None,
            "listing_shares": listing.share_count if listing else None,
            "listing_currency": listing.currency if listing else "PLN",
        })

    return JsonResponse({"ok": True, "houses": houses})


@ratelimit(key='ip', rate='30/m', block=True)
@require_GET
@csrf_protect
@ensure_csrf_cookie
@require_jwt
def api_my_transactions(request):
    user = request.user
    page = request.GET.get('page', 1)
    per_page = request.GET.get('per_page', 20)

    try:
        per_page = max(1, min(int(per_page), 100))
    except (ValueError, TypeError):
        return JsonResponse({'ok': False, 'error': 'INVALID_PER_PAGE'}, status=400)

    try:
        page = max(1, int(page))
    except (ValueError, TypeError):
        return JsonResponse({'ok': False, 'error': 'INVALID_PAGE'}, status=400)

    buyer_txs = Transaction.objects.filter(
        buyer=user,
        status='completed'
    ).select_related('house', 'seller', 'listing')

    seller_txs = Transaction.objects.filter(
        seller=user,
        status='completed'
    ).select_related('house', 'buyer', 'listing')

    all_txs = []

    for tx in buyer_txs:
        h = tx.house
        seller = tx.seller
        all_txs.append({
            "id": str(tx.id),
            "role": "buyer",
            "house_name": h.name or h.id_fme if h else "Unknown",
            "house_id_fme": h.id_fme if h else None,
            "house_lat": h.lat if h else None,
            "house_lon": h.lon if h else None,
            "shares": tx.shares,
            "amount": float(tx.amount) if tx.amount else None,
            "currency": tx.currency or "PLN",
            "created_at": tx.completed_at.isoformat() if tx.completed_at else (tx.created_at.isoformat() if tx.created_at else None),
            "counterparty": seller.username if seller else None,
            "counterparty_id": seller.id if seller else None,
            "status": tx.status,
        })

    for tx in seller_txs:
        h = tx.house
        buyer = tx.buyer
        all_txs.append({
            "id": str(tx.id),
            "role": "seller",
            "house_name": h.name or h.id_fme if h else "Unknown",
            "house_id_fme": h.id_fme if h else None,
            "house_lat": h.lat if h else None,
            "house_lon": h.lon if h else None,
            "shares": tx.shares,
            "amount": float(tx.amount) if tx.amount else None,
            "currency": tx.currency or "PLN",
            "created_at": tx.completed_at.isoformat() if tx.completed_at else (tx.created_at.isoformat() if tx.created_at else None),
            "counterparty": buyer.username if buyer else None,
            "counterparty_id": buyer.id if buyer else None,
            "status": tx.status,
        })

    all_txs.sort(key=lambda x: x.get('created_at') or '', reverse=True)

    start = (page - 1) * per_page
    end = start + per_page
    paginated = all_txs[start:end]

    return JsonResponse({
        "ok": True,
        "transactions": paginated,
        "page": page,
        "pages": -(-len(all_txs) // per_page),
        "total": len(all_txs),
    })