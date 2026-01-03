# logic/views_my_homes.py

from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_GET
from django.http import JsonResponse, Http404
from logic.models import Listing, Conversation, Offer
from logic.models import House, HouseOwnership, ShareSplitProposal, ShareSplitVote



def _num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


@login_required
@require_GET
def houses_owned(request):
    """
    Lista domów należących do zalogowanego użytkownika.
    Zwraca: id, id_fme, name, address, h3_id, lat, lon, height.
    """
    user_id = request.user.id
    qs = (
        House.objects
        .filter(ownerships__user_id=user_id)
        .order_by('created_at')
        .distinct()
    )

    out = []
    for h in qs:
        a = h.attrs or {}

        # Adres (jak było)
        addr = None
        try:
            street = a.get('FME_addr_street') or a.get('addr:street') or a.get('FME_street') or ''
            hno    = a.get('FME_addr_housenumber') or a.get('addr:housenumber') or a.get('FME_housenumber') or ''
            city   = a.get('FME_addr_city') or a.get('addr:city') or a.get('city') or ''
            parts1 = ' '.join([p for p in [str(street).strip(), str(hno).strip()] if p]).strip()
            addr   = ', '.join([p for p in [parts1, str(city).strip()] if p]) or None
        except Exception:
            addr = None

        # POZYCJA: najpierw kolumny lat/lon z tabeli, na razie bez kombinacji z H3
        lat = _num(getattr(h, "lat", None))
        lon = _num(getattr(h, "lon", None))

 

        # Wysokość kamery: ~nad dachem (gdy znamy wysokość budynku)
        hh = (_num(getattr(h, 'fme_height', None)) or _num(a.get('FME_height')) or _num(a.get('height')))
        cam_height = (hh * 3 + 150) if hh else 200.0

        # --- LISTING (aktywny? – TYLKO mój) ---
        lst = (
            Listing.objects
            .filter(house=h.id, seller=request.user.id, status='active')
            .order_by('-valid_from')
            .first()
        )
        listed = bool(lst)
        list_price = float(lst.price) if (lst and lst.price is not None) else None
        list_curr  = (lst.currency or 'PLN') if lst else None

        # --- CHAT / WĄTEK (z kimś o tym domu?) ---
        conv = Conversation.objects.filter(house=h, seller=request.user).order_by('-created_at').first()
        has_chat   = bool(conv)
        conv_id    = str(conv.id) if conv else None


        # --- OFERTY (ostatnia kupującego → “Buyer’s offer”, ostatnia Twoja → “Your offer”) ---
        buyer_offer  = None
        your_offer   = None
        if conv:
            last_buyer  = Offer.objects.filter(
                conversation=conv,
                user_id=conv.buyer_id,
                accepted=False
            ).order_by('-created_at').first()
            last_seller = Offer.objects.filter(
                conversation=conv,
                user_id=conv.seller_id
            ).order_by('-created_at').first()
            if last_buyer and last_buyer.price is not None:
                buyer_offer = float(last_buyer.price)
            if last_seller and last_seller.price is not None:
                your_offer = float(last_seller.price)

        # --- ZBIORCZE DANE O OFERTACH (ze wszystkich rozmów o tym domu) ---
        offers_count = 0
        highest_offer = None

        agg_qs = Offer.objects.filter(
            conversation__house=h,
            conversation__seller=request.user,
            accepted=False,              # tylko oferty jeszcze "otwarte"
            price__isnull=False,
        ).exclude(user_id=request.user.id)  # tylko kupujący, nie Ty jako sprzedawca

        offers_count = agg_qs.count()
        top = agg_qs.order_by('-price').first()
        if top and top.price is not None:
            highest_offer = float(top.price)

        # --- MOJE UDZIAŁY W TYM DOMU ---
        total_shares = int(getattr(h, "total_shares", 1) or 1)

        my_ho = HouseOwnership.objects.filter(house=h, user=request.user).first()
        my_shares = int(getattr(my_ho, "shares", 0) or 0)

        can_split_direct = (my_shares * 2 > total_shares)

        # efektywny limit: jeśli brak w bazie, traktujemy jak total_shares
        raw_limit = getattr(h, "max_avail_total_shares", None)
        if raw_limit is None:
            max_limit = total_shares
        else:
            max_limit = int(raw_limit)


        proposal = (
            ShareSplitProposal.objects
            .filter(house=h, status="open")
            .order_by("-created_at")
            .first()
        )

        split_proposal = None
        if proposal:
            ownerships_all = HouseOwnership.objects.filter(house=h)
            shares_map = {ho.user_id: ho.shares for ho in ownerships_all}

            yes_votes = proposal.votes.filter(vote=True)
            no_votes  = proposal.votes.filter(vote=False)

            yes_shares = sum(shares_map.get(v.user_id, 0) for v in yes_votes)
            no_shares  = sum(shares_map.get(v.user_id, 0) for v in no_votes)

            yes_percent = (yes_shares / total_shares * 100.0) if total_shares else 0.0
            no_percent  = (no_shares / total_shares * 100.0) if total_shares else 0.0

            my_vote_obj = proposal.votes.filter(user=request.user).first()
            if my_vote_obj is None:
                my_vote = None
            else:
                my_vote = "yes" if my_vote_obj.vote else "no"

            split_proposal = {
                "id": str(proposal.id),
                "status": proposal.status,
                "requested_total_shares": proposal.requested_total_shares,
                "yes_percent": round(yes_percent, 2),
                "no_percent": round(no_percent, 2),
                "my_vote": my_vote,
                "initiator_id": proposal.initiator_id,
            }



        out.append({
            "id": str(h.id),
            "id_fme": h.id_fme,
            "name": h.name,
            "address": addr,
            "h3_id": h.h3_id,
            "lat": lat,
            "lon": lon,
            "height": cam_height,

            # udziałowość
            "total_shares": total_shares,
            "my_shares": my_shares,
            "can_split_direct": can_split_direct,
            "max_avail_total_shares": max_limit,

            # listing (aktywny?)
            "listed": listed,
            "listing_price": list_price,
            "listing_currency": list_curr,
            "listing_shares": (
                int(lst.share_count)
                if lst and getattr(lst, "share_count", None) is not None
                else None
            ),

            # chat / negocjacje
            "has_chat": has_chat,
            "conv_id": conv_id,
            "buyer_offer": buyer_offer,
            "your_offer": your_offer,

            # agregaty ofert
            "offers_count": offers_count,
            "highest_offer": highest_offer,
            "split_proposal": split_proposal,
        })


    return JsonResponse(out, safe=False)
