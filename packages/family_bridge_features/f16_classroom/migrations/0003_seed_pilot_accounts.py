"""Retain the migration graph without provisioning participant data at boot.

The original automatic seed collided with existing login_code values on
production and could reset lockouts, introduce a shared password, or revive
revoked pairs. Provisioning belongs to the explicit classroom management
command/admin capability, never an application deploy. Already-applied
installations keep their data; this migration does not undo previous writes.
No --fake or database history manipulation is involved.
"""
from django.conf import settings
from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("f16_classroom", "0002_admin_pairs_f16"),
        ("f01_identity", "0003_connection_admin_provenance"),
    ]

    # Deliberately retire the unsafe data operation. All required schema is
    # supplied by the dependencies above; accounts are provisioned explicitly.
    operations = []
