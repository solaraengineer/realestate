# logic/routing.py
from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    # jedno połączenie per zalogowany user
    re_path(r"^ws/chat/$", consumers.DirectChatConsumer.as_asgi()),
]
