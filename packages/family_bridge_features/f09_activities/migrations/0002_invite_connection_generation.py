"""QA 2026-10-19 R03 — pin SharedActivityInvite to its connection
generation.

The nullable connection_generation column records which connection
generation the invite was created under (null only for legacy rows).
respond/own-response guards use it so unlink blocks accept and a NEW
generation after reconnect never revives an old invite; re-inviting on
the current generation cancels the stale pending row (history kept) and
creates a fresh one.

Data plan (no data loss): additive nullable column only — no row is
rewritten, deleted or re-statused by this migration.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('f09_activities', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='sharedactivityinvite',
            name='connection_generation',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
    ]
