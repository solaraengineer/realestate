# logic/consumers.py
import json
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from django.db.models import Q

from .models import DirectChatMessage, Friend, BlockedUser, ChatSettings, SavedChat
from django.utils import timezone
import uuid

User = get_user_model()


class DirectChatConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket dla prostego czatu 1:1.
    """

    async def connect(self):
        user = self.scope.get("user")
        if not user or user.is_anonymous:
            await self.close()
            return

        self.user = user
        self.user_group = f"user_{user.id}"

        await self.channel_layer.group_add(self.user_group, self.channel_name)
        await self.accept()

        await self.send_json({
            "type": "connection.ack",
            "user_id": self.user.id,
            "username": self.user.username,
        })

    async def disconnect(self, code):
        if hasattr(self, "user_group"):
            await self.channel_layer.group_discard(self.user_group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        msg_type = content.get("type")

        if msg_type == "message.send":
            await self._handle_message_send(content)
        else:
            await self.send_json({
                "type": "error",
                "error": "UNKNOWN_TYPE",
            })

    # --- message.send ---

    async def _handle_message_send(self, content):
        """
        {type: "message.send", to: <user_id>, text: "..."}
        """
        to_id = content.get("to")

        raw_text = content.get("text")
        if isinstance(raw_text, str):
            text = raw_text.strip()
        elif raw_text is None:
            text = ""
        else:
            text = str(raw_text).strip()

        if not to_id or not text:
            await self.send_json({
                "type": "message.error",
                "error": "MISSING_TO_OR_TEXT",
            })
            return

        try:
            to_id_int = int(to_id)
        except (TypeError, ValueError):
            await self.send_json({
                "type": "message.error",
                "error": "BAD_TO_ID",
            })
            return

        result = await self._create_message(self.user.id, to_id_int, text)
        if result.get("error"):
            await self.send_json({
                "type": "message.error",
                **result,
            })
            return

        msg = result["message"]
        payload = {
            "id": str(msg.id),
            "sender_id": msg.sender_id,
            "receiver_id": msg.receiver_id,
            "text": msg.text,
            "created_at": msg.created_at.isoformat(),
        }

        # do siebie
        await self.channel_layer.group_send(
            self.user_group,
            {"type": "chat.message", "message": payload},
        )
        # do odbiorcy
        other_group = f"user_{msg.receiver_id}"
        await self.channel_layer.group_send(
            other_group,
            {"type": "chat.message", "message": payload},
        )

    @database_sync_to_async
    def _create_message(self, from_id: int, to_id: int, text: str):
        """
        Tworzy wiadomość 1:1 z uwzględnieniem:
        - blokad (BlockedUser),
        - reject_strangers (ChatSettings),
        - SavedChat (czy zapisywać w DB, czy tylko ulotnie).

        Logika zapisu/ulotności jest spójna z widokiem chat_send.
        """
        try:
            sender = User.objects.get(id=from_id)
            receiver = User.objects.get(id=to_id)
        except User.DoesNotExist:
            return {"error": "USER_NOT_FOUND"}

        if sender.id == receiver.id:
            return {"error": "CANNOT_MESSAGE_SELF"}

        # blokada: jeśli odbiorca zablokował nadawcę
        if BlockedUser.objects.filter(owner=receiver, blocked=sender).exists():
            return {"error": "BLOCKED_BY_USER"}

        # reject_strangers – ustawienie odbiorcy
        try:
            settings_obj = ChatSettings.objects.get(user=receiver)
        except ChatSettings.DoesNotExist:
            settings_obj = None

        if settings_obj and settings_obj.reject_strangers:
            is_friend = Friend.objects.filter(owner=receiver, friend=sender).exists()
            if not is_friend:
                return {"error": "REJECT_STRANGERS"}

        # Czy którakolwiek ze stron ma włączone "save" na tę relację?
        persist = (
            SavedChat.objects.filter(owner=sender, peer=receiver).exists()
            or SavedChat.objects.filter(owner=receiver, peer=sender).exists()
        )

        if persist:
            # normalnie zapisujemy w DB
            msg = DirectChatMessage.objects.create(
                sender=sender,
                receiver=receiver,
                text=text,
            )
        else:
            # wiadomość tylko "ulotna" – nie zapisujemy w DB,
            # ale nadajemy id/timestamp, żeby UI miał spójne dane
            msg = DirectChatMessage(
                sender=sender,
                receiver=receiver,
                text=text,
            )
            msg.id = uuid.uuid4()
            msg.created_at = timezone.now()

        return {"message": msg}

    # --- event z grupy ---

    async def chat_message(self, event):
        """
        Wywoływane przez group_send(..., {"type": "chat.message", "message": ...})
        """
        await self.send_json({
            "type": "message.new",
            "message": event["message"],
        })
