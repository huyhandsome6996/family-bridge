from django.db import migrations


def seed_pilot_data(apps, schema_editor):
    from django.contrib.auth.hashers import make_password
    User = apps.get_model("accounts", "User")
    ClassAccount = apps.get_model("f16_classroom", "ClassAccount")
    CompanionProposal = apps.get_model("f16_classroom", "CompanionProposal")
    Connection = apps.get_model("f01_identity", "Connection")
    LoginAttempt = apps.get_model("f16_classroom", "LoginAttempt")

    # Clear rate limit lockouts
    LoginAttempt.objects.all().delete()

    initial_pwd_hash = make_password("matkhau123")

    for i in range(1, 51):
        hs_code = f"HS{i:03d}"
        ph_code = f"PH{i:03d}"
        hs_ref = f"hs-{i:03d}"
        ph_ref = f"ph-{i:03d}"

        # 1. HS User & Account
        hs_user, _ = User.objects.get_or_create(
            username=f"cls_{hs_ref}",
            defaults={
                "first_name": f"Học sinh {i:02d}",
                "password": initial_pwd_hash,
                "is_active": True,
            }
        )
        if hs_user.password != initial_pwd_hash and not hs_user.password.startswith("pbkdf2_"):
            hs_user.password = initial_pwd_hash
            hs_user.save(update_fields=["password"])

        hs_account, _ = ClassAccount.objects.get_or_create(
            external_ref=hs_ref,
            defaults={
                "user_id": hs_user.pk,
                "login_code": hs_code,
                "role": "student",
                "class_ref": "10A1",
            }
        )
        if hs_account.login_code != hs_code or str(hs_account.user_id) != str(hs_user.pk):
            hs_account.login_code = hs_code
            hs_account.user_id = hs_user.pk
            hs_account.save(update_fields=["login_code", "user"])

        # 2. PH User & Account
        ph_user, _ = User.objects.get_or_create(
            username=f"cls_{ph_ref}",
            defaults={
                "first_name": f"Phụ huynh {i:02d}",
                "password": initial_pwd_hash,
                "is_active": True,
            }
        )
        if ph_user.password != initial_pwd_hash and not ph_user.password.startswith("pbkdf2_"):
            ph_user.password = initial_pwd_hash
            ph_user.save(update_fields=["password"])

        ph_account, _ = ClassAccount.objects.get_or_create(
            external_ref=ph_ref,
            defaults={
                "user_id": ph_user.pk,
                "login_code": ph_code,
                "role": "caregiver",
                "class_ref": "10A1",
            }
        )
        if ph_account.login_code != ph_code or str(ph_account.user_id) != str(ph_user.pk):
            ph_account.login_code = ph_code
            ph_account.user_id = ph_user.pk
            ph_account.save(update_fields=["login_code", "user"])

        # 3. CompanionProposal
        CompanionProposal.objects.get_or_create(
            student_account_id=hs_account.pk,
            caregiver_account_id=ph_account.pk,
            defaults={"status": "connected"}
        )

        # 4. Connection (bilateral active)
        low_id, high_id = sorted([str(hs_user.pk), str(ph_user.pk)])
        conn = Connection.objects.filter(
            party_low_id=low_id, party_high_id=high_id, status="active"
        ).first()
        if not conn:
            Connection.objects.create(
                party_low_id=low_id,
                party_high_id=high_id,
                relationship_kind="parent_child",
                status="active",
                source="admin_provisioned",
                source_admin="system_seed",
                source_batch="pilot_seed_2026",
            )

    # 5. GV001 Counselor
    gv_user, _ = User.objects.get_or_create(
        username="cls_gv-001",
        defaults={
            "first_name": "Thầy/Cô Phụ trách",
            "password": initial_pwd_hash,
            "is_active": True,
        }
    )
    if gv_user.password != initial_pwd_hash and not gv_user.password.startswith("pbkdf2_"):
        gv_user.password = initial_pwd_hash
        gv_user.save(update_fields=["password"])

    ClassAccount.objects.get_or_create(
        external_ref="gv-001",
        defaults={
            "user_id": gv_user.pk,
            "login_code": "GV001",
            "role": "caregiver",
            "class_ref": "DEMO",
        }
    )


def unseed_pilot_data(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
        ('f16_classroom', '0002_admin_pairs_f16'),
        ('f01_identity', '0003_connection_admin_provenance'),
    ]

    operations = [
        migrations.RunPython(seed_pilot_data, reverse_code=unseed_pilot_data),
    ]
