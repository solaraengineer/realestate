import os

from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "settings.settings")

django_asgi_app = get_asgi_application()

# import routing z appki logic (utworzymy ten plik za chwilę)
import logic.routing

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": AuthMiddlewareStack(
            URLRouter(
                logic.routing.websocket_urlpatterns
            )
        ),
    }
)
