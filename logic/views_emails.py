from celery import shared_task
from django.core.mail import EmailMultiAlternatives
from django.conf import settings
from django.utils import timezone


def get_base_styles():
    """Common styles for all emails."""
    return """
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #0a0e17; color: #e4e7ec; }
        .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
        .card { background: linear-gradient(145deg, #0f1729 0%, #0a0e17 100%); border: 1px solid #1e2a42; border-radius: 16px; padding: 32px; }
        .logo { text-align: center; margin-bottom: 24px; }
        .logo-text { font-size: 24px; font-weight: 700; color: #00d9ff; letter-spacing: -0.5px; }
        h1 { font-size: 22px; font-weight: 600; color: #ffffff; margin: 0 0 16px 0; }
        p { font-size: 15px; line-height: 1.6; color: #a0aec0; margin: 0 0 16px 0; }
        .highlight { color: #00d9ff; font-weight: 600; }
        .info-box { background: #0d1220; border: 1px solid #1e2a42; border-radius: 12px; padding: 20px; margin: 20px 0; }
        .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #1e2a42; }
        .info-row:last-child { border-bottom: none; }
        .info-label { color: #6b7280; font-size: 13px; }
        .info-value { color: #ffffff; font-size: 14px; font-weight: 500; }
        .btn { display: inline-block; background: linear-gradient(135deg, #00d9ff 0%, #00b8d9 100%); color: #000000; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; margin-top: 16px; }
        .footer { text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #1e2a42; }
        .footer p { font-size: 12px; color: #6b7280; margin: 4px 0; }
        .success-badge { display: inline-block; background: #065f46; color: #34d399; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 8px 0; }
        .label-td { color: #6b7280; font-size: 13px; width: 40%; }
        .value-td { color: #ffffff; font-size: 14px; font-weight: 500; text-align: right; }
    """


def welcome_email_html(username, email, created_at):
    """Generate HTML for welcome email."""
    styles = get_base_styles()
    formatted_date = created_at.strftime('%d %B %Y, %H:%M UTC')

    return f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to CryptoEarthCoin</title>
        <style>{styles}</style>
    </head>
    <body>
        <div class="container">
            <div class="card">
                <div class="logo">
                    <span class="logo-text">CryptoEarthCoin</span>
                </div>

                <h1>Welcome to CryptoEarthCoin!</h1>

                <p>Hi <span class="highlight">{username}</span>,</p>

                <p>Thank you for joining CryptoEarthCoin - the future of real estate investment on the blockchain. Your account has been successfully created.</p>

                <div class="info-box">
                    <table>
                        <tr>
                            <td class="label-td">Username</td>
                            <td class="value-td">{username}</td>
                        </tr>
                        <tr>
                            <td class="label-td">Email</td>
                            <td class="value-td">{email}</td>
                        </tr>
                        <tr>
                            <td class="label-td">Account Created</td>
                            <td class="value-td">{formatted_date}</td>
                        </tr>
                    </table>
                </div>

                <p>To start buying and selling property shares, you'll need to complete Stripe verification. This ensures secure transactions for all users.</p>

                <a href="https://cryptoearthcoin.com" class="btn">Go to Dashboard</a>

                <div class="footer">
                    <p>CryptoEarthCoin - Real Estate on the Blockchain</p>
                    <p>If you didn't create this account, please ignore this email.</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    """


def welcome_email_text(username, email, created_at):
    """Generate plain text for welcome email."""
    formatted_date = created_at.strftime('%d %B %Y, %H:%M UTC')

    return f"""
Welcome to CryptoEarthCoin!

Hi {username},

Thank you for joining CryptoEarthCoin - the future of real estate investment on the blockchain. Your account has been successfully created.

Account Details:
- Username: {username}
- Email: {email}
- Account Created: {formatted_date}

To start buying and selling property shares, you'll need to complete Stripe verification.

Visit: https://cryptoearthcoin.com

---
CryptoEarthCoin - Real Estate on the Blockchain
If you didn't create this account, please ignore this email.
    """


def transaction_email_html(transaction_id, house_name, shares, amount, currency, seller_username, buyer_username, completed_at):
    """Generate HTML for transaction confirmation email."""
    styles = get_base_styles()
    formatted_date = completed_at.strftime('%d %B %Y, %H:%M UTC')
    formatted_amount = f"{amount:,.2f} {currency}"

    return f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Transaction Confirmed</title>
        <style>{styles}</style>
    </head>
    <body>
        <div class="container">
            <div class="card">
                <div class="logo">
                    <span class="logo-text">CryptoEarthCoin</span>
                </div>

                <div style="text-align: center; margin-bottom: 24px;">
                    <span class="success-badge">PAYMENT SUCCESSFUL</span>
                </div>

                <h1>Transaction Confirmed</h1>

                <p>Your purchase has been completed successfully. Here are the details:</p>

                <div class="info-box">
                    <table>
                        <tr>
                            <td class="label-td">Transaction ID</td>
                            <td class="value-td" style="font-family: monospace; font-size: 12px;">{transaction_id}</td>
                        </tr>
                        <tr>
                            <td class="label-td">Property</td>
                            <td class="value-td">{house_name}</td>
                        </tr>
                        <tr>
                            <td class="label-td">Shares Purchased</td>
                            <td class="value-td"><span class="highlight">{shares}</span></td>
                        </tr>
                        <tr>
                            <td class="label-td">Amount Paid</td>
                            <td class="value-td"><span class="highlight">{formatted_amount}</span></td>
                        </tr>
                        <tr>
                            <td class="label-td">Seller</td>
                            <td class="value-td">{seller_username}</td>
                        </tr>
                        <tr>
                            <td class="label-td">Date</td>
                            <td class="value-td">{formatted_date}</td>
                        </tr>
                    </table>
                </div>

                <p>Your shares have been added to your portfolio. You can view your holdings in the dashboard.</p>

                <a href="https://cryptoearthcoin.com" class="btn">View Portfolio</a>

                <div class="footer">
                    <p>CryptoEarthCoin - Real Estate on the Blockchain</p>
                    <p>This is an automated confirmation. Please keep this for your records.</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    """


def transaction_email_text(transaction_id, house_name, shares, amount, currency, seller_username, buyer_username, completed_at):
    """Generate plain text for transaction confirmation email."""
    formatted_date = completed_at.strftime('%d %B %Y, %H:%M UTC')
    formatted_amount = f"{amount:,.2f} {currency}"

    return f"""
Transaction Confirmed - CryptoEarthCoin

Your purchase has been completed successfully!

Transaction Details:
- Transaction ID: {transaction_id}
- Property: {house_name}
- Shares Purchased: {shares}
- Amount Paid: {formatted_amount}
- Seller: {seller_username}
- Date: {formatted_date}

Your shares have been added to your portfolio.

View your portfolio at: https://cryptoearthcoin.com

---
CryptoEarthCoin - Real Estate on the Blockchain
This is an automated confirmation. Please keep this for your records.
    """


def sale_notification_email_html(transaction_id, house_name, shares, amount, currency, buyer_username, completed_at):
    """Generate HTML for sale notification email (sent to seller)."""
    styles = get_base_styles()
    formatted_date = completed_at.strftime('%d %B %Y, %H:%M UTC')
    formatted_amount = f"{amount:,.2f} {currency}"

    return f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>You Made a Sale!</title>
        <style>{styles}</style>
    </head>
    <body>
        <div class="container">
            <div class="card">
                <div class="logo">
                    <span class="logo-text">CryptoEarthCoin</span>
                </div>

                <div style="text-align: center; margin-bottom: 24px;">
                    <span class="success-badge">SALE COMPLETED</span>
                </div>

                <h1>You Made a Sale!</h1>

                <p>Congratulations! Someone purchased shares from your listing.</p>

                <div class="info-box">
                    <table>
                        <tr>
                            <td class="label-td">Transaction ID</td>
                            <td class="value-td" style="font-family: monospace; font-size: 12px;">{transaction_id}</td>
                        </tr>
                        <tr>
                            <td class="label-td">Property</td>
                            <td class="value-td">{house_name}</td>
                        </tr>
                        <tr>
                            <td class="label-td">Shares Sold</td>
                            <td class="value-td"><span class="highlight">{shares}</span></td>
                        </tr>
                        <tr>
                            <td class="label-td">Amount Received</td>
                            <td class="value-td"><span class="highlight">{formatted_amount}</span></td>
                        </tr>
                        <tr>
                            <td class="label-td">Buyer</td>
                            <td class="value-td">{buyer_username}</td>
                        </tr>
                        <tr>
                            <td class="label-td">Date</td>
                            <td class="value-td">{formatted_date}</td>
                        </tr>
                    </table>
                </div>

                <p>The payment will be transferred to your Stripe account shortly (minus platform fees).</p>

                <a href="https://cryptoearthcoin.com" class="btn">View Transactions</a>

                <div class="footer">
                    <p>CryptoEarthCoin - Real Estate on the Blockchain</p>
                    <p>This is an automated notification.</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    """


def sale_notification_email_text(transaction_id, house_name, shares, amount, currency, buyer_username, completed_at):
    """Generate plain text for sale notification email."""
    formatted_date = completed_at.strftime('%d %B %Y, %H:%M UTC')
    formatted_amount = f"{amount:,.2f} {currency}"

    return f"""
You Made a Sale! - CryptoEarthCoin

Congratulations! Someone purchased shares from your listing.

Sale Details:
- Transaction ID: {transaction_id}
- Property: {house_name}
- Shares Sold: {shares}
- Amount Received: {formatted_amount}
- Buyer: {buyer_username}
- Date: {formatted_date}

The payment will be transferred to your Stripe account shortly (minus platform fees).

View your transactions at: https://cryptoearthcoin.com

---
CryptoEarthCoin - Real Estate on the Blockchain
This is an automated notification.
    """


@shared_task(bind=True, max_retries=5, default_retry_delay=60)
def send_welcome_email(self, user_id):
    """
    Send welcome email to newly registered user.
    Called asynchronously after successful registration.
    Retries with exponential backoff: 60s, 120s, 240s, 480s, 960s
    """
    from logic.models import User

    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return {'status': 'error', 'message': 'User not found'}

    try:
        subject = 'Welcome to CryptoEarthCoin!'
        text_content = welcome_email_text(
            username=user.username,
            email=user.email,
            created_at=user.date_joined
        )
        html_content = welcome_email_html(
            username=user.username,
            email=user.email,
            created_at=user.date_joined
        )

        msg = EmailMultiAlternatives(
            subject=subject,
            body=text_content,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[user.email]
        )
        msg.attach_alternative(html_content, "text/html")
        msg.send(fail_silently=False)

        return {'status': 'sent', 'email': user.email}

    except Exception as exc:
        # Exponential backoff: 60 * 2^retry_count
        countdown = 60 * (2 ** self.request.retries)
        raise self.retry(exc=exc, countdown=countdown)


@shared_task(bind=True, max_retries=10, default_retry_delay=30)
def send_transaction_buyer_email(self, transaction_id):
    """
    Send transaction confirmation email to BUYER.
    Critical email - retries up to 10 times with exponential backoff.
    Backoff: 30s, 60s, 120s, 240s, 480s, 960s, 1920s, 3840s, 7680s, 15360s (~4hrs total)
    """
    from logic.models import Transaction

    try:
        tx = Transaction.objects.select_related('buyer', 'seller', 'house').get(id=transaction_id)
    except Transaction.DoesNotExist:
        return {'status': 'error', 'message': 'Transaction not found'}

    try:
        subject = f'Transaction Confirmed - {tx.house.name or "Property"}'
        text_content = transaction_email_text(
            transaction_id=str(tx.id),
            house_name=tx.house.name or 'Property',
            shares=tx.shares,
            amount=float(tx.amount),
            currency=tx.currency,
            seller_username=tx.seller.username,
            buyer_username=tx.buyer.username,
            completed_at=tx.completed_at or timezone.now()
        )
        html_content = transaction_email_html(
            transaction_id=str(tx.id),
            house_name=tx.house.name or 'Property',
            shares=tx.shares,
            amount=float(tx.amount),
            currency=tx.currency,
            seller_username=tx.seller.username,
            buyer_username=tx.buyer.username,
            completed_at=tx.completed_at or timezone.now()
        )

        msg = EmailMultiAlternatives(
            subject=subject,
            body=text_content,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[tx.buyer.email]
        )
        msg.attach_alternative(html_content, "text/html")
        msg.send(fail_silently=False)

        return {'status': 'sent', 'recipient': 'buyer', 'email': tx.buyer.email, 'transaction_id': str(tx.id)}

    except Exception as exc:
        # Exponential backoff: 30 * 2^retry_count
        countdown = 30 * (2 ** self.request.retries)
        raise self.retry(exc=exc, countdown=countdown)


@shared_task(bind=True, max_retries=10, default_retry_delay=30)
def send_transaction_seller_email(self, transaction_id):
    """
    Send sale notification email to SELLER.
    Critical email - retries up to 10 times with exponential backoff.
    Backoff: 30s, 60s, 120s, 240s, 480s, 960s, 1920s, 3840s, 7680s, 15360s (~4hrs total)
    """
    from logic.models import Transaction

    try:
        tx = Transaction.objects.select_related('buyer', 'seller', 'house').get(id=transaction_id)
    except Transaction.DoesNotExist:
        return {'status': 'error', 'message': 'Transaction not found'}

    try:
        subject = f'You Made a Sale! - {tx.house.name or "Property"}'
        text_content = sale_notification_email_text(
            transaction_id=str(tx.id),
            house_name=tx.house.name or 'Property',
            shares=tx.shares,
            amount=float(tx.amount),
            currency=tx.currency,
            buyer_username=tx.buyer.username,
            completed_at=tx.completed_at or timezone.now()
        )
        html_content = sale_notification_email_html(
            transaction_id=str(tx.id),
            house_name=tx.house.name or 'Property',
            shares=tx.shares,
            amount=float(tx.amount),
            currency=tx.currency,
            buyer_username=tx.buyer.username,
            completed_at=tx.completed_at or timezone.now()
        )

        msg = EmailMultiAlternatives(
            subject=subject,
            body=text_content,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[tx.seller.email]
        )
        msg.attach_alternative(html_content, "text/html")
        msg.send(fail_silently=False)

        return {'status': 'sent', 'recipient': 'seller', 'email': tx.seller.email, 'transaction_id': str(tx.id)}

    except Exception as exc:
        # Exponential backoff: 30 * 2^retry_count
        countdown = 30 * (2 ** self.request.retries)
        raise self.retry(exc=exc, countdown=countdown)


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def send_transaction_email(self, transaction_id):
    """
    Send transaction confirmation emails to both buyer and seller.
    Retries up to 3 times with exponential backoff: 30s, 60s, 120s
    After 3 failures, gives up silently.
    """
    from logic.models import Transaction

    try:
        tx = Transaction.objects.select_related('buyer', 'seller', 'house').get(id=transaction_id)
    except Transaction.DoesNotExist:
        return {'status': 'error', 'message': 'Transaction not found'}

    errors = []

    # Send to buyer
    try:
        buyer_subject = f'Transaction Confirmed - {tx.house.name or "Property"}'
        buyer_text = transaction_email_text(
            transaction_id=str(tx.id),
            house_name=tx.house.name or 'Property',
            shares=tx.shares,
            amount=float(tx.amount),
            currency=tx.currency,
            seller_username=tx.seller.username,
            buyer_username=tx.buyer.username,
            completed_at=tx.completed_at or timezone.now()
        )
        buyer_html = transaction_email_html(
            transaction_id=str(tx.id),
            house_name=tx.house.name or 'Property',
            shares=tx.shares,
            amount=float(tx.amount),
            currency=tx.currency,
            seller_username=tx.seller.username,
            buyer_username=tx.buyer.username,
            completed_at=tx.completed_at or timezone.now()
        )

        buyer_msg = EmailMultiAlternatives(
            subject=buyer_subject,
            body=buyer_text,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[tx.buyer.email]
        )
        buyer_msg.attach_alternative(buyer_html, "text/html")
        buyer_msg.send(fail_silently=False)
    except Exception as e:
        errors.append(('buyer', str(e)))

    # Send to seller
    try:
        seller_subject = f'You Made a Sale! - {tx.house.name or "Property"}'
        seller_text = sale_notification_email_text(
            transaction_id=str(tx.id),
            house_name=tx.house.name or 'Property',
            shares=tx.shares,
            amount=float(tx.amount),
            currency=tx.currency,
            buyer_username=tx.buyer.username,
            completed_at=tx.completed_at or timezone.now()
        )
        seller_html = sale_notification_email_html(
            transaction_id=str(tx.id),
            house_name=tx.house.name or 'Property',
            shares=tx.shares,
            amount=float(tx.amount),
            currency=tx.currency,
            buyer_username=tx.buyer.username,
            completed_at=tx.completed_at or timezone.now()
        )

        seller_msg = EmailMultiAlternatives(
            subject=seller_subject,
            body=seller_text,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[tx.seller.email]
        )
        seller_msg.attach_alternative(seller_html, "text/html")
        seller_msg.send(fail_silently=False)
    except Exception as e:
        errors.append(('seller', str(e)))

    # If any errors, retry with exponential backoff
    if errors:
        countdown = 30 * (2 ** self.request.retries)
        try:
            raise self.retry(exc=Exception(f"Email errors: {errors}"), countdown=countdown)
        except self.MaxRetriesExceededError:
            # After 3 retries, give up silently
            return {'status': 'failed', 'transaction_id': str(transaction_id), 'errors': errors}

    return {'status': 'sent', 'transaction_id': str(transaction_id)}
