from django.contrib.auth.decorators import login_required
from django.http import JsonResponse, Http404
from django.views.decorators.http import require_GET
from django.contrib.auth import get_user_model

from logic.models import House, Listing, HouseOwnership

User = get_user_model()


def get_house_or_404(id_fme: str):
    try:
        return House.objects.get(id_fme=id_fme)
    except House.DoesNotExist:
        raise Http404


def login_required_json(view_func):
    """Decorator that returns JSON 401 instead of redirecting."""
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({"ok": False, "error": "NOT_AUTHENTICATED"}, status=401)
        return view_func(request, *args, **kwargs)
    return wrapper


@require_GET
def house_detail(request, id_fme: str):
    """Get house info with owners and listings."""
    try:
        h = House.objects.get(id_fme=id_fme)
    except House.DoesNotExist:
        raise Http404("House not found")

    a = h.attrs or {}

    def _num(x):
        try:
            return float(x)
        except (TypeError, ValueError):
            return None

    lat = _num(getattr(h, "lat", None)) or _num(a.get("FME_lat")) or _num(a.get("lat"))
    lon = _num(getattr(h, "lon", None)) or _num(a.get("FME_lon")) or _num(a.get("lon"))

    active_listings = list(Listing.objects.filter(house=h, status='active'))

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
        owner_user = User.objects.filter(id=main_owner_id).first()
        if owner_user:
            owner_email = owner_user.email

    if not active_listings:
        if not owners_data:
            status = 'free'
        elif len(owners_data) == 1 and owners_data[0]["shares"] == total_shares_value:
            status = 'sold'
        else:
            status = 'fractional'

    listings_data = []
    for lst in active_listings:
        seller_user = User.objects.filter(id=lst.seller_id).first()
        listings_data.append({
            "id": str(lst.id),
            "seller_id": lst.seller_id,
            "seller_username": seller_user.username if seller_user else None,
            "share_count": int(lst.share_count) if getattr(lst, "share_count", None) is not None else None,
            "price": float(lst.price) if lst.price is not None else None,
            "currency": getattr(lst, 'currency', 'PLN') or "PLN",
        })

    return JsonResponse({
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


@login_required_json
@require_GET
def listings_nearby(request):
    """Get active listings sorted by price (simple version)."""
    try:
        page = int(request.GET.get("page", "1"))
    except ValueError:
        page = 1
    if page < 1:
        page = 1

    price_min_raw = request.GET.get("price_min")
    price_max_raw = request.GET.get("price_max")

    qs = Listing.objects.filter(status="active").order_by('price')

    if price_min_raw:
        try:
            qs = qs.filter(price__gte=float(price_min_raw))
        except ValueError:
            pass
    if price_max_raw:
        try:
            qs = qs.filter(price__lte=float(price_max_raw))
        except ValueError:
            pass

    # Simple pagination
    page_size = 20
    total_results = qs.count()
    start = (page - 1) * page_size
    listings = list(qs[start:start + page_size])

    house_ids = [lst.house_id for lst in listings]
    houses = {h.id_fme: h for h in House.objects.filter(id_fme__in=house_ids)}

    user_id = request.user.id
    results = []

    for lst in listings:
        h = houses.get(lst.house_id)
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
        "page": page,
        "page_size": page_size,
        "total_results": total_results,
    })


@login_required_json
@require_GET
def houses_free_nearby(request):
    """Get unowned houses (simple version without distance calc)."""
    try:
        page = int(request.GET.get("page", "1"))
    except ValueError:
        page = 1
    if page < 1:
        page = 1

    qs = House.objects.filter(
        ownerships__isnull=True,
        lat__isnull=False,
        lon__isnull=False,
    ).order_by('id_fme')

    page_size = 20
    total_results = qs.count()
    start = (page - 1) * page_size
    houses = list(qs[start:start + page_size])

    results = []
    for h in houses:
        height = None
        try:
            height = float(h.fme_height) if h.fme_height is not None else None
        except Exception:
            pass

        results.append({
            "id": str(h.id) if hasattr(h, 'id') else h.id_fme,
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
        "page": page,
        "page_size": page_size,
        "total_results": total_results,
    })


@login_required_json
@require_GET
def api_my_houses(request):
    ownerships = HouseOwnership.objects.filter(user=request.user).select_related('house')

    houses = []
    for o in ownerships:
        h = o.house
        total = h.total_shares or 1

        listing = Listing.objects.filter(house=h, seller=request.user, status='active').first()

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


@login_required_json
@require_GET
def api_my_transactions(request):
    """Get user's transaction history (purchases and sales) from Transaction model."""
    from logic.models import Transaction

    user = request.user

    # Get all completed transactions where user is buyer or seller
    transactions_as_buyer = Transaction.objects.filter(
        buyer=user,
        status='completed'
    ).select_related('house', 'seller', 'listing')

    transactions_as_seller = Transaction.objects.filter(
        seller=user,
        status='completed'
    ).select_related('house', 'buyer', 'listing')

    transactions = []

    # Add purchases (user was buyer)
    for tx in transactions_as_buyer:
        h = tx.house
        seller = tx.seller
        transactions.append({
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

    # Add sales (user was seller)
    for tx in transactions_as_seller:
        h = tx.house
        buyer = tx.buyer
        transactions.append({
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

    # Sort by date, most recent first
    transactions.sort(key=lambda x: x.get('created_at') or '', reverse=True)

    return JsonResponse({"ok": True, "transactions": transactions})