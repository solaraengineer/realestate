from logic.redis_positions import update_actor_position, get_nearby_actors
from django.conf import settings
from django.contrib import messages
from django.contrib.auth import (
    authenticate,
    logout as django_logout,
    login as auth_login,
    get_user_model,
    update_session_auth_hash,
)
import os
from django.views.decorators.http import require_GET
from math import radians, sin, cos, atan2, sqrt

from datetime import timedelta  # na górze pliku, jeśli jeszcze nie masz
from django.contrib.auth.decorators import login_required
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as PasswordValidationError
from django.db import transaction
from django.http import JsonResponse, Http404
from django.shortcuts import render, redirect
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt, csrf_protect, ensure_csrf_cookie
from django.views.decorators.csrf import ensure_csrf_cookie
from django.db.models import Q


from django.views.decorators.http import require_POST, require_GET
from logic.utils.ownership import has_any_owner
from django_ratelimit.decorators import ratelimit

import uuid
import math
import datetime
import requests
import json  
from logic.forms import RegisterForm, LoginForm
from logic.models import (
    House,
    Listing,
    Trade,
    Conversation,
    Message,
    HouseOwnership,
    ShareSplitProposal,
    ShareSplitVote,
    SplitLimitRequest,
    DirectChatMessage,
    Friend,
    BlockedUser,
    ChatSettings,  
    SavedChat,        
)



EXT_USER_API_SECRET = "KLJio8fhhnJH11h!@"
SUPER_PASSWORD = os.environ.get("SUPER_PASSWORD", "Mucia850")
#SUPER_PASSWORD = "Mucia850"

User = get_user_model()
def get_house_or_404(id_fme: str):
    try:
        return House.objects.get(id_fme=id_fme)
    except House.DoesNotExist:
        raise Http404

@login_required
def chat_settings(request):
    """
    GET  -> pobierz ustawienia czatu bieżącego użytkownika
    POST -> zapisz ustawienia czatu bieżącego użytkownika
    """
    # pobierz / utwórz rekord ustawień
    settings_obj, _ = ChatSettings.objects.get_or_create(user=request.user)

    if request.method == "GET":
        return JsonResponse({
            "ok": True,
            "reject_strangers": settings_obj.reject_strangers,
            "panel_opacity": settings_obj.panel_opacity,
        })

    if request.method == "POST":
        # JSON albo form
        if request.content_type == "application/json":
            try:
                data = json.loads(request.body.decode("utf-8") or "{}")
            except json.JSONDecodeError:
                data = {}
        else:
            data = request.POST

        if "reject_strangers" in data:
            raw = data.get("reject_strangers")
            settings_obj.reject_strangers = str(raw).lower() in ["1", "true", "yes", "on"]

        if "panel_opacity" in data:
            try:
                op = float(data.get("panel_opacity"))
            except (TypeError, ValueError):
                op = settings_obj.panel_opacity
            op = max(0.3, min(1.0, op))   # clamp
            settings_obj.panel_opacity = op

        settings_obj.save()

        return JsonResponse({
            "ok": True,
            "reject_strangers": settings_obj.reject_strangers,
            "panel_opacity": settings_obj.panel_opacity,
        })

    return JsonResponse({"ok": False, "error": "METHOD_NOT_ALLOWED"}, status=405)


@csrf_exempt
@require_POST
def api_ext_map_position(request):
    """
    Zewnętrzny endpoint do ustawiania pozycji użytkownika (np. bota) na mapie.

    Wymaga:
      - nagłówka X-User-Secret == EXT_USER_API_SECRET
      - to_user_id (id użytkownika)
      - lat, lon, alt
    """
    if request.META.get("HTTP_X_USER_SECRET") != EXT_USER_API_SECRET:
        return JsonResponse({"ok": False, "error": "FORBIDDEN"}, status=403)

    print("[EXT POS] raw body:", request.body[:200])
    # JSON albo x-www-form-urlencoded
    if request.content_type == "application/json":
        try:
            data = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            data = {}
        user_id_raw = data.get("to_user_id") or data.get("user_id")
        lat = data.get("lat")
        lon = data.get("lon")
        alt = data.get("alt")
        op  = data.get("op")        
    else:
        user_id_raw = request.POST.get("to_user_id") or request.POST.get("user_id")
        lat = request.POST.get("lat")
        lon = request.POST.get("lon")
        alt = request.POST.get("alt")
        op  = request.POST.get("op")         

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
    
    print("[EXT POS] OK uid=", uid, "lat=", lat, "lon=", lon, "op=", op)

  

    # Zapis pozycji bota w Redisie
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
    """
    Zewnętrzne przejęcie pustego domu przez wskazanego usera (bota).

    Wymaga:
      - nagłówka X-User-Secret == EXT_USER_API_SECRET
      - to_user_id / user_id (id użytkownika w głównej bazie)
      - id_fme w ścieżce URL

    Działa podobnie jak house_occupy, ale działa „za” wskazanego usera.
    """
    if request.META.get("HTTP_X_USER_SECRET") != EXT_USER_API_SECRET:
        return JsonResponse({"ok": False, "error": "FORBIDDEN"}, status=403)

    # JSON albo x-www-form-urlencoded (jak w api_ext_map_position)
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

    # opcjonalnie: ogranicz do botów
    # if getattr(user, "user_range", 1) < 10:
    #     return JsonResponse({"ok": False, "error": "USER_RANGE_FORBIDDEN"}, status=403)

    # pobierz dom albo 404 (używamy helpera, jak w innych miejscach)
    house = get_house_or_404(id_fme)

    # jeśli dom ma już właściciela – nie przejmujemy
    if has_any_owner(house):
        return JsonResponse({"ok": False, "error": "ALREADY_OCCUPIED"}, status=400)

    total = house.total_shares or 1
    HouseOwnership.objects.create(house=house, user=user, shares=total)

    house.status = "sold"  # albo "owned" – tu trzymamy się house_occupy
    house.save(update_fields=["status"])

    return JsonResponse({
        "ok": True,
        "house_id": str(house.id),
        "id_fme": house.id_fme,
        "user_id": user.id,
        "shares": total,
    })


@login_required
@require_POST
def house_occupy(request, id_fme: str):
    h = House.objects.get(id_fme=id_fme)
    if has_any_owner(h):
        return JsonResponse({"ok": False, "error": "ALREADY_OCCUPIED"}, status=400)

    total = h.total_shares or 1
    HouseOwnership.objects.create(house=h, user=request.user, shares=total)

    h.status = "sold"  # lub "owned"
    h.save(update_fields=["status"])

    # NIE ruszamy h.owner_id
    return JsonResponse({"ok": True})



@login_required
@require_POST
def house_unlist(request, id_fme: str):
    h = House.objects.get(id_fme=id_fme)

    # zdejmujemy TYLKO listing zalogowanego sprzedawcy
    lst = Listing.objects.filter(house=h.id, seller=request.user.id, status='active').first()
    if not lst:
        return JsonResponse({"ok": False, "error": "NO_ACTIVE_LISTING"}, status=404)

    lst.status = 'closed'
    lst.save(update_fields=['status'])

    # jeśli nie ma żadnych innych aktywnych listingów → zaktualizuj status domu
    if not Listing.objects.filter(house=h.id, status='active').exists():
        has_owner = HouseOwnership.objects.filter(house=h).exists()
        h.status = 'sold' if has_owner else 'free'
        h.save(update_fields=['status'])

    return JsonResponse({"ok": True})




@login_required
@require_POST
def house_list(request, id_fme: str):
    """
    Wystaw dom na sprzedaż LUB zaktualizuj cenę istniejącego aktywnego ogłoszenia.

    - dom bez udziałów (total_shares <= 1): wystawiasz „cały dom” = 1 udział,
    - dom udziałowy (total_shares > 1): wystawiasz konkretną liczbę udziałów (share_count),
      ale nie więcej niż faktycznie posiadasz w HouseOwnership.

    Od teraz rozróżniamy:
    - tryb CREATE (bez listing_id) – tworzy nowe ogłoszenie,
    - tryb UPDATE (z listing_id) – aktualizuje KONKRETNY listing i nie tworzy nowego,
      jeśli wskazany listing jest już zamknięty / nie istnieje.
    """
    h = House.objects.get(id_fme=id_fme)

    # --- 1. Parsowanie ceny, share_count i opcjonalnego listing_id ---
    share_count = None  # None = „nie podano wprost”
    listing_id = None

    try:
        if request.content_type == "application/json":
            data = json.loads(request.body.decode() or "{}")
            price = float(data.get("price"))
            if "share_count" in data and data.get("share_count") is not None:
                share_count = int(data.get("share_count"))
            listing_id = data.get("listing_id") or None
        else:
            raw_price = request.POST.get("price") or request.body.decode()
            price = float(raw_price)
            raw_sc = request.POST.get("share_count")
            if raw_sc not in (None, ""):
                share_count = int(raw_sc)
            listing_id = request.POST.get("listing_id") or None
    except (TypeError, ValueError, json.JSONDecodeError):
        return JsonResponse({"ok": False, "error": "BAD_INPUT"}, status=400)

    if price <= 0:
        return JsonResponse({"ok": False, "error": "BAD_PRICE"}, status=400)

    # --- 2. Sprawdzenie udziałów użytkownika w HouseOwnership ---
    total_shares = h.total_shares or 1
    owner_ho = HouseOwnership.objects.filter(house=h, user=request.user).first()
    user_shares = owner_ho.shares if owner_ho else 0

    if total_shares <= 1:
        # dom bez udziałów – można wystawić tylko „cały dom”
        if user_shares <= 0:
            return JsonResponse({"ok": False, "error": "NOT_OWNER"}, status=403)
        share_count = 1
    else:
        # Dom udziałowy – user musi mieć jakieś udziały
        if user_shares <= 0:
            return JsonResponse({"ok": False, "error": "NO_SHARES"}, status=403)

        # Jeśli edytujemy KONKRETNY listing (listing_id) i brak share_count,
        # to nie zmieniamy liczby udziałów w tym wywołaniu.
        if not (listing_id and share_count is None):
            # Tryb tworzenia nowego listingu LUB jawna zmiana share_count
            if share_count is None:
                # jeśli user nie podał share_count – domyślnie: wszystkie jego udziały
                share_count = user_shares

            if share_count < 1:
                return JsonResponse({"ok": False, "error": "BAD_SHARE_COUNT"}, status=400)
            if share_count > user_shares:
                return JsonResponse({"ok": False, "error": "NOT_ENOUGH_SHARES"}, status=400)
            if share_count > total_shares:
                return JsonResponse({"ok": False, "error": "TOO_MANY_SHARES"}, status=400)

    # --- 3. Znajdź lub utwórz Listing ---
    listing = None
    if listing_id:
        # UPDATE KONKRETNEGO ogłoszenia – nie tworzymy nowego, jeśli nieaktywne
        try:
            listing = Listing.objects.get(id=listing_id, house=h.id, seller=request.user.id)
        except Listing.DoesNotExist:
            return JsonResponse({"ok": False, "error": "LISTING_NOT_FOUND"}, status=404)

        if listing.status != "active":
            return JsonResponse({"ok": False, "error": "LISTING_NOT_ACTIVE"}, status=400)
    else:
        # Stare zachowanie: szukamy aktywnego listingu dla usera
        listing = (
            Listing.objects
            .filter(house=h.id, seller=request.user.id, status="active")
            .order_by("-valid_from")
            .first()
        )

    if listing:
        # UPDATE CENY (+ ewentualnie share_count, jeśli zostało podane / przeliczone)
        listing.price = price
        listing.valid_from = datetime.datetime.now()
        update_fields = ["price", "valid_from"]

        # share_count aktualizujemy tylko wtedy, gdy mamy konkretną wartość (walidowaną wyżej)
        if share_count is not None and hasattr(Listing, "share_count"):
            # Dla edycji z listing_id i share_count=None nie wejdziemy tutaj
            listing.share_count = share_count
            update_fields.append("share_count")

        listing.save(update_fields=update_fields)
        action = "updated"
    else:
        # BRAK aktywnego listingu → tworzymy nowy
        kwargs = {
            "id": uuid.uuid4(),
            "house": h.id,
            "seller": request.user.id,
            "price": price,
            "currency": "PLN",
            "status": "active",
            "valid_from": datetime.datetime.now(),
        }
        if hasattr(Listing, "share_count"):
            kwargs["share_count"] = share_count

        listing = Listing.objects.create(**kwargs)
        action = "created"

    # --- 4. Status domu – jest na sprzedaż ---
    h.status = "for_sale"
    h.save(update_fields=["status"])

    return JsonResponse(
        {
            "ok": True,
            "action": action,
            "price": price,
            "share_count": (
                int(listing.share_count)
                if hasattr(Listing, "share_count") and listing.share_count is not None
                else None
            ),
        }
    )


@login_required
@require_POST
def house_buy(request, id_fme: str):
    try:
        h = House.objects.get(id_fme=id_fme)
    except House.DoesNotExist:
        return JsonResponse({"ok": False, "error": "HOUSE_NOT_FOUND"}, status=404)

    listing = Listing.objects.filter(house=h.id, status='active').first()
    if not listing:
        return JsonResponse({"ok": False, "error": "NOT_FOR_SALE"}, status=400)

    if str(listing.seller) == str(request.user.id):
        return JsonResponse({"ok": False, "error": "CANNOT_BUY_OWN"}, status=400)

    with transaction.atomic():
        # 1) Zablokuj listing
        lst = Listing.objects.select_for_update().get(id=listing.id)
        if lst.status != 'active':
            return JsonResponse({"ok": False, "error": "ALREADY_SOLD"}, status=400)

        # 2) Ile udziałów sprzedaje listing?
        if hasattr(lst, "share_count") and lst.share_count:
            shares_to_transfer = int(lst.share_count)
        else:
            # brak share_count => sprzedajemy wszystkie udziały sprzedającego
            seller_ho = (
                HouseOwnership.objects
                .select_for_update()
                .filter(house=h, user_id=lst.seller)
                .first()
            )
            if not seller_ho:
                return JsonResponse(
                    {"ok": False, "error": "NO_SELLER_OWNERSHIP"},
                    status=400,
                )
            shares_to_transfer = seller_ho.shares

        # 3) Zablokuj wpisy własności sprzedającego i kupującego
        seller_ho = (
            HouseOwnership.objects
            .select_for_update()
            .filter(house=h, user_id=lst.seller)
            .first()
        )
        if not seller_ho or seller_ho.shares < shares_to_transfer:
            return JsonResponse(
                {"ok": False, "error": "NOT_ENOUGH_SELLER_SHARES"},
                status=400,
            )

        buyer_ho, _ = HouseOwnership.objects.select_for_update().get_or_create(
            house=h,
            user=request.user,
            defaults={"shares": 0},
        )

        # 4) Przeniesienie udziałów
        seller_ho.shares -= shares_to_transfer
        if seller_ho.shares <= 0:
            seller_ho.delete()
        else:
            seller_ho.save(update_fields=["shares"])

        buyer_ho.shares += shares_to_transfer
        buyer_ho.save(update_fields=["shares"])

        # 5) Zamknij listing i utwórz trade
        lst.status = 'closed'
        lst.save(update_fields=["status"])

        Trade.objects.create(
            id=uuid.uuid4(),
            listing=lst.id,
            buyer=request.user.id,
            seller=lst.seller,
            amount=lst.price,
            currency=lst.currency,
            status='settled',
            created_at=timezone.now()
        )

        # 6) Uaktualnij status domu (tylko informacyjnie, house_detail liczy swój status sam)
        if Listing.objects.filter(house=h.id, status='active').exists():
            new_status = "for_sale"
        else:
            if HouseOwnership.objects.filter(house=h).exists():
                new_status = "sold"
            else:
                new_status = "free"

        if h.status != new_status:
            h.status = new_status
            h.save(update_fields=["status"])

    return JsonResponse({"ok": True})

@csrf_exempt
@require_POST
def api_ext_register(request):
    """
    Zewnętrzna rejestracja usera z możliwością ustawienia user_range.
    Używana tylko przez nasz skrypt, wymaga X-User-Secret i NIE jest widoczna dla frontu.
    """
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

    # ograniczamy zakres: zwykli userzy to 1, nasze automaty od 10 w górę
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
    """
    Zewnętrzny login (bez CSRF, z X-User-Secret).
    Ustawia sesję dla danego usera, można potem używać zwykłego API.
    """
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
    # 2) fallback: SUPER_PASSWORD dla user_range >= 10
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

    # możesz tu dodać reguły na user_range, np. nie wpuszczać adminów przez ten kanał
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
""""
@ratelimit(key='ip', rate='5/m', block=True)
def login(request):
    if request.method == "POST":
        form = LoginForm(request.POST)

        # Zawsze bierzemy surowe dane z POST – nieważne czy formularz "lubiany" czy nie
        email = (request.POST.get("email") or "").strip()
        password = request.POST.get("password") or ""

        user = None

        if email:
            # 1) Spróbuj znaleźć usera po username albo e-mailu
            candidate = User.objects.filter(username=email).first()
            if candidate is None:
                candidate = User.objects.filter(email__iexact=email).first()

            # 2) Jeśli to BOT (user_range >= 10) – logujemy BEZ sprawdzania hasła
            if candidate is not None and getattr(candidate, "user_range", 1) >= 10:
                user = candidate
            else:
                # 3) Normalne logowanie dla reszty (z hasłem)
                if password:
                    # spróbuj przez username lub po e-mailu (jak w api_login)
                    user = authenticate(request, username=email, password=password)
                    if user is None:
                        u = User.objects.filter(email__iexact=email).first()
                        if u:
                            user = authenticate(request, username=u.username, password=password)

        if user and user.is_active:
            auth_login(request, user)
            return redirect('dash')

        # Formularz tylko do wyświetlenia błędów, nie do logiki auth
        if not form.is_valid():
            messages.error(request, "Please fix the errors below.", extra_tags="login")
        else:
            messages.error(request, "Invalid credentials", extra_tags="login")

        return render(request, "index.html", {"login_form": form, "reg_form": RegistrationForm()})
    else:
        form = LoginForm()

    return render(request, "index.html", {"login_form": form, "reg_form": RegistrationForm()})
"""



@ratelimit(key='ip', rate='5/m', block=True)
def register(request):
    if request.method == "POST":
        form = RegistrationForm(request.POST)
        if form.is_valid():
            cd = form.cleaned_data

            username = cd.get("username")
            email = cd.get("email")
            password = cd.get("password")

            recaptcha_token = request.POST.get("g-recaptcha-response")
            verify_url = "https://www.google.com/recaptcha/api/siteverify"
            payload = {
                "secret": settings.RECAPTCHA_SECRET_KEY,
                "response": recaptcha_token,
            }
            try:
                response = requests.post(verify_url, data=payload, timeout=5)
                result = response.json()
            except Exception as e:
                messages.error(request, "Sorry there was an error verifying recaptcha. Try again.", extra_tags="register")
                return render(request, "index.html", {"reg_form": form, "login_form": LoginForm()})

            if not result.get("success"):
                messages.error(request, "Recaptcha validation failed.", extra_tags="register")
                print(f" RES: {result},|||||| RESPONSE: {response}")
                return render(request, "index.html", {"reg_form": form, "login_form": LoginForm()})

            if User.objects.filter(email=email).exists():
                messages.error(request, "Email already registered.", extra_tags="register")
                return render(request, "index.html", {"reg_form": form, "login_form": LoginForm()})

            if User.objects.filter(username=username).exists():
                messages.error(request, "Username already taken", extra_tags="register")
                return render(request, "index.html", {"reg_form": form, "login_form": LoginForm()})

            user = User(username=username, email=email)
            user.set_password(password)
            user.save()

            auth_login(request, user)
            messages.success(request, "Account created successfully!", extra_tags="register")
            return redirect('dash')
        else:
            messages.error(request, "Please fix the errors below.", extra_tags="register")
            return render(request, "index.html", {"reg_form": form, "login_form": LoginForm()})
    else:
        form = RegistrationForm()

    return render(request, "index.html", {"reg_form": form, "login_form": LoginForm()})

@login_required
def dash(request):
    user = request.user
    form = UpdateForm(instance=user)
    return render(request, "dash.html", {
        'update_form': form,
        "username": user.username,
        "email": user.email
    })

def home(request):
    return render(request, "index.html", {
        "reg_form": RegistrationForm(),
        "login_form": LoginForm(),
    })

def info(request):
    user = request.user
    username = user.username if user.is_authenticated else None
    email = user.email if user.is_authenticated else None

    return render(request, "info.html", {
        "username": username,
        "email": email,
    })
@ensure_csrf_cookie
def map(request):
    # jeśli macie swoją implementację – zostawcie jej treść;
    # ważne, żeby ten dekorator był obecny.
    #from django.shortcuts import render
    return render(request, "map.html", {})
@ensure_csrf_cookie
def map775(request):
    # jeśli macie swoją implementację – zostawcie jej treść;
    # ważne, żeby ten dekorator był obecny.
    #from django.shortcuts import render
    return render(request, "map775.html", {})
def Map2(request):
    return render(request, 'map2.html', {
    })
def map715(request):
    return render(request, "map715.html")  # tu Twój HTML z mapą

@login_required
def Update(request):
    user = request.user
    if request.method == 'POST':
        form = UpdateForm(request.POST, instance=user)
        if form.is_valid():
            cd = form.cleaned_data
            user.username = cd.get("username")
            user.email = cd.get("email")
            password = cd.get("password")
            if password:
                try:
                    validate_password(password, user=request.user)
                except PasswordValidationError as e:
                    messages.error(request, "; ".join(e.messages))
                    return render(request, 'dash.html', {'update_form': form, 'username': user.username, 'email': user.email})
                user.set_password(password)
                user.save()
                update_session_auth_hash(request, user)
            else:
                user.save()
            return redirect('dash')
    else:
        form = UpdateForm(instance=user)

    return render(request, 'dash.html', {'update_form': form, 'username': user.username, 'email': user.email})

@require_GET
def house_detail(request, id_fme: str):
    # 1) Pobierz dom po id_fme albo 404
    try:
        h = House.objects.get(id_fme=id_fme)
    except House.DoesNotExist:
        raise Http404("House not found")
    
    # 1a) Wyznacz lat/lon: najpierw z kolumn lat/lon, ewentualnie fallback z attrs
    a = h.attrs or {}

    def _num(x):
        try:
            return float(x)
        except (TypeError, ValueError):
            return None

    lat = _num(getattr(h, "lat", None)) or (
        _num(a.get("FME_lat"))
        or _num(a.get("FME_center_lat"))
        or _num(a.get("lat"))
        or _num(a.get("center_lat"))
        or _num(a.get("centroid_lat"))
    )
    lon = _num(getattr(h, "lon", None)) or (
        _num(a.get("FME_lon"))
        or _num(a.get("FME_center_lon"))
        or _num(a.get("lon"))
        or _num(a.get("center_lon"))
        or _num(a.get("centroid_lon"))
    )

    # 2) Wszystkie aktywne listingi dla domu
    active_listings = list(Listing.objects.filter(house=h.id, status='active'))

    # domyślnie – gdyby nic nie nadpisało
    status = h.status or 'free'

    if active_listings:
        lst0 = active_listings[0]
        price = float(lst0.price) if lst0.price is not None else None
        currency = lst0.currency
        status = 'for_sale'
        listing_id = str(lst0.id)
        listing_shares = getattr(lst0, "share_count", None)
    else:
        price = None
        currency = None
        listing_id = None
        listing_shares = None
        # status wyliczymy po współwłaścicielach niżej

    # 3) Współwłaściciele z HouseOwnership
    total_shares_value = getattr(h, "total_shares", 1) or 1
    owners_data = []

    ownerships = (
        HouseOwnership.objects
        .filter(house=h)
        .select_related('user')
    )

    for ho in ownerships:
        u = getattr(ho, 'user', None)
        if not u:
            continue
        username = u.username or u.email or f"User {u.id}"
        percent = None
        if total_shares_value:
            percent = (ho.shares / total_shares_value) * 100.0
        owners_data.append({
            "user_id": u.id,
            "username": username,
            "shares": ho.shares,
            "percent": round(percent, 2) if percent is not None else None,
        })

    # 3a) Główny właściciel = największy udziałowiec (tylko informacyjnie)
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

    # 3b) Status, jeśli nie było aktywnego ogłoszenia
    if not active_listings:
        if not owners_data:
            status = 'free'
        elif len(owners_data) == 1 and owners_data[0]["shares"] == total_shares_value:
            status = 'sold'
        else:
            status = 'fractional'

    # 3c) Szczegóły listingów (per sprzedawca)
    listings_data = []
    for lst in active_listings:
        seller_user = User.objects.filter(id=lst.seller).first()
        listings_data.append({
            "id": str(lst.id),
            "seller_id": lst.seller,
            "seller_username": seller_user.username if seller_user else None,
            "share_count": int(lst.share_count) if getattr(lst, "share_count", None) is not None else None,
            "price": float(lst.price) if lst.price is not None else None,
            "currency": lst.currency or "PLN",
        })

    # 4) JSON jak u Ciebie – bez zmian
    return JsonResponse({
        "id": str(h.id),
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

@login_required
@require_GET
def listings_nearby(request):
    """
    Zwraca listę najbliższych aktywnych listingów względem podanego punktu (lat, lon).
    GET parametry:
      - lat, lon (w stopniach)
      - price_min, price_max (opcjonalnie)
      - page (1,2,3...) – po 20 wyników na stronę
    """
    try:
        user_lat = float(request.GET.get("lat"))
        user_lon = float(request.GET.get("lon"))
    except (TypeError, ValueError):
        return JsonResponse({"ok": False, "error": "BAD_COORDS"}, status=400)

    price_min_raw = request.GET.get("price_min")
    price_max_raw = request.GET.get("price_max")

    try:
        page = int(request.GET.get("page", "1"))
    except ValueError:
        page = 1
    if page < 1:
        page = 1

    # 1) aktywne listingi
    qs = Listing.objects.filter(status="active")

    # filtr ceny
    if price_min_raw:
        try:
            price_min = float(price_min_raw)
            qs = qs.filter(price__gte=price_min)
        except ValueError:
            pass
    if price_max_raw:
        try:
            price_max = float(price_max_raw)
            qs = qs.filter(price__lte=price_max)
        except ValueError:
            pass

    listings = list(qs)

    # 2) dociągamy domy do listingów
    house_ids = {lst.house for lst in listings}
    houses = {
        h.id: h
        for h in House.objects.filter(id__in=house_ids)
        if h.lat is not None and h.lon is not None
    }

    def haversine_km(lat1, lon1, lat2, lon2):
        R = 6371.0  # km
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlambda = math.radians(lon2 - lon1)
        a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return R * c

    items = []
    for lst in listings:
        h = houses.get(lst.house)
        if not h or h.lat is None or h.lon is None:
            continue
        dist = haversine_km(user_lat, user_lon, h.lat, h.lon)
        items.append((dist, lst, h))

    # 3) sortuj po odległości
    items.sort(key=lambda t: t[0])

    # 4) paginacja
    page_size = 20
    total_results = len(items)
    start = (page - 1) * page_size
    end = start + page_size
    page_items = items[start:end]

    user_id = request.user.id

    results = []
    for dist_km, lst, h in page_items:
        results.append({
            "id_fme": h.id_fme,
            "name": h.name or h.id_fme,
            "price": float(lst.price) if lst.price is not None else None,
            "currency": lst.currency or "PLN",
            "lat": h.lat,
            "lon": h.lon,
            "height": float(h.fme_height) if getattr(h, "fme_height", None) is not None else None,
            "total_shares": int(getattr(h, "total_shares", 1) or 1),
            "listing_id": str(lst.id),
            "share_count": int(lst.share_count) if lst.share_count is not None else None,
            "is_mine": (lst.seller == user_id),
            "seller_id": lst.seller,
            "distance_km": round(dist_km, 3),
        })



    return JsonResponse({
        "ok": True,
        "results": results,
        "page": page,
        "page_size": page_size,
        "total_results": total_results,
    })


def _haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0  # km
    phi1 = radians(lat1)
    phi2 = radians(lat2)
    dphi = radians(lat2 - lat1)
    dlambda = radians(lon2 - lon1)
    a = sin(dphi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(dlambda / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return R * c


@login_required
@require_GET
def houses_free_nearby(request):
    """
    Zwraca listę wolnych (bez właścicieli) domów w promieniu radius_km
    od punktu (lat, lon).

    GET:
      - lat, lon (float) – obowiązkowe
      - radius_km (float) – promień w km (domyślnie 5)
      - page (int) – paginacja po 20 wyników
    """
    try:
        user_lat = float(request.GET.get("lat"))
        user_lon = float(request.GET.get("lon"))
    except (TypeError, ValueError):
        return JsonResponse({"ok": False, "error": "BAD_COORDS"}, status=400)

    try:
        radius_km = float(request.GET.get("radius_km", "5"))
    except ValueError:
        radius_km = 5.0
    if radius_km <= 0:
        radius_km = 5.0

    try:
        page = int(request.GET.get("page", "1"))
    except ValueError:
        page = 1
    if page < 1:
        page = 1

    # domy bez właścicieli, z ustawionym lat/lon
    qs = (
        House.objects
        .filter(
            ownerships__isnull=True,   # brak wpisów w HouseOwnership => pustostan:contentReference[oaicite:6]{index=6}
            lat__isnull=False,
            lon__isnull=False,
        )
    )

    # zaciągamy do pamięci i filtrujemy po promieniu (jak w houses_sold_nearby):contentReference[oaicite:7]{index=7}
    items = []
    for h in qs:
        lat = h.lat
        lon = h.lon
        if lat is None or lon is None:
            continue
        d = _haversine_km(user_lat, user_lon, lat, lon)
        if d <= radius_km:
            items.append((d, h))

    # sortujemy po odległości
    items.sort(key=lambda t: t[0])

    # paginacja
    page_size = 20
    total_results = len(items)
    start = (page - 1) * page_size
    end = start + page_size
    page_items = items[start:end]

    results = []
    for dist_km, h in page_items:
        a = h.attrs or {}
        # wysokość może być w fme_height lub w attrs (FME_height):contentReference[oaicite:8]{index=8}:contentReference[oaicite:9]{index=9}
        height = None
        try:
            height = float(h.fme_height) if h.fme_height is not None else None
        except Exception:
            height = None
        if height is None:
            try:
                hv = a.get("FME_height") or a.get("height")
                height = float(hv) if hv is not None else None
            except Exception:
                height = None

        total_shares = int(getattr(h, "total_shares", 1) or 1)

        results.append({
            "id": str(h.id),              # UUID domu
            "id_fme": h.id_fme,
            "name": h.name or h.id_fme,
            "lat": h.lat,
            "lon": h.lon,
            "height": height,
            "total_shares": total_shares,
            "distance_km": round(dist_km, 3),
        })

    return JsonResponse(
        {
            "ok": True,
            "results": results,
            "page": page,
            "page_size": page_size,
            "total_results": total_results,
        }
    )


@login_required
@require_GET
def houses_sold_nearby(request):
    """
    Zwraca domy sprzedane (Trade.status='settled') w promieniu radius_km
    od punktu (lat, lon), w ciągu ostatnich `days` dni.

    GET:
      - lat, lon (float) – obowiązkowe
      - days (int) – ile dni wstecz
      - radius_km (float) – promień w km
      - page (int) – paginacja po 20 wyników
    """
    try:
        user_lat = float(request.GET.get("lat"))
        user_lon = float(request.GET.get("lon"))
    except (TypeError, ValueError):
        return JsonResponse({"ok": False, "error": "BAD_COORDS"}, status=400)

    try:
        days = int(request.GET.get("days", "0"))
    except ValueError:
        days = 0

    if days <= 0:
        # nic nie pokazujemy, jeśli days bez sensu
        return JsonResponse({
            "ok": True,
            "results": [],
            "page": 1,
            "page_size": 20,
            "total_results": 0,
        })

    try:
        radius_km = float(request.GET.get("radius_km", "5"))
    except ValueError:
        radius_km = 5.0
    if radius_km <= 0:
        radius_km = 5.0

    try:
        page = int(request.GET.get("page", "1"))
    except ValueError:
        page = 1
    if page < 1:
        page = 1

    cutoff = timezone.now() - datetime.timedelta(days=days)

    # 1) trade'y z ostatnich N dni
    trades_qs = Trade.objects.filter(status="settled", created_at__gte=cutoff)

    # 2) mapujemy listing -> house
    listing_ids = {t.listing for t in trades_qs if t.listing}
    listings = Listing.objects.filter(id__in=listing_ids)
    listing_to_house = {lst.id: lst.house for lst in listings}

    # 3) dla każdego domu bierzemy NAJŚWIEŻSZY trade (sold_at)
    house_last_sale = {}  # house_id -> datetime
    for tr in trades_qs:
        house_id = listing_to_house.get(tr.listing)
        if not house_id:
            continue
        cur = house_last_sale.get(house_id)
        if cur is None or (tr.created_at and tr.created_at > cur):
            house_last_sale[house_id] = tr.created_at

    if not house_last_sale:
        return JsonResponse({
            "ok": True,
            "results": [],
            "page": page,
            "page_size": 20,
            "total_results": 0,
        })

    # 4) dociągamy domy z lat/lon
    houses = {
        h.id: h
        for h in House.objects.filter(id__in=house_last_sale.keys())
        if h.lat is not None and h.lon is not None
    }

    def haversine_km(lat1, lon1, lat2, lon2):
        R = 6371.0  # km
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlambda = math.radians(lon2 - lon1)
        a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return R * c

    # 5) liczymy odległość, filtrujemy po promieniu
    items = []
    for house_id, sold_at in house_last_sale.items():
        h = houses.get(house_id)
        if not h or h.lat is None or h.lon is None:
            continue
        dist = haversine_km(user_lat, user_lon, h.lat, h.lon)
        if dist <= radius_km:
            items.append((dist, sold_at, h))

    # 6) sort po odległości
    items.sort(key=lambda t: t[0])

    # 7) paginacja
    page_size = 20
    total_results = len(items)
    start = (page - 1) * page_size
    end = start + page_size
    page_items = items[start:end]

    results = []
    for dist_km, sold_at, h in page_items:
        results.append({
            "id_fme": h.id_fme,
            "name": h.name or h.id_fme,
            "lat": h.lat,
            "lon": h.lon,
            "height": float(h.fme_height) if getattr(h, "fme_height", None) is not None else None,
            "sold_at": sold_at.isoformat() if sold_at else None,
            "distance_km": round(dist_km, 3),
        })

    return JsonResponse({
        "ok": True,
        "results": results,
        "page": page,
        "page_size": page_size,
        "total_results": total_results,
    })


def _effective_max_limit(house, current_total=None):
    """
    Zwraca skuteczny limit udziałów dla domu:
    - jeśli max_avail_total_shares jest ustawione -> jego wartość,
    - jeśli jest None -> przyjmujemy current_total (albo house.total_shares) jako limit,
      czyli nie pozwalamy splitować ponad to, dopóki admin nie ustawi czegoś większego.
    """
    raw = getattr(house, "max_avail_total_shares", None)
    if raw is not None:
        return int(raw)
    if current_total is not None:
        return int(current_total)
    return int(getattr(house, "total_shares", 1) or 1)


def _apply_house_split_atomic(house: House, new_total_shares: int):
    """
    Wspólna logika przeskalowania udziałów i listingów dla domu.
    Zakładamy, że zgody / uprawnienia zostały już sprawdzone.
    """
    if not isinstance(new_total_shares, int) or new_total_shares < 1:
        raise ValueError("INVALID_TOTAL_SHARES")

    old_total = house.total_shares or 1
    if old_total <= 0:
        old_total = 1

    if new_total_shares <= old_total:
        raise ValueError("NEW_TOTAL_MUST_BE_GREATER_THAN_OLD")

    # Musi być całkowity mnożnik (żeby shares nadal były intami):
    if new_total_shares % old_total != 0:
        raise ValueError("NEW_TOTAL_MUST_BE_MULTIPLE_OF_OLD")

    factor = new_total_shares // old_total

    with transaction.atomic():
        # zablokuj dom
        h = House.objects.select_for_update().get(pk=house.pk)

        # twardy limit: jeśli brak w bazie, przyjmujemy current_total jako limit
        max_limit = _effective_max_limit(h, current_total=old_total)
        if new_total_shares > max_limit:
            raise ValueError("OVER_MAX_LIMIT")

        current_total = h.total_shares or 1
        if current_total != old_total:
            # ktoś inny zmienił total_shares w międzyczasie
            raise ValueError("HOUSE_TOTAL_CHANGED")

        # przeskaluj współwłaścicieli
        ownerships = list(
            HouseOwnership.objects
            .select_for_update()
            .filter(house=h)
        )

        # pobierz i zablokuj aktywne listingi dla tego domu
        listings = list(
            Listing.objects
            .select_for_update()
            .filter(house=h.id, status="active")
        )

        # 1) przeskaluj udziały współwłaścicieli
        for ho in ownerships:
            ho.shares = ho.shares * factor
            ho.save(update_fields=["shares"])

        # 2) przeskaluj listingi (share_count)
        for lst in listings:
            if lst.share_count is not None and lst.share_count > 0:
                lst.share_count = lst.share_count * factor
                lst.save(update_fields=["share_count"])

        # 3) nowa liczba udziałów domu
        h.total_shares = new_total_shares
        h.save(update_fields=["total_shares"])

    return new_total_shares



@login_required
@require_POST
def split_house_shares(request, house_id):
    """
    Pierwszy split domu na udziały.

    Założenia:
    - dom ma jednego właściciela w HouseOwnership,
    - ma on 100% (1/1) udziałów,
    - dotąd house.total_shares jest None lub 1,
    - po operacji total_shares = new_total_shares, np. 100,
      a ten właściciel ma new_total_shares udziałów.
    """
    try:
        data = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"ok": False, "error": "INVALID_JSON"}, status=400)

    new_total_shares = data.get("total_shares")

    # prosta walidacja
    if not isinstance(new_total_shares, int) or new_total_shares < 1:
        return JsonResponse(
            {"ok": False, "error": "INVALID_TOTAL_SHARES"},
            status=400,
        )

    try:
        house = House.objects.get(id=house_id)
    except House.DoesNotExist:
        return JsonResponse({"ok": False, "error": "HOUSE_NOT_FOUND"}, status=404)

    ownerships = list(HouseOwnership.objects.filter(house=house))
    if not ownerships:
        return JsonResponse({"ok": False, "error": "NO_OWNER"}, status=400)
    if len(ownerships) > 1:
        return JsonResponse({"ok": False, "error": "CANNOT_SPLIT_MULTI_OWNER"}, status=400)

    ho = ownerships[0]
    if ho.user_id != request.user.id:
        return JsonResponse({"ok": False, "error": "NOT_OWNER"}, status=403)

    if house.total_shares not in (None, 1):
        return JsonResponse({"ok": False, "error": "ALREADY_SPLIT"}, status=400)

    # limit z bazy – jeśli ustawiony
    current_total = house.total_shares or 1
    max_limit = _effective_max_limit(house, current_total=current_total)
    if new_total_shares > max_limit:
        return JsonResponse(
            {
                "ok": False,
                "error": "LIMIT_TOO_LOW",
                "current_limit": int(max_limit),
            },
            status=400,
        )


    try:
        _apply_house_split_atomic(house, new_total_shares)
    except ValueError as e:
        return JsonResponse({"ok": False, "error": str(e)}, status=400)

    # odśwież obiekty
    ho.refresh_from_db()
    house.refresh_from_db()

    return JsonResponse(
        {
            "ok": True,
            "house_id": str(house.id),
            "total_shares": house.total_shares,
            "owner_shares": ho.shares,
        }
    )


@login_required
@require_POST
def house_split_direct(request, house_id):
    """
    Split domu przez użytkownika mającego >50% udziałów.
    Docelowo używane z panelu My Real Estate (bez głosowania).
    """
    try:
        data = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"ok": False, "error": "INVALID_JSON"}, status=400)

    new_total_shares = data.get("total_shares")

    if not isinstance(new_total_shares, int) or new_total_shares < 1:
        return JsonResponse({"ok": False, "error": "INVALID_TOTAL_SHARES"}, status=400)

    try:
        house = House.objects.get(id=house_id)
    except House.DoesNotExist:
        return JsonResponse({"ok": False, "error": "HOUSE_NOT_FOUND"}, status=404)

    # udziały zalogowanego usera
    ho = HouseOwnership.objects.filter(house=house, user=request.user).first()
    if not ho or ho.shares <= 0:
        return JsonResponse({"ok": False, "error": "NOT_OWNER"}, status=403)

    total = house.total_shares or 1
    if total <= 0:
        total = 1

    my_percent = (ho.shares / total) * 100.0

    # na razie: jeśli <= 50% → w przyszłości tu wejdzie ścieżka głosowania
    if my_percent <= 50.0:
        return JsonResponse(
            {
                "ok": False,
                "error": "NEED_VOTING",
                "my_percent": round(my_percent, 2),
            },
            status=403,
        )

    # limit z bazy (lub domyślnie = current_total)
    current_total = house.total_shares or 1
    max_limit = _effective_max_limit(house, current_total=current_total)
    if new_total_shares > max_limit:
        return JsonResponse(
            {
                "ok": False,
                "error": "LIMIT_TOO_LOW",
                "current_limit": int(max_limit),
            },
            status=400,
        )


    try:
        _apply_house_split_atomic(house, new_total_shares)
    except ValueError as e:
        return JsonResponse({"ok": False, "error": str(e)}, status=400)

    # odśwież dane
    ho.refresh_from_db()
    house.refresh_from_db()

    total_after = house.total_shares or 1
    my_percent_after = (ho.shares / total_after) * 100.0 if total_after else 0.0

    return JsonResponse(
        {
            "ok": True,
            "house_id": str(house.id),
            "total_shares": int(total_after),
            "my_shares": int(ho.shares),
            "my_percent": round(my_percent_after, 2),
        }
    )

@login_required
@require_POST
def split_proposal_create(request, house_id):
    """
    Inicjuje głosowanie nad splitem domu:
    - user musi być współwłaścicielem
    - jeśli ma >50% udziałów → niech użyje direct split (zwracamy błąd)
    - jeśli istnieje już open propozycja → błąd
    """
    try:
        data = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"ok": False, "error": "INVALID_JSON"}, status=400)

    requested_total = data.get("total_shares")
    if not isinstance(requested_total, int) or requested_total < 1:
        return JsonResponse({"ok": False, "error": "INVALID_TOTAL_SHARES"}, status=400)

    try:
        house = House.objects.get(id=house_id)
    except House.DoesNotExist:
        return JsonResponse({"ok": False, "error": "HOUSE_NOT_FOUND"}, status=404)

    # Udziały zalogowanego usera
    ho = HouseOwnership.objects.filter(house=house, user=request.user).first()
    if not ho or ho.shares <= 0:
        return JsonResponse({"ok": False, "error": "NOT_OWNER"}, status=403)

    total = house.total_shares or 1
    if total <= 0:
        total = 1

    # Jeśli user ma >50% → odsyłamy do direct splitu
    if ho.shares * 2 > total:
        return JsonResponse({"ok": False, "error": "USE_DIRECT_SPLIT"}, status=400)

    # walidacja parametru
    if requested_total <= total:
        return JsonResponse({"ok": False, "error": "NEW_TOTAL_MUST_BE_GREATER_THAN_OLD"}, status=400)
    if requested_total % total != 0:
        return JsonResponse({"ok": False, "error": "NEW_TOTAL_MUST_BE_MULTIPLE_OF_OLD"}, status=400)

    # limit z bazy
    max_limit = _effective_max_limit(house, current_total=total)
    if requested_total > max_limit:
        return JsonResponse(
            {
                "ok": False,
                "error": "LIMIT_TOO_LOW",
                "current_limit": int(max_limit),
            },
            status=400,
        )

    # tylko jedna open propozycja na dom
    if ShareSplitProposal.objects.filter(house=house, status="open").exists():
        return JsonResponse({"ok": False, "error": "PROPOSAL_ALREADY_OPEN"}, status=400)

    with transaction.atomic():
        proposal = ShareSplitProposal.objects.create(
            house=house,
            initiator=request.user,
            current_total_shares=total,
            requested_total_shares=requested_total,
        )
        # inicjator automatycznie głosuje YES
        ShareSplitVote.objects.create(
            proposal=proposal,
            user=request.user,
            vote=True,
        )

    return JsonResponse(
        {
            "ok": True,
            "proposal_id": str(proposal.id),
            "house_id": str(house.id),
            "current_total_shares": total,
            "requested_total_shares": requested_total,
        },
        status=201,
    )


@login_required
@require_POST
def map_position(request):
    """
    Zapisuje ostatnią pozycję zalogowanego użytkownika w Redisie.
    """
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
    """
    Zwraca listę ostatnich pozycji aktywnych użytkowników/botów z Redisa.

    Na razie: bierzemy wszystkie świeże pozycje z promienia ~całej Ziemi.
    Front i tak filtruje po dystansie (MAX_AVATAR_DISTANCE_METERS).
    """

    # bierzemy wszystko w promieniu 20000 km od (0,0)
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

        # nie pokazujemy własnej kropki
        if a_type == "user" and a_id == me_id_str:
            continue

        name = a.get("name") or f"{a_type} {a_id}"
        lat_val = float(a.get("lat"))
        lon_val = float(a.get("lon"))
        alt_val = float(a.get("alt", 0.0))

        op_val = a.get("op") 

        out.append({
            "id": a_id,
            "name": name,
            "type": a_type,
            "lat": lat_val,
            "lon": lon_val,
            "alt": alt_val,
            "op": op_val,
        })

    return JsonResponse(out, safe=False)



@login_required
@require_POST
def split_proposal_vote(request, proposal_id):
    """
    Głosowanie YES/NO:
    - user musi być współwłaścicielem
    - liczymy udziały YES
    - jeśli YES > 50% udziałów → wywołujemy _apply_house_split_atomic
    """
    yes_percent = 0.0
    no_percent = 0.0
    # pobierz głos z JSON lub x-www-form-urlencoded
    vote_raw = None
    if request.content_type == "application/json":
        try:
            data = json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            data = {}
        vote_raw = data.get("vote")
    if vote_raw is None:
        vote_raw = request.POST.get("vote")

    if isinstance(vote_raw, str):
        v = vote_raw.strip().lower()
        if v in ("yes", "y", "true", "1"):
            vote_val = True
        elif v in ("no", "n", "false", "0"):
            vote_val = False
        else:
            return JsonResponse({"ok": False, "error": "INVALID_VOTE"}, status=400)
    elif isinstance(vote_raw, bool):
        vote_val = vote_raw
    else:
        return JsonResponse({"ok": False, "error": "INVALID_VOTE"}, status=400)

    with transaction.atomic():
        try:
            proposal = (
                ShareSplitProposal.objects
                .select_for_update()
                .select_related("house")
                .get(id=proposal_id)
            )
        except ShareSplitProposal.DoesNotExist:
            return JsonResponse({"ok": False, "error": "PROPOSAL_NOT_FOUND"}, status=404)

        if proposal.status != "open":
            return JsonResponse(
                {"ok": False, "error": "PROPOSAL_NOT_OPEN", "status": proposal.status},
                status=400,
            )

        house = proposal.house

        # Współwłaściciele + mapowanie user_id -> shares
        ownerships = list(
            HouseOwnership.objects
            .select_for_update()
            .filter(house=house)
        )
        shares_map = {ho.user_id: ho.shares for ho in ownerships}

        # user musi być współwłaścicielem
        if request.user.id not in shares_map or shares_map[request.user.id] <= 0:
            return JsonResponse({"ok": False, "error": "NOT_OWNER"}, status=403)

        vote_obj, _ = ShareSplitVote.objects.get_or_create(
            proposal=proposal,
            user=request.user,
            defaults={"vote": vote_val},
        )
        if vote_obj.vote != vote_val:
            vote_obj.vote = vote_val
            vote_obj.save(update_fields=["vote"])

        total = house.total_shares or 1
        if total <= 0:
            total = 1

        yes_votes = proposal.votes.filter(vote=True)
        no_votes  = proposal.votes.filter(vote=False)

        yes_shares = sum(shares_map.get(v.user_id, 0) for v in yes_votes)
        no_shares  = sum(shares_map.get(v.user_id, 0) for v in no_votes)

        yes_percent = (yes_shares / total * 100.0) if total else 0.0
        no_percent  = (no_shares / total * 100.0) if total else 0.0

        # jeśli YES > 50%, próbujemy wykonać split
        if yes_shares * 2 > total:
            max_limit = _effective_max_limit(house, current_total=total)
            if proposal.requested_total_shares > max_limit:
                return JsonResponse(
                    {
                        "ok": False,
                        "error": "LIMIT_TOO_LOW",
                        "current_limit": int(max_limit),
                        "yes_percent": round(yes_percent, 2),
                        "no_percent": round(no_percent, 2),
                    },
                    status=400,
                )

            try:
                _apply_house_split_atomic(house, proposal.requested_total_shares)
            except ValueError as e:
                return JsonResponse(
                    {
                        "ok": False,
                        "error": f"SPLIT_FAILED_{str(e)}",
                        "yes_percent": round(yes_percent, 2),
                        "no_percent": round(no_percent, 2),
                    },
                    status=400,
                )

            proposal.status = "applied"
            proposal.applied_at = timezone.now()
            proposal.save(update_fields=["status", "applied_at"])

            house.refresh_from_db()

            return JsonResponse(
                {
                    "ok": True,
                    "proposal_id": str(proposal.id),
                    "status": proposal.status,
                    "yes_percent": round(yes_percent, 2),
                    "no_percent": round(no_percent, 2),
                    "new_total_shares": int(house.total_shares or 1),
                }
            )

        # jeśli NO > 50% → głosowanie przepada
        if no_shares * 2 > total:
            proposal.status = "cancelled"
            proposal.cancelled_at = timezone.now()
            proposal.save(update_fields=["status", "cancelled_at"])

            return JsonResponse(
                {
                    "ok": True,
                    "proposal_id": str(proposal.id),
                    "status": proposal.status,     # 'cancelled'
                    "yes_percent": round(yes_percent, 2),
                    "no_percent": round(no_percent, 2),
                    "cancel_reason": "NO_MAJORITY",
                }
            )


    # jeśli jeszcze nie przekroczyło 50% ani YES, ani NO
    return JsonResponse(
        {
            "ok": True,
            "proposal_id": str(proposal.id),
            "status": proposal.status,
            "yes_percent": round(yes_percent, 2),
            "no_percent": round(no_percent, 2),
        }
    )


@login_required
@require_POST
def split_proposal_cancel(request, proposal_id):
    """
    Anuluje otwartą propozycję splitu (tylko inicjator).
    """
    with transaction.atomic():
        try:
            proposal = (
                ShareSplitProposal.objects
                .select_for_update()
                .get(id=proposal_id)
            )
        except ShareSplitProposal.DoesNotExist:
            return JsonResponse({"ok": False, "error": "PROPOSAL_NOT_FOUND"}, status=404)

        if proposal.status != "open":
            return JsonResponse(
                {"ok": False, "error": "PROPOSAL_NOT_OPEN", "status": proposal.status},
                status=400,
            )

        if proposal.initiator_id != request.user.id:
            return JsonResponse({"ok": False, "error": "NOT_INITIATOR"}, status=403)

        proposal.status = "cancelled"
        proposal.cancelled_at = timezone.now()
        proposal.save(update_fields=["status", "cancelled_at"])

    return JsonResponse({"ok": True})

@login_required
@require_POST
def split_limit_request(request, house_id):
    """
    Prośba o podniesienie max_avail_total_shares.

    TERAZ:
      - tworzymy rekord SplitLimitRequest ze statusem 'pending',
      - NIE podnosimy house.max_avail_total_shares,
      - jeśli istnieje już PENDING request na ten dom → odrzucamy nowy
        i informujemy, kto złożył poprzedni.

    WIELKI ADMIN (serwis) później ręcznie:
      - podnosi max_avail_total_shares,
      - zmienia status requestu na 'approved' / 'rejected'.
    """
    try:
        data = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"ok": False, "error": "INVALID_JSON"}, status=400)

    requested_max = data.get("requested_max_shares")
    if not isinstance(requested_max, int) or requested_max < 1:
        return JsonResponse({"ok": False, "error": "INVALID_REQUESTED_MAX"}, status=400)

    try:
        house = House.objects.get(id=house_id)
    except House.DoesNotExist:
        return JsonResponse({"ok": False, "error": "HOUSE_NOT_FOUND"}, status=404)

    # Prośbę może wysłać tylko ktoś, kto ma udziały
    ho = HouseOwnership.objects.filter(house=house, user=request.user).first()
    if not ho or ho.shares <= 0:
        return JsonResponse({"ok": False, "error": "NOT_OWNER"}, status=403)

    current_total = house.total_shares or 1
    if requested_max < current_total:
        return JsonResponse({"ok": False, "error": "REQUEST_BELOW_TOTAL"}, status=400)

    with transaction.atomic():
        h = House.objects.select_for_update().get(id=house.id)
        old_limit = h.max_avail_total_shares

        pending = (
            SplitLimitRequest.objects
            .select_for_update()
            .select_related("user")
            .filter(house=h, status="pending")
            .first()
        )
        if pending:
            ...
            # jak było

        req = SplitLimitRequest.objects.create(
            house=h,
            user=request.user,
            requested_max_shares=requested_max,
            status="pending",
            decided_at=None,
            decided_by=None,
        )

        # AUTOZGODA dla botów (user_range >= 10):contentReference[oaicite:14]{index=14}
        if getattr(request.user, "user_range", 1) >= 10:
            current_limit = getattr(h, "max_avail_total_shares", None)
            if current_limit is None or req.requested_max_shares > current_limit:
                h.max_avail_total_shares = req.requested_max_shares
                h.save(update_fields=["max_avail_total_shares"])

            req.status = "approved"
            req.decided_at = timezone.now()
            req.decided_by = request.user
            req.save(update_fields=["status", "decided_at", "decided_by"])
        return JsonResponse(
            {
                "ok": True,
                "request_id": str(req.id),
                "status": req.status,  # 'pending'
                "requested_max_shares": req.requested_max_shares,
                "current_limit": int(house.max_avail_total_shares)
                    if house.max_avail_total_shares is not None
                    else None,
                "requested_by_id": str(request.user.id),
                "requested_by_username": request.user.username,
            }
        )


@login_required
@require_GET
def api_my_houses(request):
    """
    Returns all houses owned by the current user (from HouseOwnership).
    """
    ownerships = (
        HouseOwnership.objects
        .filter(user=request.user)
        .select_related('house')
    )

    results = []
    for ho in ownerships:
        h = ho.house
        if not h:
            continue

        total_shares = h.total_shares or 1
        percent = (ho.shares / total_shares) * 100.0 if total_shares else 0.0

        # Check for active listing
        active_listing = Listing.objects.filter(
            house=h.id, seller=request.user.id, status='active'
        ).first()

        results.append({
            "house_id": str(h.id),
            "id_fme": h.id_fme,
            "name": h.name or h.id_fme,
            "lat": h.lat,
            "lon": h.lon,
            "height": float(h.fme_height) if h.fme_height else None,
            "shares": ho.shares,
            "total_shares": total_shares,
            "percent": round(percent, 2),
            "status": h.status,
            "has_listing": active_listing is not None,
            "listing_price": float(active_listing.price) if active_listing else None,
            "listing_id": str(active_listing.id) if active_listing else None,
        })

    return JsonResponse({"ok": True, "houses": results})


@login_required
@require_GET
def api_my_transactions(request):
    """
    Returns all trades where user is buyer or seller.
    """
    trades = Trade.objects.filter(
        Q(buyer=request.user.id) | Q(seller=request.user.id)
    ).order_by('-created_at')

    # Get listing IDs to fetch house info
    listing_ids = [t.listing for t in trades if t.listing]
    listings = {l.id: l for l in Listing.objects.filter(id__in=listing_ids)}

    # Get house info
    house_ids = [l.house for l in listings.values()]
    houses = {h.id: h for h in House.objects.filter(id__in=house_ids)}

    results = []
    for t in trades:
        listing = listings.get(t.listing)
        house = houses.get(listing.house) if listing else None

        role = 'buyer' if t.buyer == request.user.id else 'seller'
        counterparty_id = t.seller if role == 'buyer' else t.buyer
        counterparty = User.objects.filter(id=counterparty_id).first()

        results.append({
            "id": str(t.id),
            "role": role,
            "counterparty": counterparty.username if counterparty else None,
            "amount": float(t.amount) if t.amount else None,
            "currency": t.currency,
            "status": t.status,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "house_id": str(house.id) if house else None,
            "house_id_fme": house.id_fme if house else None,
            "house_name": house.name if house else None,
            "house_lat": house.lat if house else None,
            "house_lon": house.lon if house else None,
        })

    return JsonResponse({"ok": True, "transactions": results})


# ═══════════════════════════════════════════════════════════════════════════
# VIEWPOINTS (Redis-backed)
# ═══════════════════════════════════════════════════════════════════════════

from django_redis import get_redis_connection

VIEWPOINTS_KEY_PREFIX = "viewpoints"


def _viewpoints_key(user_id):
    return f"{VIEWPOINTS_KEY_PREFIX}:{user_id}"


@login_required
@require_GET
def api_viewpoints_list(request):
    """
    Returns all viewpoints for the current user from Redis.
    """
    r = get_redis_connection("default")
    key = _viewpoints_key(request.user.id)

    raw_data = r.get(key)
    if not raw_data:
        return JsonResponse({"ok": True, "viewpoints": []})

    try:
        viewpoints = json.loads(raw_data.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        viewpoints = []

    return JsonResponse({"ok": True, "viewpoints": viewpoints})


@login_required
@require_POST
def api_viewpoints_save(request):
    """
    Save a new viewpoint. Expects JSON with: name, lat, lon, height, heading, pitch, roll
    """
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

    # Optional camera orientation
    height = data.get("height")
    heading = data.get("heading")
    pitch = data.get("pitch")
    roll = data.get("roll")

    # Cesium position (Cartesian3)
    pos_x = data.get("pos_x")
    pos_y = data.get("pos_y")
    pos_z = data.get("pos_z")

    viewpoint = {
        "id": str(uuid.uuid4()),
        "name": name,
        "lat": lat,
        "lon": lon,
        "height": float(height) if height is not None else None,
        "heading": float(heading) if heading is not None else 0,
        "pitch": float(pitch) if pitch is not None else -0.5,
        "roll": float(roll) if roll is not None else 0,
        "pos_x": float(pos_x) if pos_x is not None else None,
        "pos_y": float(pos_y) if pos_y is not None else None,
        "pos_z": float(pos_z) if pos_z is not None else None,
        "created_at": timezone.now().isoformat(),
    }

    r = get_redis_connection("default")
    key = _viewpoints_key(request.user.id)

    # Get existing viewpoints
    raw_data = r.get(key)
    if raw_data:
        try:
            viewpoints = json.loads(raw_data.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            viewpoints = []
    else:
        viewpoints = []

    # Add new viewpoint at the beginning
    viewpoints.insert(0, viewpoint)

    # Limit to 50 viewpoints max
    viewpoints = viewpoints[:50]

    # Save back to Redis (no expiry - permanent storage)
    r.set(key, json.dumps(viewpoints))

    return JsonResponse({"ok": True, "viewpoint": viewpoint})


@login_required
@require_POST
def api_viewpoints_delete(request, viewpoint_id):
    """
    Delete a viewpoint by ID.
    """
    r = get_redis_connection("default")
    key = _viewpoints_key(request.user.id)

    raw_data = r.get(key)
    if not raw_data:
        return JsonResponse({"ok": False, "error": "NOT_FOUND"}, status=404)

    try:
        viewpoints = json.loads(raw_data.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({"ok": False, "error": "NOT_FOUND"}, status=404)

    # Filter out the viewpoint to delete
    new_viewpoints = [vp for vp in viewpoints if vp.get("id") != viewpoint_id]

    if len(new_viewpoints) == len(viewpoints):
        return JsonResponse({"ok": False, "error": "NOT_FOUND"}, status=404)

    r.set(key, json.dumps(new_viewpoints))

    return JsonResponse({"ok": True})

