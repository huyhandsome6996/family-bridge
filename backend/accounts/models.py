import uuid
from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Stable internal identity, independent of any frontend or auth provider.

    Zalo verification, identity bindings and role grants belong to US-011/012.
    No public registration or token issuance endpoint is installed yet.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
