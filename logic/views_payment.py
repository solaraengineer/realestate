<<<<<<< HEAD
import json
import stripe
=======

import json
import stripe
from functools import wraps
from decimal import Decimal
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
from django.conf import settings
from django.db import transaction
from django.http import JsonResponse
from django.shortcuts import redirect
from django.views.decorators.csrf import csrf_protect, csrf_exempt
<<<<<<< HEAD
from django.contrib.auth.decorators import login_required

from .models import Listing, User, HouseOwnership, House

stripe.api_key = settings.STRIPE_SECRET_KEY


@csrf_protect
@login_required
=======
from django.utils import timezone

from .models import Listing, User, HouseOwnership, House, Transaction

stripe.api_key = settings.STRIPE_SECRET_KEY

PLATFORM_FEE_PERCENT = Decimal('0.02')


def login_required_json(view_func):
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({"ok": False, "error": "AUTH_REQUIRED"}, status=401)
        return view_func(request, *args, **kwargs)
    return wrapper


@login_required_json
def api_stripe_status(request):
    user = request.user

    if not user.stripe_account_id:
        return JsonResponse({
            'ok': True,
            'connected': False,
            'kyc_complete': False,
            'charges_enabled': False,
            'payouts_enabled': False,
            'details_submitted': False,
        })

    try:
        account = stripe.Account.retrieve(user.stripe_account_id)

        charges_enabled = account.charges_enabled
        payouts_enabled = account.payouts_enabled
        details_submitted = account.details_submitted
        kyc_complete = charges_enabled and payouts_enabled

        if kyc_complete and not user.stripe_kyc:
            user.stripe_kyc = True
            user.save(update_fields=['stripe_kyc'])

        return JsonResponse({
            'ok': True,
            'connected': True,
            'stripe_account_id': user.stripe_account_id,
            'kyc_complete': kyc_complete,
            'charges_enabled': charges_enabled,
            'payouts_enabled': payouts_enabled,
            'details_submitted': details_submitted,
        })
    except stripe.error.StripeError as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=500)



@csrf_protect
@login_required_json
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
def api_stripe_onboard(request):
    if request.method != 'POST':
        return JsonResponse({'ok': False, 'error': 'METHOD_NOT_ALLOWED'}, status=405)

    user = request.user

    try:
        if user.stripe_account_id:
            account = stripe.Account.retrieve(user.stripe_account_id)

            if account.charges_enabled and account.payouts_enabled:
                user.stripe_kyc = True
<<<<<<< HEAD
                user.save()
                return JsonResponse({
                    'ok': True,
                    'already_complete': True,
=======
                user.save(update_fields=['stripe_kyc'])
                return JsonResponse({
                    'ok': True,
                    'already_complete': True,
                    'message': 'Your Stripe account is already fully set up!',
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
                })

            stripe_account_id = user.stripe_account_id
        else:
<<<<<<< HEAD
            if not user.country:
                return JsonResponse({'ok': False, 'error': 'COUNTRY_NOT_FOUND'}, status=400)

            account = stripe.Account.create(
                type="express",
                country=user.country,
                email=user.email,
                capabilities={
=======
            country = user.country

            account = stripe.Account.create(
                type="express",
                country=country,
                email=user.email,
                capabilities={
                    "card_payments": {"requested": True},
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
                    "transfers": {"requested": True},
                },
                metadata={
                    'user_id': str(user.id),
                    'username': user.username,
                }
            )
            stripe_account_id = account.id
            user.stripe_account_id = stripe_account_id
<<<<<<< HEAD
            user.save()
=======
            user.save(update_fields=['stripe_account_id'])
>>>>>>> 7ee9b21 (Inital at 01.12.2026)

        account_link = stripe.AccountLink.create(
            account=stripe_account_id,
            refresh_url=request.build_absolute_uri('/api/stripe/onboard/refresh/'),
            return_url=request.build_absolute_uri('/api/stripe/onboard/complete/'),
            type="account_onboarding",
        )

        return JsonResponse({
            'ok': True,
            'onboarding_url': account_link.url,
        })

    except stripe.error.StripeError as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=500)


<<<<<<< HEAD
@login_required
=======
@login_required_json
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
def api_stripe_onboard_complete(request):
    user = request.user

    if user.stripe_account_id:
        try:
            account = stripe.Account.retrieve(user.stripe_account_id)
            if account.charges_enabled and account.payouts_enabled:
                user.stripe_kyc = True
<<<<<<< HEAD
                user.save()
=======
                user.save(update_fields=['stripe_kyc'])
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
        except stripe.error.StripeError:
            pass

    return redirect('/?stripe=complete')


<<<<<<< HEAD
@login_required
=======
@login_required_json
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
def api_stripe_onboard_refresh(request):
    user = request.user

    if not user.stripe_account_id:
        return redirect('/?stripe=error')

    try:
        account_link = stripe.AccountLink.create(
            account=user.stripe_account_id,
            refresh_url=request.build_absolute_uri('/api/stripe/onboard/refresh/'),
            return_url=request.build_absolute_uri('/api/stripe/onboard/complete/'),
            type="account_onboarding",
        )
        return redirect(account_link.url)
    except stripe.error.StripeError:
        return redirect('/?stripe=error')


<<<<<<< HEAD
@login_required
def api_stripe_status(request):
    user = request.user

    if not user.stripe_account_id:
        return JsonResponse({
            'ok': True,
            'connected': False,
            'kyc_complete': False,
        })

    try:
        account = stripe.Account.retrieve(user.stripe_account_id)
        kyc_complete = account.charges_enabled and account.payouts_enabled

        if kyc_complete and not user.stripe_kyc:
            user.stripe_kyc = True
            user.save()

        return JsonResponse({
            'ok': True,
            'connected': True,
            'kyc_complete': kyc_complete,
        })
    except stripe.error.StripeError as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=500)


@csrf_protect
@login_required
=======

@csrf_protect
@login_required_json
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
def api_checkout(request):
    if request.method != 'POST':
        return JsonResponse({'ok': False, 'error': 'METHOD_NOT_ALLOWED'}, status=405)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'ok': False, 'error': 'INVALID_JSON'}, status=400)

    listing_id = data.get('listing_id')
    if not listing_id:
        return JsonResponse({'ok': False, 'error': 'MISSING_LISTING_ID'}, status=400)

<<<<<<< HEAD
    try:
        listing = Listing.objects.get(id=listing_id)

        if listing.status == 'sold':
            return JsonResponse({'ok': False, 'error': 'LISTING_SOLD'}, status=400)

        if listing.left_shares <= 0:
            return JsonResponse({'ok': False, 'error': 'NO_SHARES_LEFT'}, status=400)

        if listing.seller_id == request.user.id:
            return JsonResponse({'ok': False, 'error': 'CANNOT_BUY_OWN'}, status=400)

        seller = User.objects.get(id=listing.seller_id)

        if not seller.stripe_account_id or not seller.stripe_kyc:
            return JsonResponse({'ok': False, 'error': 'SELLER_NOT_ONBOARDED'}, status=400)

        platform_fee = int(listing.price * 0.02)
=======
    buyer = request.user

    if not buyer.stripe_account_id:
        return JsonResponse({
            'ok': False,
            'error': 'BUYER_NOT_ONBOARDED',
            'message': 'You need to complete Stripe onboarding before buying.',
        }, status=400)

    try:
        buyer_account = stripe.Account.retrieve(buyer.stripe_account_id)
        if not buyer_account.charges_enabled:
            return JsonResponse({
                'ok': False,
                'error': 'BUYER_CHARGES_DISABLED',
                'message': 'Your Stripe account is not fully verified. Please complete onboarding.',
            }, status=400)
    except stripe.error.StripeError as e:
        return JsonResponse({
            'ok': False,
            'error': 'BUYER_STRIPE_ERROR',
            'message': str(e),
        }, status=400)




    try:
        listing = Listing.objects.select_related('house', 'seller').get(id=listing_id)
    except Listing.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'LISTING_NOT_FOUND'}, status=404)

    if listing.status != 'active':
        return JsonResponse({'ok': False, 'error': 'LISTING_NOT_ACTIVE'}, status=400)

    # Check remaining shares
    remaining = listing.left_shares if listing.left_shares is not None else listing.share_count
    if remaining <= 0:
        return JsonResponse({'ok': False, 'error': 'NO_SHARES_LEFT'}, status=400)

    if listing.seller_id == buyer.id:
        return JsonResponse({'ok': False, 'error': 'CANNOT_BUY_OWN'}, status=400)

    seller = listing.seller

    if not seller.stripe_account_id:
        return JsonResponse({
            'ok': False,
            'error': 'SELLER_NOT_ONBOARDED',
            'message': 'The seller has not set up their payment account.',
        }, status=400)

    try:
        seller_account = stripe.Account.retrieve(seller.stripe_account_id)

        if not seller_account.charges_enabled:
            return JsonResponse({
                'ok': False,
                'error': 'SELLER_CHARGES_DISABLED',
                'message': 'The seller\'s payment account is not fully verified.',
            }, status=400)

        if not seller_account.payouts_enabled:
            return JsonResponse({
                'ok': False,
                'error': 'SELLER_PAYOUTS_DISABLED',
                'message': 'The seller cannot receive payouts yet.',
            }, status=400)

    except stripe.error.StripeError as e:
        return JsonResponse({
            'ok': False,
            'error': 'SELLER_STRIPE_ERROR',
            'message': str(e),
        }, status=400)

    try:
        price_cents = int(listing.price * 100)  # Convert to cents/groszy
        platform_fee_cents = int(listing.price * PLATFORM_FEE_PERCENT * 100)



        idempotency_key = f"checkout_{listing_id}_{buyer.id}_{int(timezone.now().timestamp() // 300)}"
>>>>>>> 7ee9b21 (Inital at 01.12.2026)

        session = stripe.checkout.Session.create(
            line_items=[{
                'price_data': {
<<<<<<< HEAD
                    'currency': 'pln',
                    'unit_amount': int(listing.price),
                    'product_data': {
                        'name': f'Udziały - {listing.share_count} szt.',
=======
                    'currency': listing.currency.lower(),
                    'unit_amount': price_cents,
                    'product_data': {
                        'name': f'{listing.house.name or "Property"} - {listing.share_count} shares',
                        'description': f'Purchase of {listing.share_count} shares in property {listing.house_id}',
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
                    },
                },
                'quantity': 1,
            }],
            mode='payment',
            payment_intent_data={
<<<<<<< HEAD
                'application_fee_amount': platform_fee,
=======
                'application_fee_amount': platform_fee_cents,
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
                'transfer_data': {
                    'destination': seller.stripe_account_id,
                },
            },
            success_url=request.build_absolute_uri('/payment/success/') + '?session_id={CHECKOUT_SESSION_ID}',
            cancel_url=request.build_absolute_uri('/payment/cancel/'),
<<<<<<< HEAD
            metadata={
                'listing_id': str(listing_id),
                'buyer_id': str(request.user.id),
                'seller_id': str(listing.seller_id),
                'shares': str(listing.share_count),
                'house_id': str(listing.house_id),
            },
=======
            customer_email=buyer.email,
            metadata={
                'listing_id': str(listing_id),
                'buyer_id': str(buyer.id),
                'seller_id': str(seller.id),
                'shares': str(listing.share_count),
                'house_id': str(listing.house_id),
            },
            idempotency_key=idempotency_key,
        )


        Transaction.objects.update_or_create(
            stripe_session_id=session.id,
            defaults={
                'listing_id': listing_id,
                'house_id': listing.house_id,
                'buyer_id': buyer.id,
                'seller_id': seller.id,
                'shares': listing.share_count,
                'amount': listing.price,
                'currency': listing.currency,
                'platform_fee': listing.price * PLATFORM_FEE_PERCENT,
                'status': 'pending',
            }
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
        )

        return JsonResponse({
            'ok': True,
            'checkout_url': session.url,
<<<<<<< HEAD
        })

    except Listing.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'LISTING_NOT_FOUND'}, status=404)
    except User.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'SELLER_NOT_FOUND'}, status=400)
=======
            'session_id': session.id,
        })

>>>>>>> 7ee9b21 (Inital at 01.12.2026)
    except stripe.error.StripeError as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=500)


<<<<<<< HEAD
=======

>>>>>>> 7ee9b21 (Inital at 01.12.2026)
@csrf_exempt
def stripe_webhook(request):
    payload = request.body
    sig_header = request.META.get('HTTP_STRIPE_SIGNATURE')

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        return JsonResponse({'error': 'Invalid payload'}, status=400)
    except stripe.error.SignatureVerificationError:
        return JsonResponse({'error': 'Invalid signature'}, status=400)

<<<<<<< HEAD
    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        handle_successful_payment(session)
=======
    event_type = event['type']

    if event_type == 'checkout.session.completed':
        session = event['data']['object']
        handle_checkout_completed(session)

    elif event_type == 'payment_intent.succeeded':
        payment_intent = event['data']['object']
        pass

    elif event_type == 'payment_intent.payment_failed':
        payment_intent = event['data']['object']
        handle_payment_failed(payment_intent)

    elif event_type == 'charge.refunded':
        charge = event['data']['object']
        handle_refund(charge)
>>>>>>> 7ee9b21 (Inital at 01.12.2026)

    return JsonResponse({'ok': True})


<<<<<<< HEAD
def handle_successful_payment(session):
=======
def handle_checkout_completed(session):
    session_id = session['id']
    payment_intent_id = session.get('payment_intent')

    try:
        tx = Transaction.objects.get(stripe_session_id=session_id)
        if tx.status == 'completed':
            return
    except Transaction.DoesNotExist:

        tx = None

>>>>>>> 7ee9b21 (Inital at 01.12.2026)
    listing_id = session['metadata'].get('listing_id')
    buyer_id = session['metadata'].get('buyer_id')
    seller_id = session['metadata'].get('seller_id')
    shares = int(session['metadata'].get('shares', 1))
    house_id = session['metadata'].get('house_id')

<<<<<<< HEAD
    with transaction.atomic():
        listing = Listing.objects.select_for_update().get(id=listing_id)

        if listing.left_shares < shares:
            stripe.Refund.create(payment_intent=session['payment_intent'])
            return

        listing.left_shares -= shares
=======
    if not all([listing_id, buyer_id, seller_id, house_id]):
        return
    with transaction.atomic():
        try:
            listing = Listing.objects.select_for_update().get(id=listing_id)
        except Listing.DoesNotExist:
            if payment_intent_id:
                stripe.Refund.create(payment_intent=payment_intent_id)
            return

        remaining = listing.left_shares if listing.left_shares is not None else listing.share_count
        if remaining < shares:
            if payment_intent_id:
                stripe.Refund.create(payment_intent=payment_intent_id)
            if tx:
                tx.status = 'refunded'
                tx.save(update_fields=['status'])
            return


        listing.left_shares = remaining - shares
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
        if listing.left_shares == 0:
            listing.status = 'sold'
        listing.save()

<<<<<<< HEAD
        buyer_ownership, _ = HouseOwnership.objects.get_or_create(
=======

        buyer_ownership, created = HouseOwnership.objects.get_or_create(
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
            house_id=house_id,
            user_id=buyer_id,
            defaults={'shares': 0}
        )
        buyer_ownership.shares += shares
<<<<<<< HEAD
        buyer_ownership.save()

        seller_ownership = HouseOwnership.objects.get(house_id=house_id, user_id=seller_id)
        seller_ownership.shares -= shares
        if seller_ownership.shares <= 0:
            seller_ownership.delete()
        else:
            seller_ownership.save()
=======
        if not buyer_ownership.bought_for:
            buyer_ownership.bought_for = int(session.get('amount_total', 0) / 100)
        buyer_ownership.save()


        try:
            seller_ownership = HouseOwnership.objects.select_for_update().get(
                house_id=house_id, user_id=seller_id
            )
            seller_ownership.shares -= shares
            if seller_ownership.shares <= 0:
                seller_ownership.delete()
            else:
                seller_ownership.save()
        except HouseOwnership.DoesNotExist:
            pass

        if tx:
            tx.stripe_payment_intent = payment_intent_id
            tx.status = 'completed'
            tx.completed_at = timezone.now()
            tx.save()
        else:
            Transaction.objects.create(
                stripe_session_id=session_id,
                stripe_payment_intent=payment_intent_id,
                listing_id=listing_id,
                house_id=house_id,
                buyer_id=buyer_id,
                seller_id=seller_id,
                shares=shares,
                amount=Decimal(session.get('amount_total', 0)) / 100,
                currency=session.get('currency', 'pln').upper(),
                platform_fee=Decimal(session.get('total_details', {}).get('amount_fee', 0) or 0) / 100,
                status='completed',
                completed_at=timezone.now(),
            )


def handle_payment_failed(payment_intent):
    try:
        tx = Transaction.objects.filter(
            stripe_payment_intent=payment_intent['id']
        ).first()
        if tx:
            tx.status = 'failed'
            tx.save(update_fields=['status'])
    except Exception:
        pass


def handle_refund(charge):
    payment_intent_id = charge.get('payment_intent')
    if payment_intent_id:
        try:
            tx = Transaction.objects.filter(
                stripe_payment_intent=payment_intent_id
            ).first()
            if tx:
                tx.status = 'refunded'
                tx.save(update_fields=['status'])
        except Exception:
            pass
>>>>>>> 7ee9b21 (Inital at 01.12.2026)


def payment_cancel(request):
    return redirect('/?payment=cancelled')


<<<<<<< HEAD
@login_required
=======
@login_required_json
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
def payment_success(request):
    session_id = request.GET.get('session_id')

    if not session_id:
        return redirect('/')

    try:
        session = stripe.checkout.Session.retrieve(session_id)

        if session.payment_status == 'paid':
            return redirect('/?payment=success')
        else:
            return redirect('/?payment=pending')

    except stripe.error.StripeError:
<<<<<<< HEAD
        return redirect('/?payment=error')
=======
        return redirect('/?payment=error')
>>>>>>> 7ee9b21 (Inital at 01.12.2026)
