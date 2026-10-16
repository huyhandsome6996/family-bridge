"""F09 activities app config — production wiring at startup (apps.ready())."""

from django.apps import AppConfig


class F09ActivitiesConfig(AppConfig):
    name = "family_bridge_features.f09_activities"
    label = "f09_activities"
    verbose_name = "F09 Hoat dong va bai hoc ngan"

    def ready(self):
        from .services import registry
        from .wiring import F01ConnectionReader, PublishedContentActivityReader

        if registry.get_content_reader() is None:
            registry.register_content_reader(PublishedContentActivityReader())
        if registry.get_connection_reader() is None:
            registry.register_connection_reader(F01ConnectionReader())
