import django.db.models
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("f04_ai", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="aisuggestion",
            name="input_revision",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
    ]
