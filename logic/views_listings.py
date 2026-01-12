from django.http import JsonResponse
from django.views.decorators.http import require_GET
from django.db.models import Q
from django.core.paginator import Paginator

from logic.models import Listing, House


@require_GET
def api_listings(request):
    status = request.GET.get('status', 'active')
    order_by = request.GET.get('order_by', 'price')
    min_price = request.GET.get('min_price')
    max_price = request.GET.get('max_price')
    search = request.GET.get('search', '').strip()
    page = request.GET.get('page', 1)
    per_page = request.GET.get('per_page', 20)

    try:
        per_page = min(int(per_page), 100)
    except (ValueError, TypeError):
        return JsonResponse({'ok': False, 'error': 'INVALID_PER_PAGE'}, status=400)

    try:
        page = int(page)
    except (ValueError, TypeError):
        return JsonResponse({'ok': False, 'error': 'INVALID_PAGE'}, status=400)

    allowed_orders = ['price', '-price', 'valid_from', '-valid_from', 'share_count', '-share_count']
    if order_by not in allowed_orders:
        return JsonResponse({'ok': False, 'error': 'INVALID_ORDER_BY'}, status=400)

    qs = Listing.objects.all()

    if status:
        qs = qs.filter(status=status)

    if min_price:
        try:
            qs = qs.filter(price__gte=float(min_price))
        except (ValueError, TypeError):
            return JsonResponse({'ok': False, 'error': 'INVALID_MIN_PRICE'}, status=400)

    if max_price:
        try:
            qs = qs.filter(price__lte=float(max_price))
        except (ValueError, TypeError):
            return JsonResponse({'ok': False, 'error': 'INVALID_MAX_PRICE'}, status=400)

    if search:
        house_ids = House.objects.filter(
            Q(name__icontains=search) | Q(h3_id__icontains=search)
<<<<<<< HEAD
        ).values_list('id', flat=True)
        qs = qs.filter(house__in=house_ids)
=======
        ).values_list('id_fme', flat=True)
        qs = qs.filter(house_id__in=house_ids)
>>>>>>> 7ee9b21 (Inital at 01.12.2026)

    qs = qs.order_by(order_by)

    paginator = Paginator(qs, per_page)
    page_obj = paginator.get_page(page)

    listing_list = list(page_obj.object_list)
<<<<<<< HEAD
    house_ids = [l.house for l in listing_list]
    houses = {h.id: h for h in House.objects.filter(id__in=house_ids)}

    listings_data = []
    for listing in listing_list:
        house = houses.get(listing.house)
        listings_data.append({
            'id': str(listing.id),
            'house_id': str(listing.house),
            'house_name': house.name if house else None,
            'house_lat': house.lat if house else None,
            'house_lon': house.lon if house else None,
            'seller_id': listing.seller,
=======
    house_ids = [l.house_id for l in listing_list]
    houses = {h.id_fme: h for h in House.objects.filter(id_fme__in=house_ids)}

    listings_data = []
    for listing in listing_list:
        house = houses.get(listing.house_id)
        listings_data.append({
            'id': str(listing.id),
            'house_id': str(listing.house_id),
            'house_name': house.name if house else None,
            'house_lat': house.lat if house else None,
            'house_lon': house.lon if house else None,
            'seller_id': listing.seller_id,
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
            'price': float(listing.price),
            'currency': listing.currency,
            'share_count': listing.share_count,
            'status': listing.status,
            'valid_from': listing.valid_from.isoformat() if listing.valid_from else None,
<<<<<<< HEAD
            'valid_to': listing.valid_to.isoformat() if listing.valid_to else None,
=======
            'valid_to': getattr(listing, 'valid_to', None).isoformat() if getattr(listing, 'valid_to', None) else None,
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
        })

    return JsonResponse({
        'ok': True,
        'listings': listings_data,
        'total': paginator.count,
        'page': page_obj.number,
        'pages': paginator.num_pages,
    })


@require_GET
def api_listing_detail(request, listing_id):
    try:
        listing = Listing.objects.get(id=listing_id)
    except Listing.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'NOT_FOUND'}, status=404)

<<<<<<< HEAD
    house = House.objects.filter(id=listing.house).first()
=======
    house = House.objects.filter(id_fme=listing.house_id).first()
>>>>>>> 7ee9b21 (Inital at 01.12.2026)

    return JsonResponse({
        'ok': True,
        'listing': {
            'id': str(listing.id),
<<<<<<< HEAD
            'house_id': str(listing.house),
            'house': {
                'id': str(house.id),
=======
            'house_id': str(listing.house_id),
            'house': {
                'id': str(house.id_fme),
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
                'name': house.name,
                'lat': house.lat,
                'lon': house.lon,
                'h3_id': house.h3_id,
                'total_shares': house.total_shares,
                'attrs': house.attrs,
            } if house else None,
<<<<<<< HEAD
            'seller_id': listing.seller,
=======
            'seller_id': listing.seller_id,
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
            'price': float(listing.price),
            'currency': listing.currency,
            'share_count': listing.share_count,
            'status': listing.status,
            'valid_from': listing.valid_from.isoformat() if listing.valid_from else None,
<<<<<<< HEAD
            'valid_to': listing.valid_to.isoformat() if listing.valid_to else None,
=======
            'valid_to': getattr(listing, 'valid_to', None).isoformat() if getattr(listing, 'valid_to', None) else None,
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
        }
    })


@require_GET
def api_listings_cheapest(request):
    limit = request.GET.get('limit', 20)
    try:
        limit = min(int(limit), 50)
    except (ValueError, TypeError):
        return JsonResponse({'ok': False, 'error': 'INVALID_LIMIT'}, status=400)

    qs = Listing.objects.filter(status='active').order_by('price')[:limit]

    listing_list = list(qs)
<<<<<<< HEAD
    house_ids = [l.house for l in listing_list]
    houses = {h.id: h for h in House.objects.filter(id__in=house_ids)}

    listings_data = []
    for listing in listing_list:
        house = houses.get(listing.house)
        listings_data.append({
            'id': str(listing.id),
            'house_id': str(listing.house),
=======
    house_ids = [l.house_id for l in listing_list]
    houses = {h.id_fme: h for h in House.objects.filter(id_fme__in=house_ids)}

    listings_data = []
    for listing in listing_list:
        house = houses.get(listing.house_id)
        listings_data.append({
            'id': str(listing.id),
            'house_id': str(listing.house_id),
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
            'house_name': house.name if house else None,
            'price': float(listing.price),
            'currency': listing.currency,
            'share_count': listing.share_count,
        })

    return JsonResponse({'ok': True, 'listings': listings_data})


@require_GET
def api_listings_by_house(request, house_id):
<<<<<<< HEAD
    qs = Listing.objects.filter(house=house_id, status='active').order_by('price')
=======
    qs = Listing.objects.filter(house_id=house_id, status='active').order_by('price')
>>>>>>> 7ee9b21 (Inital at 01.12.2026)

    listings_data = []
    for listing in qs:
        listings_data.append({
            'id': str(listing.id),
<<<<<<< HEAD
            'house_id': str(listing.house),
            'seller_id': listing.seller,
=======
            'house_id': str(listing.house_id),
            'seller_id': listing.seller_id,
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
            'price': float(listing.price),
            'currency': listing.currency,
            'share_count': listing.share_count,
            'valid_from': listing.valid_from.isoformat() if listing.valid_from else None,
<<<<<<< HEAD
            'valid_to': listing.valid_to.isoformat() if listing.valid_to else None,
=======
            'valid_to': getattr(listing, 'valid_to', None).isoformat() if getattr(listing, 'valid_to', None) else None,
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
        })

    return JsonResponse({'ok': True, 'listings': listings_data})


@require_GET
def api_my_listings(request):
    if not request.user.is_authenticated:
        return JsonResponse({'ok': False, 'error': 'AUTH_REQUIRED'}, status=401)

<<<<<<< HEAD
    qs = Listing.objects.filter(seller=request.user.id).order_by('-valid_from')

    listing_list = list(qs)
    house_ids = [l.house for l in listing_list]
    houses = {h.id: h for h in House.objects.filter(id__in=house_ids)}

    listings_data = []
    for listing in listing_list:
        house = houses.get(listing.house)
        listings_data.append({
            'id': str(listing.id),
            'house_id': str(listing.house),
=======
    qs = Listing.objects.filter(seller=request.user).order_by('-valid_from')

    listing_list = list(qs)
    house_ids = [l.house_id for l in listing_list]
    houses = {h.id_fme: h for h in House.objects.filter(id_fme__in=house_ids)}

    listings_data = []
    for listing in listing_list:
        house = houses.get(listing.house_id)
        listings_data.append({
            'id': str(listing.id),
            'house_id': str(listing.house_id),
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
            'house_name': house.name if house else None,
            'price': float(listing.price),
            'currency': listing.currency,
            'share_count': listing.share_count,
            'status': listing.status,
            'valid_from': listing.valid_from.isoformat() if listing.valid_from else None,
<<<<<<< HEAD
            'valid_to': listing.valid_to.isoformat() if listing.valid_to else None,
=======
            'valid_to': getattr(listing, 'valid_to', None).isoformat() if getattr(listing, 'valid_to', None) else None,
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
        })

    return JsonResponse({'ok': True, 'listings': listings_data})