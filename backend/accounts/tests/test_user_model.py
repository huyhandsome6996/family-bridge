"""accounts.User — UUID primary key, AUTH_USER_MODEL, tạo user/superuser, unique username.

Hợp đồng: docs/contracts/api-foundation.md (UUID định danh tài khoản; Zalo ID giữ
string — việc binding Zalo thuộc US-011, không thuộc model nền tảng này).
"""

import uuid

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.db.models import UUIDField
from django.test import TestCase

from accounts.models import User as AccountsUser


class UserModelTests(TestCase):
    def test_auth_user_model_points_to_accounts_user(self):
        self.assertEqual(settings.AUTH_USER_MODEL, "accounts.User")
        self.assertIs(get_user_model(), AccountsUser)

    def test_user_id_is_uuid_primary_key_with_uuid4_default(self):
        field = AccountsUser._meta.get_field("id")
        self.assertIsInstance(field, UUIDField)
        self.assertTrue(field.primary_key)
        self.assertTrue(field.editable is False)
        self.assertIs(field.default, uuid.uuid4)

    def test_created_users_get_random_uuid4_ids(self):
        alice = AccountsUser.objects.create_user("alice")
        bob = AccountsUser.objects.create_user("bob")
        self.assertIsInstance(alice.id, uuid.UUID)
        self.assertEqual(alice.id.version, 4)
        self.assertIsInstance(bob.id, uuid.UUID)
        self.assertNotEqual(alice.id, bob.id)

    def test_create_user_and_superuser_work(self):
        alice = AccountsUser.objects.create_user("alice", password="strong-pass-123")
        self.assertFalse(alice.is_superuser)
        self.assertFalse(alice.is_staff)
        self.assertTrue(alice.check_password("strong-pass-123"))

        root = AccountsUser.objects.create_superuser("root", "root@example.com", "admin-pass-456")
        self.assertTrue(root.is_superuser)
        self.assertTrue(root.is_staff)
        self.assertTrue(root.check_password("admin-pass-456"))

    def test_username_is_unique_at_database_level(self):
        # Ràng buộc unique phải nằm ở DB, không chỉ ở validate form (DSA-08).
        AccountsUser.objects.create_user("dup")
        with self.assertRaises(IntegrityError):
            AccountsUser.objects.create_user("dup")
