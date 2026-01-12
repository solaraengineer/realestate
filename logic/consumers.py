# logic/consumers.py - WebSocket Chat Consumer
import logging
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model

from .models import Message, Friend

User = get_user_model()
logger = logging.getLogger(__name__)


class DirectChatConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket consumer for real-time direct messages.
    Uses the simplified Message and Friend models.
    """

    async def connect(self):
        self.user = self.scope.get("user")
        if not self.user or self.user.is_anonymous:
            await self.close(code=4001)  # Custom code for auth failure
            return

        self.group = f"user_{self.user.id}"
        await self.channel_layer.group_add(self.group, self.channel_name)

        await self.accept()

        await self.send_json({
            "type": "connection.ack",
            "user_id": self.user.id,
            "username": self.user.username
        })

    async def disconnect(self, code):
        if hasattr(self, "group"):
            try:
                await self.channel_layer.group_discard(self.group, self.channel_name)
            except Exception as e:
                logger.warning(f"Error discarding from group: {e}")

    async def receive_json(self, content, **kwargs):
        msg_type = content.get("type")

        if msg_type == "message.send":
            await self._send_message(content)
        elif msg_type == "ping":
            await self.send_json({"type": "pong"})
        else:
            await self.send_json({"type": "error", "error": "UNKNOWN_TYPE"})

    async def _send_message(self, content):
        to_id = content.get("to")
        text = (content.get("text") or content.get("content") or "").strip()

        if not to_id or not text:
            return await self.send_json({
                "type": "message.error",
                "error": "MISSING_TO_OR_TEXT"
            })

        try:
            to_id = int(to_id)
        except (TypeError, ValueError):
            return await self.send_json({
                "type": "message.error",
                "error": "BAD_TO_ID"
            })

        result = await self._create_message(self.user.id, to_id, text)

        if "error" in result:
            return await self.send_json({
                "type": "message.error",
                "error": result["error"]
            })

        msg_data = result["message"]
        payload = {
            "id": msg_data["id"],
            "sender_id": msg_data["sender_id"],
            "sender_name": msg_data["sender_name"],
            "receiver_id": msg_data["receiver_id"],
            "receiver_name": msg_data["receiver_name"],
            "content": msg_data["content"],
            "time": msg_data["time"],
        }

        # Send to receiver's group
        try:
            await self.channel_layer.group_send(
                f"user_{msg_data['receiver_id']}",
                {"type": "chat.message", "message": payload}
            )
        except Exception as e:
            logger.warning(f"Error sending to receiver: {e}")

    @database_sync_to_async
    def _create_message(self, from_id, to_id, text):
        try:
            sender = User.objects.get(id=from_id)
            receiver = User.objects.get(id=to_id)
        except User.DoesNotExist:
            return {"error": "USER_NOT_FOUND"}

        if sender.id == receiver.id:
            return {"error": "CANNOT_MESSAGE_SELF"}

        # Check if blocked (using Friend model with status='blocked')
        if Friend.objects.filter(user=receiver, friend=sender, status='blocked').exists():
            return {"error": "BLOCKED_BY_USER"}

        # Create and save the message
        msg = Message.objects.create(
            sender=sender,
            receiver=receiver,
            content=text
        )

        # Return serializable data instead of model object
        return {
            "message": {
                "id": msg.id,
                "sender_id": msg.sender_id,
                "sender_name": sender.username,
                "receiver_id": msg.receiver_id,
                "receiver_name": receiver.username,
                "content": msg.content,
                "time": msg.created_at.isoformat(),
            }
        }

    async def chat_message(self, event):
        """Handler for messages sent via channel layer"""
        await self.send_json({
            "type": "message.new",
            "message": event["message"]
        })
