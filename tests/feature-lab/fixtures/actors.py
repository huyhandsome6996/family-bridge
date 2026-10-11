"""Synthetic actor fixtures (test data only — never real users).

Actors: S (student), C (caregiver), B (backup supporter), ST (staff),
SYS (System Administrator), plus helper to build active connections.
Roles here are plain business flags for tests; the production RBAC owner is
B16 and never derived from these fixtures.
"""

import uuid

from django.contrib.auth import get_user_model


def make_user(prefix: str = "actor") -> object:
    User = get_user_model()
    suffix = uuid.uuid4().hex[:10]
    return User.objects.create_user(
        username=f"{prefix}_{suffix}", password="x-test-only-" + suffix,
        first_name=prefix.capitalize(),
    )


def make_student() -> object:
    return make_user("student")


def make_caregiver() -> object:
    return make_user("caregiver")


def make_staff() -> object:
    user = make_user("staff")
    user.is_staff = True  # technical flag only; never a data-access grant
    user.save(update_fields=["is_staff"])
    return user


def make_system_admin() -> object:
    user = make_user("sysadmin")
    user.is_staff = True
    user.is_superuser = True  # technical flag; NEVER bypasses business ACL
    user.save(update_fields=["is_staff", "is_superuser"])
    return user


def canonical_pair(user_a: str, user_b: str) -> tuple:
    return (user_a, user_b) if str(user_a) < str(user_b) else (user_b, user_a)


class ActiveConnectionFactory:
    """Builds active Connection rows for the feature under test.

    Features own their Connection model only after F01 lands; before that
    tests construct the row via the feature under test's own model. This
    helper resolves the model lazily so the harness stays decoupled.
    """

    @staticmethod
    def connection_model():
        try:
            from family_bridge_features.f01_identity.models import Connection
            return Connection
        except ImportError as exc:
            raise RuntimeError(
                "Connection model unavailable: run with FB_FEATURES=f01_identity "
                "or provide a test double for the ConnectionReader port."
            ) from exc

    @classmethod
    def create_active(cls, party_a, party_b, relationship_kind: str = "primary",
                      generation: int = 1):
        low, high = canonical_pair(str(party_a.pk if hasattr(party_a, "pk") else party_a),
                                   str(party_b.pk if hasattr(party_b, "pk") else party_b))
        Connection = cls.connection_model()
        return Connection.objects.create(
            party_low_id=low, party_high_id=high,
            relationship_kind=relationship_kind,
            status="active", generation=generation, revision=1,
        )
