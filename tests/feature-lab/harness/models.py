"""Harness-local models for exercising shared helpers in tests."""

import datetime as dt

from django.db import models


class Probe(models.Model):
    """Tiny model to exercise cursor pagination (harness-only)."""
    created_at = models.DateTimeField(default=dt.datetime.now)
    name = models.CharField(max_length=32)

    class Meta:
        app_label = "harness"
