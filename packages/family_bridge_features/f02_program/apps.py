"""F02 program app config — production wiring at startup (apps.ready()).

Registers the B16-backed program provider and the F01 connection reader
exactly once per process. Lab tests may overwrite these ports afterwards
(reset_registries + test doubles) — registering here is idempotent-safe
because the registry stores a single slot.
"""

from django.apps import AppConfig


class F02ProgramConfig(AppConfig):
    name = "family_bridge_features.f02_program"
    label = "f02_program"
    verbose_name = "F02 Dong hanh 4 tuan"

    def ready(self):
        from .services import registry
        from .wiring import F01ConnectionReader, PublishedContentProgramProvider

        if registry.get_program_provider() is None:
            registry.register_program_provider(PublishedContentProgramProvider())
        if registry.get_connection_reader() is None:
            registry.register_connection_reader(F01ConnectionReader())
