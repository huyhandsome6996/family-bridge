"""Test-only user app for the feature-lab harness.

Mirrors backend/accounts.User shape (AbstractUser + UUID pk) so feature
migrations that reference settings.AUTH_USER_MODEL serialize portably.
This app is NOT production: it provides no login endpoint and no
authentication bypass; it exists only to satisfy AUTH_USER_MODEL in tests.
"""

import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
