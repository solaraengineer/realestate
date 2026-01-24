from django.contrib.auth.models import AbstractUser
from django.db import models
from django.conf import settings
import uuid


class User(AbstractUser):
    username = models.CharField(max_length=150, unique=True)
    email = models.EmailField(max_length=150, unique=True)
    password = models.CharField(max_length=255, null=False, blank=False)
    referral_email = models.CharField(max_length=255, null=True, blank=True)
    address = models.CharField(max_length=255, null=True, blank=True)
    city = models.CharField(max_length=100, null=True, blank=True)
    postal_code = models.CharField(max_length=20, null=True, blank=True)
    country = models.CharField(max_length=100, null=True, blank=True)
    company_name = models.CharField(max_length=255, null=True, blank=True)
    vat_number = models.CharField(max_length=50, null=True, blank=True)
    code = models.CharField(max_length=6, null=True, blank=True)
    vat = models.CharField(max_length=15, null=True, blank=True)
    stripe_account_id = models.CharField(max_length=255, null=True, blank=True)
    stripe_kyc = models.BooleanField(default=False)
    user_range = models.IntegerField(default=1, db_index=True)
    two_factor_enabled = models.BooleanField(default=False)


HOUSE_STATUS = [
    ('free', 'free'),
    ('for_sale', 'for_sale'),
    ('sold', 'sold'),
    ('fractional', 'fractional'),
]


class House(models.Model):
    address_id = models.UUIDField(null=True, blank=True)
    attrs = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    id_fme = models.TextField(primary_key=True)
    fme_levels = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    fme_height = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    lat = models.FloatField(null=True, blank=True)
    lon = models.FloatField(null=True, blank=True)
    h3_id = models.TextField(null=True, blank=True)
    h3_res = models.SmallIntegerField(null=True, blank=True)
    name = models.TextField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=HOUSE_STATUS, default='free')
    total_shares = models.IntegerField(default=1)


LISTING_STATUS = [
    ('active', 'active'),
    ('pending', 'pending'),
    ('cancelled', 'cancelled'),
]

class Listing(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    house = models.ForeignKey(
        House,
        on_delete=models.CASCADE,
        related_name='listings'
    )
    seller = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='listings'
    )
    price = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=10, default='PLN')
    share_count = models.IntegerField(default=1)
    left_shares = models.IntegerField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=LISTING_STATUS, default='active')
    valid_from = models.DateTimeField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)


class HouseOwnership(models.Model):
    house = models.ForeignKey(
        House,
        on_delete=models.CASCADE,
        db_constraint=False,
        related_name='ownerships',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='house_ownerships',
    )
    shares = models.IntegerField(default=0)
    bought_for = models.IntegerField(null=True, blank=True)

    class Meta:
        unique_together = [('house', 'user')]


class Message(models.Model):
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='messages_sent',
    )
    receiver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='messages_received',
    )
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)


FRIEND_STATUS = [
    ('pending', 'pending'),
    ('accepted', 'accepted'),
    ('blocked', 'blocked'),
]


class Friend(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='friend_requests_sent',
    )
    friend = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='friend_requests_received',
    )
    status = models.CharField(max_length=20, choices=FRIEND_STATUS, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('user', 'friend')]


class Viewpoint(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='viewpoints',
    )
    name = models.CharField(max_length=255)
    lat = models.FloatField()
    lon = models.FloatField()
    height = models.FloatField(null=True, blank=True)
    heading = models.FloatField(default=0)
    pitch = models.FloatField(default=-0.5)
    roll = models.FloatField(default=0)
    pos_x = models.FloatField(null=True, blank=True)
    pos_y = models.FloatField(null=True, blank=True)
    pos_z = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class Observation(models.Model):
    """Saved house observations/watchlist for users."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='observations',
    )
    house = models.ForeignKey(
        House,
        on_delete=models.CASCADE,
        related_name='observations',
    )
    note = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = [('user', 'house')]


TRANSACTION_STATUS = [
    ('pending', 'pending'),
    ('completed', 'completed'),
    ('failed', 'failed'),
    ('refunded', 'refunded'),
]


class Transaction(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    stripe_session_id = models.CharField(max_length=255, unique=True, db_index=True)
    stripe_payment_intent = models.CharField(max_length=255, null=True, blank=True)
    listing = models.ForeignKey(
        Listing,
        on_delete=models.SET_NULL,
        null=True,
        related_name='transactions',
    )
    house = models.ForeignKey(
        House,
        on_delete=models.SET_NULL,
        null=True,
        related_name='transactions',
    )
    buyer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='purchases',
    )
    seller = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='sales',
    )
    shares = models.IntegerField(default=1)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=10, default='PLN')
    platform_fee = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=TRANSACTION_STATUS, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
