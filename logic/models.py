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
    code = models.CharField(max_length=6, null=True, blank=True)
    vat = models.CharField(max_length=15, null=True, blank=True)
    stripe_account_id = models.CharField(max_length=255, null=True, blank=True)
    stripe_kyc = models.BooleanField(default=False)
    user_range = models.IntegerField(default=1, db_index=True)




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
    share_count = models.IntegerField(default=1)
    left_shares = models.IntegerField()
    status = models.CharField(max_length=20, choices=LISTING_STATUS, default='active')
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
    shares = models.IntegerField()
    bought_for = models.IntegerField()

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


FRIEND_STATUS = [
    ('pending', 'pending'),
    ('accepted', 'accepted'),
    ('blocked', 'blocked'),
]

class Friend(models.Model):  # singular
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='friend_requests_sent',
        blank=True,
        default=''
    )
    friend = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='friend_requests_received',
        blank=True,
        default=''
    )
    status = models.CharField(max_length=20, choices=FRIEND_STATUS, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('user', 'friend')]