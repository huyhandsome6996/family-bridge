"""Real backend integration: classroom tokens cross feature port boundaries.

Uses actual database sessions, authentication classes and URLs, with no
registered harness resolver or force_authenticate bypass.
"""
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings

from family_bridge_features.f01_identity.services.identity import record_consent
from family_bridge_features.f01_identity.services.policy import CURRENT_POLICY_VERSIONS
from family_bridge_features.f05_inbox.services import registry as inbox_ports
from family_bridge_features.f15_privacy.services import sessions as privacy_sessions
from family_bridge_features.f16_classroom.models import ClassAccount


@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class ClassroomCrossFeatureTests(TestCase):
    def setUp(self):
        cache.clear()
        inbox_ports.reset_registries()
        privacy_sessions.reset_resolver()
        self.addCleanup(inbox_ports.reset_registries)
        self.addCleanup(privacy_sessions.reset_resolver)
        user = get_user_model().objects.create_user(
            username='synthetic-classroom-integration', password='TestOnly2026!')
        ClassAccount.objects.create(user=user, login_code='HS999', role='student',
                                    class_ref='TEST', external_ref='TEST-HS999')
        record_consent(user=user, purpose='service',
                       policy_version=CURRENT_POLICY_VERSIONS['service'],
                       decision='accepted')
        response = self.client.post('/api/v1/auth/class-session',
                                    {'code':'HS999', 'password':'TestOnly2026!'},
                                    content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.headers = {'HTTP_AUTHORIZATION': 'Bearer ' + response.json()['token']}

    def test_classroom_bearer_is_usable_across_real_feature_ports(self):
        for path in ['/api/v1/auth/me', '/api/v1/privacy/overview',
                     '/api/v1/messages', '/api/v1/drafts']:
            with self.subTest(path=path):
                response = self.client.get(path, **self.headers)
                self.assertEqual(response.status_code, 200, response.content)

    def test_inbox_connection_reader_resolves_real_identity_service(self):
        from family_bridge_features.f01_identity.services.invites import InviteService
        self.assertIsInstance(inbox_ports.get_connection_reader(), InviteService)

    def test_all_feature_session_ports_accept_and_revoke_the_same_identity(self):
        from importlib import import_module
        labels = ['admin_core', 'f02_program', 'f03_cards', 'f04_ai', 'f05_inbox',
                  'f06_drafts', 'f07_mood', 'f08_journal', 'f09_activities',
                  'f10_signal', 'f11_supporters', 'f12_appointments', 'f14_surveys']
        token = self.headers['HTTP_AUTHORIZATION'].split(' ', 1)[1]
        resolvers = []
        for label in labels:
            with self.subTest(feature=label):
                registry = import_module(f'family_bridge_features.{label}.services.registry')
                registry.reset_registries()
                self.addCleanup(registry.reset_registries)
                resolver = registry.get_session_resolver()
                self.assertIsNotNone(resolver)
                user, session = resolver(token)
                self.assertEqual(user.pk, session.user_id)
                self.assertIsNone(resolver('invalid-token'))
                resolvers.append(resolver)
        self.client.post('/api/v1/auth/logout', {},
                         content_type='application/json', **self.headers)
        for resolver in resolvers:
            self.assertIsNone(resolver(token))

    def test_authentication_does_not_grant_classroom_user_admin_permissions(self):
        # Scoped admin resources may conceal their existence with a 404.
        self.assertIn(self.client.get('/api/v1/admin/dashboard', **self.headers).status_code,
                      (403, 404))

    def test_logout_invalidates_classroom_bearer_in_all_feature_ports(self):
        response = self.client.post('/api/v1/auth/logout', {},
                                    content_type='application/json', **self.headers)
        self.assertEqual(response.status_code, 200)
        for path in ['/api/v1/privacy/overview', '/api/v1/messages', '/api/v1/drafts']:
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path, **self.headers).status_code, 401)
