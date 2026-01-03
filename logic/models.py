from django.contrib.auth.models import AbstractUser
from django.db import models
from django.conf import settings
import uuid

# logic/models.py
import uuid
from decimal import Decimal
from django.conf import settings
from django.db import models
from django.db.models import Q 

class Negotiation(models.Model):
    """Stan negocjacji powiązany z rozmową (conv_id) i domkiem (house_id)."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    conversation_id = models.UUIDField(db_index=True, unique=True)
    house_id = models.UUIDField(db_index=True)

    buyer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='neg_as_buyer')
    seller = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='neg_as_seller')

    buyer_price = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    seller_price = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)

    last_offer_by = models.CharField(max_length=8, choices=[('buyer','buyer'),('seller','seller')], null=True, blank=True)
    accepted_by   = models.CharField(max_length=8, choices=[('buyer','buyer'),('seller','seller')], null=True, blank=True)
    agreed_price  = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)

    status = models.CharField(
        max_length=12,
        choices=[('open','open'),('accepted','accepted'),('finalized','finalized'),('stopped','stopped')],
        default='open'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'messages_negotiation'
        indexes = [models.Index(fields=['conversation_id']), models.Index(fields=['house_id'])]

    # --- helpers ---
    def role_for(self, user):
        return 'seller' if user and user.id == self.seller_id else 'buyer'

    @staticmethod
    def opponent(role):
        return 'seller' if role == 'buyer' else 'buyer'

    def last_price(self):
        if self.last_offer_by == 'buyer':
            return self.buyer_price
        if self.last_offer_by == 'seller':
            return self.seller_price
        return None
    
    
# =========================
#  UŻYTKOWNICY I POWIĄZANIA
# =========================

class User(AbstractUser):
    # utrzymuję Twoje nadpisania — choć AbstractUser już to ma,
    # nie zmieniam, by nie ruszać istniejących migracji
    username = models.CharField(max_length=150, unique=True)
    email = models.EmailField(max_length=150, unique=True)
    password = models.CharField(max_length=255, null=False, blank=False)
    referral_email = models.CharField(max_length=255, null=True, blank=True, db_column='referral_email')
    address = models.CharField(max_length=255, null=True, blank=True)
    ai_auto_reply = models.BooleanField(default=False)
    user_range = models.IntegerField(default=1, db_index=True)


class FA(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        db_column='user_id',
        related_name='fa',
        null=False,
        blank=False,
    )
    code = models.CharField(max_length=6, null=False, blank=False)



# =========================
#  ZEWNĘTRZNE MODELE (managed=False)
# =========================

class House(models.Model):
    id = models.UUIDField(primary_key=True, db_column='id')
    address_id = models.UUIDField(db_column='address_id', null=True, blank=True)

    status = models.TextField(db_column='status', null=True, blank=True)
    attrs = models.JSONField(db_column='attrs', null=True, blank=True)

    created_at = models.DateTimeField(db_column='created_at', null=True, blank=True)

    id_fme = models.TextField(db_column='id_fme', null=True, blank=True)
    fme_levels = models.DecimalField(db_column='fme_levels', max_digits=10, decimal_places=2, null=True, blank=True)
    fme_height = models.DecimalField(db_column='fme_height', max_digits=10, decimal_places=2, null=True, blank=True)

    lat = models.FloatField(db_column='lat', null=True, blank=True)
    lon = models.FloatField(db_column='lon', null=True, blank=True)

    h3_id = models.TextField(db_column='h3_id', null=True, blank=True)
    h3_res = models.SmallIntegerField(db_column='h3_res', null=True, blank=True)

    name = models.TextField(db_column='name', null=True, blank=True)  # nazwa budynku

    total_shares = models.IntegerField(db_column='total_shares', default=1)
    max_avail_total_shares = models.IntegerField(db_column='max_avail_total_shares', null=True, blank=True)

    class Meta:
        managed = False
        db_table = '"catalog"."houses"'


class Listing(models.Model):
    id = models.UUIDField(primary_key=True, db_column='id')
    house = models.UUIDField(db_column='house_id')
    seller = models.BigIntegerField(db_column='seller_id')
    price = models.DecimalField(max_digits=12, decimal_places=2, db_column='price')
    currency = models.CharField(max_length=10, db_column='currency', default='USD')
    share_count = models.IntegerField(db_column='share_count', default=1)
    status = models.TextField(db_column='status')
    valid_from = models.DateTimeField(db_column='valid_from', null=True, blank=True)
    valid_to = models.DateTimeField(db_column='valid_to', null=True, blank=True)

    class Meta:
        managed = False
        db_table = '"market"."listings"'

class HouseOwnership(models.Model):
    """
    Ile udziałów ma dany użytkownik w konkretnym domu.
    Dane trzymamy w tabeli catalog.house_ownership, którą przed chwilą stworzyliśmy w SQL.
    """
    house = models.ForeignKey(
        House,
        on_delete=models.CASCADE,
        db_column='house_id',
        db_constraint=False,           # brak FK w bazie (tabela w innym schemacie)
        related_name='ownerships',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        db_column='user_id',
        related_name='house_ownerships',
    )
    shares = models.PositiveIntegerField(db_column='shares')

    class Meta:
        managed = False
        db_table = '"catalog"."house_ownership"'
        constraints = [
            models.UniqueConstraint(
                fields=['house', 'user'],
                name='uq_house_ownership_house_user',
            ),
        ]

    def __str__(self):
        return f'{self.house_id} – {self.user_id}: {self.shares} shares'

class ShareSplitProposal(models.Model):
    """
    Propozycja splitu udziałów dla jednego domu.

    - na raz może być tylko jedna "open" propozycja na dom
    - zapisujemy total_shares z chwili startu (current_total_shares),
      żeby móc walidować, że nikt nie zmienił domu w międzyczasie
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    house = models.ForeignKey(
        House,
        on_delete=models.CASCADE,
        related_name="split_proposals",
        db_constraint=False,
    )
    initiator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="initiated_split_proposals",
    )

    current_total_shares = models.PositiveIntegerField()
    requested_total_shares = models.PositiveIntegerField()

    status = models.CharField(
        max_length=16,
        choices=[
            ("open", "open"),
            ("applied", "applied"),
            ("cancelled", "cancelled"),
        ],
        default="open",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    applied_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = '"ownership"."share_split_proposal"'
        indexes = [
            models.Index(fields=["house", "status"]),
        ]


class ShareSplitVote(models.Model):
    """
    Głos współwłaściciela na daną propozycję splitu.
    Jeden user = maks. jeden głos na propozycję (YES/NO).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    proposal = models.ForeignKey(
        ShareSplitProposal,
        on_delete=models.CASCADE,
        related_name="votes",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
    )

    # True = YES, False = NO
    vote = models.BooleanField()

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = '"ownership"."share_split_vote"'
        unique_together = [("proposal", "user")]

class SplitLimitRequest(models.Model):
    """
    Prośba o podniesienie max_avail_total_shares dla danego domu.

    Na razie będzie automatycznie zatwierdzana (status='approved'),
    ale struktura jest gotowa pod tryb: pending -> approve/reject przez admina.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    house = models.ForeignKey(
        House,
        on_delete=models.CASCADE,
        db_constraint=False,
        related_name="split_limit_requests",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="split_limit_requests",
    )

    requested_max_shares = models.PositiveIntegerField()

    status = models.CharField(
        max_length=16,
        choices=[
            ("pending", "pending"),
            ("approved", "approved"),
            ("rejected", "rejected"),
            ("cancelled", "cancelled"),
        ],
        default="pending",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="split_limit_decisions",
    )

    class Meta:
        db_table = '"ownership"."split_limit_request"'
        indexes = [
            models.Index(fields=["house", "status"]),
        ]

class Trade(models.Model):
    id = models.UUIDField(primary_key=True, db_column='id')
    listing = models.UUIDField(db_column='listing_id')
    buyer = models.BigIntegerField(db_column='buyer_id')
    seller = models.BigIntegerField(db_column='seller_id')

    amount = models.DecimalField(max_digits=12, decimal_places=2, db_column='amount')
    currency = models.CharField(max_length=10, db_column='currency', default='PLN')
    status = models.TextField(db_column='status')
    created_at = models.DateTimeField(db_column='created_at', null=True, blank=True)

    class Meta:
        managed = False
        db_table = '"trade"."trades"'


# =========================
#  MESSAGING (schema: messaging)
# =========================

CONV_STATUS = [
    ('active', 'active'),
    ('agreed', 'agreed'),
    ('sold', 'sold'),
    ('stopped', 'stopped'),
]

MSG_TYPE = [
    ('normal', 'normal'),
    ('text', 'text'),
    ('offer', 'offer'),
    ('counter', 'counter'),   # <- było 'counter_offer'
    ('agreement', 'agreement'),
    ('system', 'system'),
]


class Conversation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # House jest w zewnętrznej schemie (managed=False), więc db_constraint=False
    house = models.ForeignKey('logic.House', on_delete=models.CASCADE, db_constraint=False, related_name='conversations')
    buyer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='conversations_as_buyer')
    seller = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='conversations_as_seller',
                               null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=CONV_STATUS, default='active')  # active|agreed|sold|stopped
    listing_id = models.UUIDField(null=True, blank=True)

    class Meta:
        db_table = '"messaging"."conversation"'
        constraints = [
            # jeden wątek na (house, buyer, seller)
            models.UniqueConstraint(fields=['house', 'buyer', 'seller'], name='uq_conv_house_buyer_seller'),
        ]
        indexes = [
            models.Index(fields=['created_at']),
            models.Index(fields=['house']),
            models.Index(fields=['buyer']),
            models.Index(fields=['seller']),
        ]

    def __str__(self):
        return f'Conv[{self.id}] house={self.house_id} buyer={self.buyer_id} seller={self.seller_id} status={self.status}'


class Message(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    text = models.TextField(blank=True, default='')
    message_type = models.CharField(max_length=20, choices=MSG_TYPE, default='normal')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = '"messaging"."message"'
        indexes = [
            models.Index(fields=['conversation', 'created_at']),
            models.Index(fields=['sender', 'created_at']),
        ]

    def __str__(self):
        short = (self.text or '')[:40].replace('\n', ' ')
        return f'Msg[{self.id}] {self.message_type} by={self.sender_id} "{short}"'


class Offer(models.Model):
    """
    Oferta lub kontroferta w ramach rozmowy.
    - type: 'offer' (kupujący) lub 'counter' (sprzedający)
    - accepted: True, gdy druga strona zaakceptowała kwotę (stan 'agreed')
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='offers')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='offers')
    price = models.DecimalField(max_digits=14, decimal_places=2)
    shares = models.IntegerField(null=True, blank=True)  # ile udziałów dotyczy ta oferta
    type = models.CharField(max_length=16, choices=[('offer', 'offer'), ('counter', 'counter')])
    accepted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = '"messaging"."offer"'
        indexes = [
            models.Index(fields=['conversation', 'created_at']),
        ]

    def __str__(self):
        who = 'buyer' if self.type == 'offer' else 'seller'
        return f'Offer[{self.id}] {self.price} by {who}={self.user_id} conv={self.conversation_id}'


class DirectChatMessage(models.Model):
    """
    Prosty czat 1:1 między dwoma użytkownikami.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="direct_messages_sent",
    )
    receiver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="direct_messages_received",
    )

    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = '"messaging"."direct_chat_message"'
        indexes = [
            models.Index(fields=["sender", "receiver", "created_at"]),
            models.Index(fields=["receiver", "sender", "created_at"]),
        ]

    def __str__(self):
        return f"{self.sender_id} -> {self.receiver_id}: {self.text[:40]}"
    
class Friend(models.Model):
    """
    Prosta lista znajomych (jednokierunkowa):
    - owner: ten, kto ma kogoś na liście znajomych
    - friend: użytkownik dodany jako znajomy
    """
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chat_friends",
    )
    friend = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chat_friends_of",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = '"messaging"."friend"'
        unique_together = [("owner", "friend")]

    def __str__(self):
        return f"{self.owner_id} -> friend {self.friend_id}"


class BlockedUser(models.Model):
    """
    Lista zablokowanych (też jednokierunkowa):
    - owner: ten, kto blokuje
    - blocked: zablokowany użytkownik
    """
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="blocked_users",
    )
    blocked = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="blocked_by",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = '"messaging"."blocked_user"'
        unique_together = [("owner", "blocked")]

    def __str__(self):
        return f"{self.owner_id} blocked {self.blocked_id}"

class ChatSettings(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chat_settings",
    )
    # "Do not receive messages from strangers"
    reject_strangers = models.BooleanField(default=False)

    # Przezroczystość panelu (0.3–1.0)
    panel_opacity = models.FloatField(default=0.9)

    class Meta:
        db_table = '"messaging"."chat_settings"'

    def __str__(self):
        return f"ChatSettings(user_id={self.user_id})"

class SavedChat(models.Model):
    """
    Zapisany czat 1:1:

    - owner: użytkownik, który chce zachować historię rozmowy
    - peer: drugi użytkownik

    Jeśli zapis istnieje, zaczynamy utrwalać nowe wiadomości dla tej pary.
    Historia jest pokazywana tylko ownerowi.
    """
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="saved_chats",
    )
    peer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="saved_by",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = '"messaging"."saved_chat"'
        unique_together = [("owner", "peer")]

    def __str__(self):
        return f"SavedChat(owner={self.owner_id}, peer={self.peer_id})"