import json
import stripe
from django.conf import settings
from django.db import transaction
from django.http import JsonResponse
from django.shortcuts import redirect
from django.views.decorators.csrf import csrf_protect, csrf_exempt
from django.contrib.auth.decorators import login_required

from .models import Listing, User, HouseOwnership, House

stripe.api_key = settings.STRIPE_SECRET_KEY


@csrf_protect
@login_required
def api_stripe_onboard(request):
    if request.method != 'POST':
        return JsonResponse({'ok': False, 'error': 'METHOD_NOT_ALLOWED'}, status=405)

    user = request.user

    try:
        if user.stripe_account_id:
            account = stripe.Account.retrieve(user.stripe_account_id)

            if account.charges_enabled and account.payouts_enabled:
                user.stripe_kyc = True
                user.save()
                return JsonResponse({
                    'ok': True,
                    'already_complete': True,
                })

            stripe_account_id = user.stripe_account_id
        else:
            if not user.country:
                return JsonResponse({'ok': False, 'error': 'COUNTRY_NOT_FOUND'}, status=400)

            account = stripe.Account.create(
                type="express",
                country=user.country,
                email=user.email,
                capabilities={
                    "transfers": {"requested": True},
                },
                metadata={
                    'user_id': str(user.id),
                    'username': user.username,
                }
            )
            stripe_account_id = account.id
            user.stripe_account_id = stripe_account_id
            user.save()

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


@login_required
def api_stripe_onboard_complete(request):
    user = request.user

    if user.stripe_account_id:
        try:
            account = stripe.Account.retrieve(user.stripe_account_id)
            if account.charges_enabled and account.payouts_enabled:
                user.stripe_kyc = True
                user.save()
        except stripe.error.StripeError:
            pass

    return redirect('/?stripe=complete')


@login_required
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

        session = stripe.checkout.Session.create(
            line_items=[{
                'price_data': {
                    'currency': 'pln',
                    'unit_amount': int(listing.price),
                    'product_data': {
                        'name': f'Udziały - {listing.share_count} szt.',
                    },
                },
                'quantity': 1,
            }],
            mode='payment',
            payment_intent_data={
                'application_fee_amount': platform_fee,
                'transfer_data': {
                    'destination': seller.stripe_account_id,
                },
            },
            success_url=request.build_absolute_uri('/payment/success/') + '?session_id={CHECKOUT_SESSION_ID}',
            cancel_url=request.build_absolute_uri('/payment/cancel/'),
            metadata={
                'listing_id': str(listing_id),
                'buyer_id': str(request.user.id),
                'seller_id': str(listing.seller_id),
                'shares': str(listing.share_count),
                'house_id': str(listing.house_id),
            },
        )

        return JsonResponse({
            'ok': True,
            'checkout_url': session.url,
        })

    except Listing.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'LISTING_NOT_FOUND'}, status=404)
    except User.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'SELLER_NOT_FOUND'}, status=400)
    except stripe.error.StripeError as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=500)


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

    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        handle_successful_payment(session)

    return JsonResponse({'ok': True})


def handle_successful_payment(session):
    listing_id = session['metadata'].get('listing_id')
    buyer_id = session['metadata'].get('buyer_id')
    seller_id = session['metadata'].get('seller_id')
    shares = int(session['metadata'].get('shares', 1))
    house_id = session['metadata'].get('house_id')

    with transaction.atomic():
        listing = Listing.objects.select_for_update().get(id=listing_id)

        if listing.left_shares < shares:
            stripe.Refund.create(payment_intent=session['payment_intent'])
            return

        listing.left_shares -= shares
        if listing.left_shares == 0:
            listing.status = 'sold'
        listing.save()

        buyer_ownership, _ = HouseOwnership.objects.get_or_create(
            house_id=house_id,
            user_id=buyer_id,
            defaults={'shares': 0}
        )
        buyer_ownership.shares += shares
        buyer_ownership.save()

        seller_ownership = HouseOwnership.objects.get(house_id=house_id, user_id=seller_id)
        seller_ownership.shares -= shares
        if seller_ownership.shares <= 0:
            seller_ownership.delete()
        else:
            seller_ownership.save()


def payment_cancel(request):
    return redirect('/?payment=cancelled')


@login_required
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
        return redirect('/?payment=error')