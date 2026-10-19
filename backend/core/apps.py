from django.apps import AppConfig


class CoreConfig(AppConfig):
    name = "core"

    def ready(self):
        from core.wiring import wire_backend_ports
        wire_backend_ports()
