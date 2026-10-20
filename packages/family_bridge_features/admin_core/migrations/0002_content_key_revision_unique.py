"""Additive migration: DB-level idempotency for content lifecycle races.

Invariants preserved:
- clone_draft() always targets revision+1 of the SAME content_key, so
  (content_key, revision) is unique by construction in the existing
  lifecycle; two racing clones/publishes of the same source now fail fast
  at the DB instead of silently forking history (DSA-07: a DB constraint,
  not select_for_update on an empty queryset, is the real guarantee).
- Importers rely on the same constraint: two concurrent imports of one
  bundle cannot create duplicate rows for a key — the loser gets
  IntegrityError, re-reads the winner row, and continues idempotently.

Additive only: no column changes, no data rewrite, no removals. Existing
rows keep working (the lifecycle never produced duplicate
(content_key, revision) pairs; the seed command skips existing keys).
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("admin_core", "0001_initial"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="contentitem",
            constraint=models.UniqueConstraint(
                fields=["content_key", "revision"],
                name="uniq_content_key_revision",
            ),
        ),
    ]
