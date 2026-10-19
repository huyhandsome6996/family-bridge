"""QA 2026-10-19 R02 — bind FamilyAgreement identity to the program pin.

The unique constraint gains program_revision: (pair, program_key,
program_revision, agreement_revision, connection_generation). A cloned
program revision that keeps the same agreement template revision is still
a distinct snapshot the pair confirms on the program version THEY chose;
the row pinned to the old program revision stays in history (superseded /
withdrawn / confirmed as it was) and is never reused for the new pin.

Data plan (no data loss): existing rows already carry program_revision;
this migration only drops the old constraint and adds the wider one. No
row is rewritten, deleted or re-signed; confirmed agreements stay
confirmed. Production had zero agreement rows at the time of writing, but
the migration is written to be safely replayable on any existing data.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('f02_program', '0002_familyagreement_and_more'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='familyagreement',
            name='uniq_f02_agreement_pair_revision_generation',
        ),
        migrations.AddConstraint(
            model_name='familyagreement',
            constraint=models.UniqueConstraint(
                fields=('party_low_id', 'party_high_id', 'program_key',
                        'program_revision', 'agreement_revision',
                        'connection_generation'),
                name='uniq_f02_agreement_pair_rev_pin_generation'),
        ),
    ]
