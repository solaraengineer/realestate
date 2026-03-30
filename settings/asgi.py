import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "settings.settings")

from django.core.asgi import get_asgi_application
django_asgi_app = get_asgi_application()

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.instrumentation.django import DjangoInstrumentor
from opentelemetry.instrumentation.redis import RedisInstrumentor
from opentelemetry.instrumentation.psycopg2 import Psycopg2Instrumentor
from opentelemetry.instrumentation.celery import CeleryInstrumentor

resource = Resource.create({"service.name": os.environ.get("OTEL_SERVICE_NAME", "homiverse-web")})
provider = TracerProvider(resource=resource)
exporter = OTLPSpanExporter(endpoint=os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "http://otel-collector:4317"), insecure=True)
provider.add_span_processor(BatchSpanProcessor(exporter))
trace.set_tracer_provider(provider)

DjangoInstrumentor().instrument()
RedisInstrumentor().instrument()
Psycopg2Instrumentor().instrument()
CeleryInstrumentor().instrument()

from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
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