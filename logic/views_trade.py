# logic/views_trade.py
import uuid
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST, require_GET
from django.db.models import Q

from django.db import transaction
from django.utils import timezone
from django.http import JsonResponse, Http404
from django.contrib.auth import get_user_model

from logic.models import House, Listing, Trade, Conversation, Message, HouseOwnership



User = get_user_model()
@login_required
@require_POST
def trade_finalize(request):
    """
    Centralna finalizacja transakcji (wymaga listing_id):

    - Sprzedający (listing.seller): tylko potwierdza gotowość (listing pozostaje 'active').
    - Kupujący:
        * zamyka listing,
        * tworzy Trade,
        * przenosi własność udziałów (share_count) z HouseOwnership.
    """
    listing_id = request.POST.get('listing_id')
    if not listing_id:
        return JsonResponse({"ok": False, "error": "MISSING_LISTING_ID"}, status=400)

    try:
        listing = Listing.objects.get(id=listing_id)
    except Listing.DoesNotExist:
        return JsonResponse({"ok": False, "error": "LISTING_NOT_FOUND"}, status=404)

    user_id = request.user.id
    is_seller = str(listing.seller) == str(user_id)

    # Sprzedający: tylko potwierdza (ogłoszenie dalej aktywne)
    if is_seller:
        if listing.status != 'active':
            return JsonResponse({"ok": False, "error": "NOT_ACTIVE"}, status=400)
        return JsonResponse({"ok": True, "message": "SELLER_CONFIRMED", "role": "seller"})

    # Kupujący finalizuje
    if listing.status != 'active':
        return JsonResponse({"ok": False, "error": "ALREADY_SOLD"}, status=400)

    final_amount = None
    final_currency = None
    used_shares = None

    with transaction.atomic():
        # blokujemy wiersz listingu
        lst = Listing.objects.select_for_update().get(id=listing.id)
        if lst.status != 'active':
            return JsonResponse({"ok": False, "error": "ALREADY_SOLD"}, status=400)

        # pobierz dom po UUID z listingu
        try:
            h = House.objects.get(id=lst.house)
        except House.DoesNotExist:
            return JsonResponse({"ok": False, "error": "HOUSE_NOT_FOUND"}, status=404)

        total_shares = h.total_shares or 1

        # liczba udziałów z listingu
        if total_shares > 1:
            if lst.share_count is None or lst.share_count <= 0:
                return JsonResponse({"ok": False, "error": "INVALID_LISTING_SHARES"}, status=400)
            share_count = int(lst.share_count)
        else:
            share_count = 1

        used_shares = share_count

        # sprzedający musi mieć odpowiednie udziały
        try:
            seller_ho = (
                HouseOwnership.objects
                .select_for_update()
                .get(house=h, user_id=lst.seller)
            )
        except HouseOwnership.DoesNotExist:
            return JsonResponse({"ok": False, "error": "NO_SELLER_SHARES"}, status=400)

        if seller_ho.shares < share_count:
            return JsonResponse({"ok": False, "error": "NOT_ENOUGH_SHARES"}, status=400)

        # 1) przesuń udziały od sprzedającego do kupującego
        seller_ho.shares -= share_count
        if seller_ho.shares == 0:
            seller_ho.delete()
        else:
            seller_ho.save(update_fields=['shares'])

        buyer_ho, created = (
            HouseOwnership.objects
            .select_for_update()
            .get_or_create(
                house=h,
                user_id=user_id,
                defaults={'shares': share_count},
            )
        )
        if not created:
            buyer_ho.shares += share_count
            buyer_ho.save(update_fields=['shares'])

        # 2) zamknij listing
        lst.status = 'closed'
        lst.valid_to = timezone.now()
        lst.save(update_fields=['status', 'valid_to'])

        # 3) zapisz transakcję finansową
        Trade.objects.create(
            id=uuid.uuid4(),
            listing=lst.id,        # <-- TU ZMIANA: zapisujesz UUID, nie obiekt
            buyer=user_id,
            seller=lst.seller,
            amount=lst.price,
            currency=lst.currency,
            status='settled',
            created_at=timezone.now()
        )

        # status domu informacyjnie: czy są jeszcze współwłaściciele
        has_owners = HouseOwnership.objects.filter(house=h).exists()
        h.status = 'sold' if has_owners else 'free'
        h.save(update_fields=['status'])

        final_amount = lst.price
        final_currency = lst.currency

    # (opcjonalnie) odnotuj finalizację w rozmowie buyer↔seller o tym domu
    conv = Conversation.objects.filter(
        house=listing.house,
        buyer_id=user_id,
        seller_id=listing.seller
    ).first()

    if conv:
        conv.status = 'sold'
        conv.save(update_fields=['status'])
        Message.objects.create(
            conversation=conv,
            sender=request.user,
            text="Transakcja zrealizowana.",
            message_type='system'
        )

    return JsonResponse({
        "ok": True,
        "role": "buyer",
        "shares": int(used_shares) if used_shares is not None else None,
        "amount": str(final_amount) if final_amount is not None else None,
        "currency": final_currency or "",
    })

@login_required
@require_GET
def trades_mine(request):
    """
    Lista transakcji bieżącego użytkownika (buyer lub seller),
    z filtrowaniem active/archived i paginacją po 20 sztuk.

    ACTIVE:
      - (na przyszłość) transakcje Trade != 'settled'
      - aktywne listingi użytkownika (seller = current user, status='active')

    ARCHIVED:
      - transakcje Trade ze statusem 'settled'
    """
    user = request.user

    # Bazowy queryset transakcji użytkownika
    trades_all = Trade.objects.filter(Q(buyer=user.id) | Q(seller=user.id))

    # Status z query stringa
    status = (request.GET.get("status") or "").strip().lower()

    # Zbudujemy jeden wspólny "items" z Trade + Listing
    items = []

    # --- ARCHIWALNE: tylko Trade ze statusem 'settled' ---
    if status == "archived":
        trades_qs = trades_all.filter(status="settled").order_by("-created_at")
        for tr in trades_qs:
            row = _build_trade_row(tr, user)
            if row:
                items.append(row)

    # --- AKTYWNE (domyślnie) ---
    else:
        # 1) Trade, które nie są jeszcze 'settled' (na przyszłość)
        trades_qs = trades_all.exclude(status="settled").order_by("-created_at")
        for tr in trades_qs:
            row = _build_trade_row(tr, user)
            if row:
                items.append(row)

        # 2) Wszystkie aktywne listingi usera jako sprzedawcy
        listings_qs = Listing.objects.filter(seller=user.id, status="active").order_by("-valid_from")
        for lst in listings_qs:
            row = _build_listing_row(lst, user)
            if row:
                items.append(row)

    # Posortuj po dacie malejąco (Trade + Listing razem)
    # Każdy row ma pole pomocnicze "date_dt"
    items.sort(key=lambda r: r.get("date_dt") or timezone.datetime.min, reverse=True)

    # Paginacja po 20
    try:
        page = int(request.GET.get("page", "1"))
    except ValueError:
        page = 1
    if page < 1:
        page = 1

    page_size = 20
    start = (page - 1) * page_size
    end = start + page_size

    page_items = items[start:end]

    # Usuń pomocnicze date_dt z outputu
    for row in page_items:
        row.pop("date_dt", None)

    return JsonResponse(page_items, safe=False)


def _build_trade_row(tr: Trade, user) -> dict | None:
    """
    Buduje "wiersz" do panelu transakcji na podstawie obiektu Trade.
    """
    try:
        listing = Listing.objects.get(id=tr.listing)
    except Listing.DoesNotExist:
        return None

    house = House.objects.filter(id=listing.house).first()

    house_name = house.name if house else None
    house_id_fme = house.id_fme if house else None

    # rola usera: buyer / seller
    if str(tr.buyer) == str(user.id):
        role = "buyer"
        other_id = tr.seller
    else:
        role = "seller"
        other_id = tr.buyer

    other_user = User.objects.filter(id=other_id).first()
    counterparty = other_user.username if other_user else None

    # udziały i procent
    total_shares = int(getattr(house, "total_shares", 1) or 1) if house else 1
    raw_shares = getattr(listing, "share_count", None)
    shares = int(raw_shares) if raw_shares is not None else total_shares
    if total_shares > 0:
        percent = (shares / total_shares) * 100.0
    else:
        percent = 0.0

    # powiązany wątek rozmowy (jeśli był)
    conv = None
    if house:
        conv = Conversation.objects.filter(
            house=house,
            buyer_id=tr.buyer,
            seller_id=tr.seller,
        ).first()
    conv_id = str(conv.id) if conv else None

    # data jako datetime (pomocniczo do sortowania)
    date_dt = tr.created_at or timezone.now()

    return {
        "date": tr.created_at.isoformat() if tr.created_at else None,
        "date_dt": date_dt,
        "house_name": house_name,
        "house_id_fme": house_id_fme,
        "role": role,
        "counterparty": counterparty,
        "shares": shares,
        "amount": str(tr.amount) if tr.amount is not None else None,
        "percent": round(percent, 2),
        "status": tr.status,
        "conversation_id": conv_id,
    }


def _build_listing_row(lst: Listing, user) -> dict | None:
    """
    Buduje "wiersz" dla aktywnego listingu usera (seller=user.id).
    Traktujemy to jako "aktywną transakcję w toku".
    """
    house = House.objects.filter(id=lst.house).first()
    if not house:
        return None

    house_name = house.name
    house_id_fme = house.id_fme

    # rola: zawsze sprzedający
    role = "seller"
    counterparty = None  # listing jest otwarty – nie ma konkretnego kontrahenta

    total_shares = int(getattr(house, "total_shares", 1) or 1)
    raw_shares = getattr(lst, "share_count", None)
    shares = int(raw_shares) if raw_shares is not None else total_shares
    if total_shares > 0:
        percent = (shares / total_shares) * 100.0
    else:
        percent = 0.0

    # ewentualny conv – można by szukać po listing_id, ale na razie None
    conv_id = None

    date_dt = lst.valid_from or timezone.now()

    return {
        "date": lst.valid_from.isoformat() if lst.valid_from else None,
        "date_dt": date_dt,
        "house_name": house_name,
        "house_id_fme": house_id_fme,
        "role": role,
        "counterparty": counterparty,
        "shares": shares,
        "amount": str(lst.price) if lst.price is not None else None,
        "percent": round(percent, 2),
        "status": "listing_active",
        "conversation_id": conv_id,
    }
