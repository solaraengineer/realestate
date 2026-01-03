import uuid
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse, Http404
from django.views.decorators.http import require_GET, require_POST
from django.db.models import Q
from django.db import transaction
from django.utils import timezone
from decimal import Decimal, InvalidOperation
from django.db.utils import ProgrammingError, OperationalError
from django.contrib.auth import get_user_model
from logic.models import Conversation, Message, House, Listing, Trade, Offer, Negotiation, HouseOwnership

from logic.ai_agent import generate_ai_reply

User = get_user_model()

# -----------------------
# POMOCNICZE SERIALIZERY
# -----------------------

def _serialize_conversation_summary(conv, user):
    last_msg = conv.messages.order_by('-created_at').first()
    other = conv.seller if user.id == conv.buyer_id else conv.buyer
    other_name = other.username if other else '(brak)'

    house = getattr(conv, 'house', None)
    house_name = (house.name or house.id_fme) if house else '(house)'

    awaiting_user = bool(last_msg and last_msg.sender_id != user.id)

    return {
        "id": str(conv.id),
        "other_user": other_name,
        "house": house_name,
        "last_message": (last_msg.text if last_msg else ''),
        "last_time": (last_msg.created_at.isoformat() if last_msg else None),
        "awaiting_user": awaiting_user,
        "status": conv.status,
    }


def _serialize_message(msg):
    return {
        "id": str(msg.id),
        "sender_id": msg.sender_id,
        "sender_name": msg.sender.username,
        "text": msg.text,
        "message_type": msg.message_type,
        "time": msg.created_at.isoformat(),
    }


def _serialize_offer(ofr):
    if not ofr:
        return None
    return {
        "id": str(ofr.id),
        "conversation_id": str(ofr.conversation_id),
        "user_id": ofr.user_id,
        "price": str(ofr.price),
        "shares": ofr.shares,
        "type": ofr.type,              # 'offer' lub 'counter'
        "accepted": ofr.accepted,
        "created_at": ofr.created_at.isoformat(),
    }


def _assert_participant(conv, user):
    if not (conv.buyer_id == user.id or conv.seller_id == user.id):
        raise Http404("Conversation not found")


def _find_seller_for_house(house):
    """
    Ustal sprzedającego: główny współwłaściciel (najwięcej udziałów)
    albo sprzedawca z aktywnego listingu.
    """
    # 1) główny współwłaściciel z HouseOwnership
    ho = (
        HouseOwnership.objects
        .filter(house=house)
        .select_related('user')
        .order_by('-shares')
        .first()
    )
    if ho and ho.user:
        return ho.user

    # 2) fallback: sprzedawca z aktywnego listingu
    lst = Listing.objects.filter(house=house.id, status='active').first()
    if lst:
        return User.objects.filter(id=lst.seller).first()

    return None

def last_offers(conv: Conversation):
    """
    Ostatnie oferty kupującego i sprzedającego: cena + liczba udziałów.
    Ceny preferujemy z historii Offer; Negotiation tylko jako fallback (bez shares).
    """
    buyer_ofr = conv.offers.filter(type='offer').order_by('-created_at').first()
    seller_ofr = conv.offers.filter(type='counter').order_by('-created_at').first()

    buyer_price = buyer_ofr.price if buyer_ofr else None
    buyer_shares = buyer_ofr.shares if buyer_ofr else None
    seller_price = seller_ofr.price if seller_ofr else None
    seller_shares = seller_ofr.shares if seller_ofr else None

    # Fallback do Negotiation TYLKO gdy brak ofert w historii (shares zostają None)
    try:
        from logic.models import Negotiation
        neg = Negotiation.objects.filter(conversation_id=conv.id).first()
    except Exception:
        neg = None

    if buyer_price is None and neg and neg.buyer_price is not None:
        buyer_price = neg.buyer_price
    if seller_price is None and neg and neg.seller_price is not None:
        seller_price = neg.seller_price

    return buyer_price, buyer_shares, seller_price, seller_shares



def allowed_actions_for(conv: Conversation, _neg_ignored, role: str):
    if conv.status == 'stopped':
        return ['stop']

    # bazowo: tylko tekst + stop
    acts = ['send_text', 'stop']

    # kupujący ma "Moja oferta" i "Kupuję"
    if role == 'buyer':
        acts.append('counter')
        acts.append('finalize')

    # sprzedający może dostać "Zgoda" tylko przy oczekującej ofercie kupującego
    if conv.status == 'active' and role == 'seller':
        last = conv.offers.filter(accepted=False, user_id=conv.buyer_id).order_by('-created_at').first()
        if last:
            acts.insert(0, 'accept')

    return acts







# --------------
# LISTA / WĄTEK
# --------------

@login_required
@require_GET
def messages_list(request):
    """
    Lista AKTYWNYCH rozmów bieżącego użytkownika (bez zarchiwizowanych).
    """
    user = request.user
    convs = (
        Conversation.objects
        .filter(Q(buyer=user) | Q(seller=user))
        .exclude(status='stopped')      # <--- TU ukrywamy archiwalne
        .order_by('-created_at')
    )
    data = [_serialize_conversation_summary(c, user) for c in convs]
    return JsonResponse(data, safe=False)

@login_required
@require_GET
def messages_archived(request):
    """
    Lista ZARCHIWIZOWANYCH rozmów (status='stopped').
    Format identyczny jak messages_list.
    """
    user = request.user
    convs = (
        Conversation.objects
        .filter(Q(buyer=user) | Q(seller=user), status='stopped')
        .order_by('-created_at')
    )
    data = [_serialize_conversation_summary(c, user) for c in convs]
    return JsonResponse(data, safe=False)


@login_required
@require_GET
def messages_thread(request, conv_id):
    """Szczegóły rozmowy + widok negocjacji."""
    try:
        conv = Conversation.objects.get(pk=conv_id)
    except Conversation.DoesNotExist:
        raise Http404("Conversation not found")

    _assert_participant(conv, request.user)

    # wiadomości
    msgs = conv.messages.select_related('sender').order_by('created_at')
    data_msgs = [_serialize_message(m) for m in msgs]

    # rola
    role = 'buyer' if request.user.id == conv.buyer_id else 'seller'

    # Twoja dotychczasowa logika allowed
    last_offer = conv.offers.order_by('-created_at').first()
    pending_offer = last_offer if (last_offer and not last_offer.accepted) else None

    if conv.status == 'stopped':
        allowed = ['stop']
    else:
        if role == 'buyer':
            if conv.status == 'agreed':
                allowed = ['finalize', 'send_text', 'stop']
            elif pending_offer and pending_offer.user_id == conv.seller_id:
                allowed = ['finalize', 'counter', 'send_text', 'stop']
            else:
                allowed = ['send_text', 'counter', 'stop']
        else:  # seller
            if pending_offer and pending_offer.user_id == conv.buyer_id:
                allowed = ['accept', 'send_text', 'stop']
            else:
                allowed = ['send_text', 'stop']
        

    # NOWE: scalenie z negocjacyjnymi akcjami + pasek ofert
    buyer_price, buyer_shares, seller_price, seller_shares = last_offers(conv)
    allowed = sorted(set(allowed).union(allowed_actions_for(conv, None, role)))
    can_finalize = ('finalize' in allowed)

    deal = {
        "buyer": float(buyer_price) if buyer_price is not None else None,
        "buyer_shares": int(buyer_shares) if buyer_shares is not None else None,
        "seller": float(seller_price) if seller_price is not None else None,
        "seller_shares": int(seller_shares) if seller_shares is not None else None,
        "role": role,
    }

    return JsonResponse({
        "conversation_id": str(conv.id),
        "role": role,
        "status": conv.status,
        "messages": data_msgs,
        "latest_offer": _serialize_offer(last_offer),
        "allowed_actions": allowed,
        "can_finalize": can_finalize,
        "deal": deal,
    })



# ----------------
# PREPARE (bez tworzenia)
# ----------------

@login_required
@require_GET
def messages_prepare(request):
    """
    Wejście w panel z klikniętego domu – bez zakładania rozmowy.
    Zwraca: czy jest już rozmowa user+dom, i kto jest sprzedającym.
    GET: id_fme=... | house_id=...
    """
    id_fme = request.GET.get('id_fme')
    house_id = request.GET.get('house_id')

    if not id_fme and not house_id:
        return JsonResponse({"ok": False, "error": "MISSING_HOUSE"}, status=400)

    try:
        h = House.objects.get(id_fme=id_fme) if id_fme else House.objects.get(id=house_id)
    except House.DoesNotExist:
        raise Http404("House not found")

    seller_user = _find_seller_for_house(h)

    conv = Conversation.objects.filter(house=h, buyer=request.user, seller=seller_user).first()

    # Można pisać tylko jeśli:
    # - umiemy wskazać sprzedającego
    # - i nie jest nim aktualny użytkownik
    can_message = True
    if not seller_user or seller_user.id == request.user.id:
        can_message = False

    return JsonResponse({
        "ok": True,
        "has_conversation": bool(conv),
        "conversation_id": (str(conv.id) if conv else None),
        "house": {"id": str(h.id), "id_fme": h.id_fme, "name": (h.name or h.id_fme)},
        "seller": ({"id": seller_user.id, "username": seller_user.username} if seller_user else None),
        # podpowiedź dla panelu 4:
        # podpowiedź dla panelu 4:
        "initial_actions": (['send_text', 'counter', 'stop'] if not conv and can_message else []),
        "can_message": can_message,
    })


# --------------
# START (tworzy rozmowę dopiero przy akcji)
# --------------
@login_required
@require_POST
def messages_start(request):
    """
    Tworzy (jeśli trzeba) rozmowę buyer+seller o wskazanym domu.
    Jeśli istnieje stary wątek w statusie 'stopped', wznawia go (status='active').
    POST: id_fme | house_id, opcjonalnie seller_id
    """
    id_fme = request.POST.get('id_fme')
    house_id = request.POST.get('house_id')
    seller_id = request.POST.get('seller_id')

    if not id_fme and not house_id:
        return JsonResponse({"ok": False, "error": "MISSING_HOUSE"}, status=400)

    try:
        h = House.objects.get(id_fme=id_fme) if id_fme else House.objects.get(id=house_id)
    except House.DoesNotExist:
        raise Http404("House not found")

    seller_user = None
    if seller_id:
        seller_user = User.objects.filter(id=seller_id).first()
    if not seller_user:
        seller_user = _find_seller_for_house(h)

    if seller_user and seller_user.id == request.user.id:
        return JsonResponse({"ok": False, "error": "CANNOT_MESSAGE_SELF"}, status=400)

    # jeden wątek na buyer+house (+seller)
    conv = Conversation.objects.filter(house=h, buyer=request.user, seller=seller_user).first()
    if conv:
        # jeśli był zarchiwizowany, wznawiamy
        if conv.status == 'stopped':
            conv.status = 'active'
            conv.save(update_fields=['status'])
            Message.objects.create(
                conversation=conv,
                sender=request.user,
                text="(Wznowiono rozmowę)",
                message_type='system',
            )
    else:
        # nowy wątek
        conv = Conversation.objects.create(house=h, buyer=request.user, seller=seller_user)
        Message.objects.create(
            conversation=conv,
            sender=request.user,
            text="(Rozpoczęto rozmowę)",
            message_type='system',
        )

    return JsonResponse({"ok": True, "conversation_id": str(conv.id)})



# --------------
# TEKST
# --------------

@login_required
@require_POST
def messages_send(request, conv_id):
    """
    Wysyłka zwykłej wiadomości tekstowej.
    """
    try:
        conv = Conversation.objects.get(pk=conv_id)
    except Conversation.DoesNotExist:
        raise Http404("Conversation not found")

    _assert_participant(conv, request.user)

    if conv.status == 'stopped':
        return JsonResponse({"ok": False, "error": "THREAD_CLOSED"}, status=400)

    text = (request.POST.get('text') or '').strip()
    if not text:
        return JsonResponse({"ok": False, "error": "EMPTY_MESSAGE"}, status=400)

    msg = Message.objects.create(
        conversation=conv,
        sender=request.user,
        text=text,
        message_type='text'
    )

    # znajdź uczestnika z włączonym AI, który nie jest nadawcą
    participants = []
    if conv.buyer_id:
        participants.append(conv.buyer)
    if conv.seller_id:
        participants.append(conv.seller)

    for participant in participants:
        if participant and getattr(participant, "ai_auto_reply", False) and participant.id != request.user.id:
            generate_ai_reply(conv, participant)
            break

    return JsonResponse({"ok": True, "message": _serialize_message(msg)})

# --------------
# OFERTA / KONTROFERTA
# --------------
@login_required
@require_POST
def messages_offer(request, conv_id):
    """
    Złóż ofertę (buyer) lub kontrofertę (seller).
    POST: price, shares (dla domów udziałowych).
    """
    try:
        conv = Conversation.objects.get(pk=conv_id)
    except Conversation.DoesNotExist:
        raise Http404("Conversation not found")
    _assert_participant(conv, request.user)

    if conv.status == 'stopped':
        return JsonResponse({"ok": False, "error": "THREAD_CLOSED"}, status=400)

    role = 'buyer' if request.user.id == conv.buyer_id else 'seller'

    # Sprzedający nie może już składać kontrofert – tylko kupujący składa ofertę
    if role == 'seller':
        return JsonResponse({"ok": False, "error": "COUNTER_DISABLED"}, status=400)

    house = getattr(conv, 'house', None)
    total_shares = getattr(house, 'total_shares', 1) or 1


    price_raw = (request.POST.get('price') or '').strip().replace(',', '.')
    shares_raw = (request.POST.get('shares') or '').strip()

    # --- walidacja ceny ---
    try:
        price = Decimal(price_raw)
    except (InvalidOperation, TypeError):
        return JsonResponse({"ok": False, "error": "BAD_PRICE"}, status=400)
    if price <= 0:
        return JsonResponse({"ok": False, "error": "BAD_PRICE"}, status=400)

    # --- walidacja udziałów ---
    shares = None
    if total_shares > 1:
        if not shares_raw:
            return JsonResponse({"ok": False, "error": "MISSING_SHARES"}, status=400)
        try:
            shares = int(shares_raw)
        except (TypeError, ValueError):
            return JsonResponse({"ok": False, "error": "BAD_SHARES"}, status=400)
        if shares <= 0:
            return JsonResponse({"ok": False, "error": "BAD_SHARES"}, status=400)
        if shares > total_shares:
            return JsonResponse({"ok": False, "error": "TOO_MANY_SHARES"}, status=400)

        if role == 'seller':
            # sprzedający nie może oferować więcej udziałów niż posiada
            ho = HouseOwnership.objects.filter(house=house, user=request.user).first()
            if not ho or ho.shares < shares:
                return JsonResponse({"ok": False, "error": "NOT_ENOUGH_SHARES"}, status=400)
    else:
        # dom bez udziałów – zawsze traktujemy jako 1 "pakiet"
        shares = 1

    # --- typ oferty i tekst wiadomości ---
    if role == 'buyer':
        ofr_type = 'offer'
        msg_type = 'offer'
        label = 'Offer'
    else:
        ofr_type = 'counter'
        msg_type = 'counter'
        label = 'Counter-offer'

    with transaction.atomic():
        ofr = Offer.objects.create(
            conversation=conv,
            user=request.user,
            price=price,
            shares=shares,
            type=ofr_type,
            accepted=False,
        )

        if total_shares > 1 and shares is not None:
            text = f"{label}: {price} for {shares} shares"
        else:
            text = f"{label}: {price}"

        msg = Message.objects.create(
            conversation=conv,
            sender=request.user,
            text=text,
            message_type=msg_type,
        )

    return JsonResponse(
        {"ok": True, "offer": _serialize_offer(ofr), "message": _serialize_message(msg)}
    )


# --------------
# AKCEPTACJA OFERTY (sprzedający)
# --------------

@login_required
@require_POST
def messages_accept(request, conv_id):
    """
    Sprzedający akceptuje ostatnią ofertę kupującego i (jeśli trzeba) wystawia/aktualizuje listing na tę cenę.
    """
    try:
        conv = Conversation.objects.get(pk=conv_id)
    except Conversation.DoesNotExist:
        raise Http404("Conversation not found")
    _assert_participant(conv, request.user)

    if request.user.id != conv.seller_id:
        return JsonResponse({"ok": False, "error": "NOT_SELLER"}, status=403)
    if conv.status == 'stopped':
        return JsonResponse({"ok": False, "error": "THREAD_CLOSED"}, status=400)


    # ostatnia niezaakceptowana oferta od kupującego
    ofr = (
        conv.offers
        .filter(accepted=False, user_id=conv.buyer_id)
        .order_by('-created_at')
        .first()
    )
    if not ofr:
        return JsonResponse(
            {"ok": False, "error": "NO_PENDING_BUYER_OFFER"},
            status=400,
        )

    # akceptacja + agreed
    ofr.accepted = True
    ofr.save(update_fields=['accepted'])
    conv.status = 'agreed'
    conv.save(update_fields=['status'])

    # --- ustalenie pakietu udziałów z zaakceptowanej oferty ---
    house = conv.house
    total_shares = house.total_shares or 1

    if total_shares > 1:
        if ofr.shares is None or ofr.shares <= 0:
            return JsonResponse(
                {"ok": False, "error": "MISSING_SHARES"},
                status=400,
            )
        shares = int(ofr.shares)
    else:
        # dom bez podziału – cały dom to 1 "udział"
        shares = 1

    # kto jest sprzedającym (powinien być conv.seller)
    seller_id = conv.seller_id
    if not seller_id:
        seller_user = _find_seller_for_house(conv.house)
        if not seller_user:
            return JsonResponse({"ok": False, "error": "NO_SELLER_DETECTED"}, status=400)
        seller_id = seller_user.id

    # --- walidacja udziałów po stronie sprzedającego ---
    if total_shares > 1:
        ho = HouseOwnership.objects.filter(house=house, user_id=seller_id).first()
        if not ho:
            return JsonResponse({"ok": False, "error": "NO_SELLER_SHARES"}, status=400)
        if shares > ho.shares:
            return JsonResponse({"ok": False, "error": "NOT_ENOUGH_SHARES"}, status=400)

    # --- listing: aktualizacja lub nowy ---
    lst = Listing.objects.filter(
        house=conv.house.id,
        seller=seller_id,
        status='active'
    ).first()

    if lst:
        # uaktualnij cenę (i shares) tak, żeby centralny finalize poszedł po właściwej kwocie/pakiecie
        updated_fields = []
        if lst.price != ofr.price:
            lst.price = ofr.price
            updated_fields.append('price')
        if not lst.currency:
            lst.currency = 'PLN'
            updated_fields.append('currency')
        if total_shares > 1 and (lst.share_count or 1) != shares:
            lst.share_count = shares
            updated_fields.append('share_count')
        if updated_fields:
            lst.save(update_fields=updated_fields)
    else:
        kwargs = {
            "id": uuid.uuid4(),
            "house": conv.house.id,
            "seller": seller_id,
            "price": ofr.price,
            "currency": "PLN",
            "status": "active",
            "valid_from": timezone.now(),
        }
        if total_shares > 1:
            kwargs["share_count"] = shares

        lst = Listing.objects.create(**kwargs)

        # (opcjonalnie) status domu → for_sale
        h = conv.house
        if h.status != 'for_sale':
            h.status = 'for_sale'
            h.save(update_fields=['status'])

    Message.objects.create(
        conversation=conv,
        sender=request.user,
        text=f"Oferta zaakceptowana: {ofr.price} ({shares} udziałów). Wystawiono listing.",
        message_type='agreement'
    )

    return JsonResponse({
        "ok": True,
        "agreed_price": str(ofr.price),
        "shares": shares,
        "listing_id": str(lst.id),
    })



# --------------
# FINALIZACJA (kupujący po akceptacji, lub bezpośrednio sprzedający)
# --------------

# logic/views_messages.py — PODMIEŃ TĘ FUNKCJĘ
@login_required
@require_POST
def messages_finalize(request, conv_id):
    """
    Przygotowanie do centralnej finalizacji:
    - Sprzedający („Sprzedaję”): akceptuje ofertę kupującego i ustala listing (cena + liczba udziałów).
    - Kupujący („Kupuję”): akceptuje kontrofertę sprzedającego lub ostatnią zgodzoną ofertę
      i ustala listing (cena + liczba udziałów).

    Zwraca:
      - przy sukcesie: {"ok": True, "listing_id": "..."}
      - przy konflikcie z publicznym listingiem (tylko u sprzedającego):
        {"ok": False, "error": "PUBLIC_LISTING_WILL_CHANGE", ...}
    """
    try:
        conv = Conversation.objects.get(pk=conv_id)
    except Conversation.DoesNotExist:
        raise Http404("Conversation not found")
    _assert_participant(conv, request.user)

    if conv.status == 'stopped':
        return JsonResponse({"ok": False, "error": "THREAD_CLOSED"}, status=400)

    role = 'buyer' if request.user.id == conv.buyer_id else 'seller'
    house = conv.house
    total_shares = house.total_shares or 1
    force_public_change = (request.POST.get('force_public_change') or '').lower() in ('1', 'true', 'yes')

    def ensure_listing(price_decimal, shares, *, allow_public_change: bool):
        """
        Upewnij się, że istnieje aktywny listing sprzedającego na daną liczbę udziałów i cenę.
        - Jeśli już jest: ewentualnie aktualizuje price/currency/share_count.
        - Jeśli nie ma: tworzy nowy listing.
        - Jeśli istnieje inny aktywny listing i nie pozwolono na jego zmianę,
          zwraca (None, {...}) z kodem PUBLIC_LISTING_WILL_CHANGE.
        """
        seller_id = conv.seller_id
        if not seller_id:
            seller_user = _find_seller_for_house(house)
            if not seller_user:
                return None, "NO_SELLER_DETECTED"
            seller_id = seller_user.id

        # walidacja udziałów po stronie sprzedającego (dla domów udziałowych)
        if total_shares > 1:
            ho = HouseOwnership.objects.filter(house=house, user_id=seller_id).first()
            if not ho:
                return None, "NO_SELLER_SHARES"
            if shares > ho.shares:
                return None, "NOT_ENOUGH_SHARES"
        else:
            shares = 1

        lst = Listing.objects.filter(
            house=house.id,
            seller=seller_id,
            status='active'
        ).first()

        if lst:
            # mamy już publiczny listing – sprawdź, czy ta finalizacja zmieni pakiet/cenę
            will_change_shares = (total_shares > 1 and (lst.share_count or 1) != shares)
            will_change_price = (lst.price != price_decimal)

            if (will_change_shares or will_change_price) and not allow_public_change:
                # zwróć miękki błąd – front zapyta sprzedającego o potwierdzenie
                return None, {
                    "code": "PUBLIC_LISTING_WILL_CHANGE",
                    "current_price": str(lst.price),
                    "current_shares": int(lst.share_count or 1),
                    "requested_price": str(price_decimal),
                    "requested_shares": int(shares),
                }

            # aktualizujemy istniejący listing
            updated_fields = []
            if lst.price != price_decimal:
                lst.price = price_decimal
                updated_fields.append('price')
            if not lst.currency:
                lst.currency = 'PLN'
                updated_fields.append('currency')
            if total_shares > 1 and (lst.share_count or 1) != shares:
                lst.share_count = shares
                updated_fields.append('share_count')
            if updated_fields:
                lst.valid_from = timezone.now()
                updated_fields.append('valid_from')
                lst.save(update_fields=updated_fields)
            return lst, None

        # brak aktywnego listingu – tworzymy nowy
        kwargs = {
            "id": uuid.uuid4(),
            "house": house.id,
            "seller": seller_id,
            "price": price_decimal,
            "currency": 'PLN',
            "status": 'active',
            "valid_from": timezone.now(),
        }
        if total_shares > 1:
            kwargs["share_count"] = shares

        lst = Listing.objects.create(**kwargs)

        # status domu → for_sale
        if house.status != 'for_sale':
            house.status = 'for_sale'
            house.save(update_fields=['status'])

        return lst, None

    # -----------------------------
    # SPRZEDAJĄCY – „Sprzedaję”
    # -----------------------------
    if role == 'seller':
        # bierzemy ostatnią ofertę kupującego (niezależnie od accepted),
        # i jeśli jeszcze nie była zaakceptowana – akceptujemy teraz.
        ofr = conv.offers.filter(user_id=conv.buyer_id).order_by('-created_at').first()
        if not ofr:
            return JsonResponse({"ok": False, "error": "NO_BUYER_OFFER"}, status=400)

        if not ofr.accepted:
            ofr.accepted = True
            ofr.save(update_fields=['accepted'])
            conv.status = 'agreed'
            conv.save(update_fields=['status'])

        # liczba udziałów z oferty
        if total_shares > 1:
            if ofr.shares is None or ofr.shares <= 0:
                return JsonResponse({"ok": False, "error": "MISSING_SHARES"}, status=400)
            shares = int(ofr.shares)
        else:
            shares = 1

        lst, err = ensure_listing(ofr.price, shares, allow_public_change=force_public_change)
        if isinstance(err, dict) and err.get("code") == "PUBLIC_LISTING_WILL_CHANGE":
            payload = {
                "ok": False,
                "error": err["code"],
                "current_price": err["current_price"],
                "current_shares": err["current_shares"],
                "requested_price": err["requested_price"],
                "requested_shares": err["requested_shares"],
            }
            return JsonResponse(payload, status=200)
        if isinstance(err, str):
            return JsonResponse({"ok": False, "error": err}, status=400)
        if not lst:
            return JsonResponse({"ok": False, "error": "NO_SELLER_DETECTED"}, status=400)

        Message.objects.create(
            conversation=conv,
            sender=request.user,
            text=f"Sprzedający wystawił dom za {ofr.price} ({shares} shares).",
            message_type='agreement',
        )
        return JsonResponse({"ok": True, "listing_id": str(lst.id)})

    # -----------------------------
    # KUPUJĄCY – „Kupuję”
    # -----------------------------
    accepted = conv.offers.filter(accepted=True).order_by('-created_at').first()
    if accepted:
        src_ofr = accepted
    else:
        # brak uzgodnionej — weź ostatnią ofertę sprzedającego
        last_seller = conv.offers.filter(user_id=conv.seller_id).order_by('-created_at').first()
        if not last_seller:
            return JsonResponse({"ok": False, "error": "NO_SELLER_PRICE"}, status=400)
        last_seller.accepted = True
        last_seller.save(update_fields=['accepted'])
        conv.status = 'agreed'
        conv.save(update_fields=['status'])
        src_ofr = last_seller

    if total_shares > 1:
        if src_ofr.shares is None or src_ofr.shares <= 0:
            return JsonResponse({"ok": False, "error": "MISSING_SHARES"}, status=400)
        shares = int(src_ofr.shares)
    else:
        shares = 1

    lst, err = ensure_listing(src_ofr.price, shares, allow_public_change=True)
    if isinstance(err, dict):
        # przy kupującym nie wymuszamy potwierdzeń – jeśli jest konflikt, to błąd logiki po stronie sprzedającego
        return JsonResponse({"ok": False, "error": err.get("code", "LISTING_CONFLICT")}, status=400)
    if isinstance(err, str):
        return JsonResponse({"ok": False, "error": err}, status=400)
    if not lst:
        return JsonResponse({"ok": False, "error": "NO_SELLER_DETECTED"}, status=400)

    Message.objects.create(
        conversation=conv,
        sender=request.user,
        text=f"Kupujący potwierdził zakup za {src_ofr.price} ({shares} shares).",
        message_type='agreement',
    )
    return JsonResponse({"ok": True, "listing_id": str(lst.id)})


# --------------
# STOP (usuń wątek całkowicie)
# --------------

@login_required
@require_POST
def messages_stop(request, conv_id):
    """
    Archiwizuje wątek (status='stopped') zamiast go kasować.
    Wątek znika z listy bieżących rozmów, ale można go podejrzeć w archiwum.
    """
    try:
        conv = Conversation.objects.get(pk=conv_id)
    except Conversation.DoesNotExist:
        return JsonResponse({"ok": True})

    _assert_participant(conv, request.user)

    if conv.status != 'stopped':
        conv.status = 'stopped'
        conv.save(update_fields=['status'])
        Message.objects.create(
            conversation=conv,
            sender=request.user,
            text="(Rozmowa zarchiwizowana)",
            message_type='system',
        )

    return JsonResponse({"ok": True})




@login_required
@require_POST
def house_takeover(request, id_fme: str):
    """
    Przejmuje dom na rzecz aktualnie zalogowanego użytkownika – kasuje wszystkich współwłaścicieli
    i daje 100% udziałów current userowi.
    """
    try:
        house = House.objects.get(id_fme=id_fme)
    except House.DoesNotExist:
        raise Http404("House not found")

    total_shares = house.total_shares or 1

    # usuń dotychczasowych właścicieli
    HouseOwnership.objects.filter(house=house).delete()

    # przypisz wszystko aktualnemu userowi
    HouseOwnership.objects.create(
        house=house,
        user=request.user,
        shares=total_shares,
    )

    house.status = 'sold'
    house.save(update_fields=['status'])

    return JsonResponse({
        "ok": True,
        "house_id": str(house.id),
        "new_owner": request.user.id,
    })

