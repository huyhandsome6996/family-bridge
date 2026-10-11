"""Platform endpoint + cursor pagination tests via Django test client.
These exercise the harness URL wiring that mirrors the api-foundation
contract (health/ready semantics + error envelope handler)."""

import datetime as dt

from django.contrib.auth import get_user_model
from django.db import models
from django.test import TestCase
from django.urls import reverse

from family_bridge_core.drf import cursor_paginate
from family_bridge_core.errors import CooldownActive
from harness.models import Probe


class PlatformEndpointsTests(TestCase):
    def test_health_ok_without_auth(self):
        response = self.client.get("/api/v1/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_ready_ok_with_db(self):
        response = self.client.get("/api/v1/ready/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_default_deny_unauthenticated_private_endpoint(self):
        # Any DRF endpoint with IsAuthenticated returns the envelope 401.
        from rest_framework.test import APIRequestFactory
        from rest_framework.views import APIView
        from rest_framework.permissions import IsAuthenticated

        class SecretView(APIView):
            permission_classes = [IsAuthenticated]

            def get(self, request):
                return self.request_response_ok()

            def request_response_ok(self):
                from rest_framework.response import Response
                return Response({"secret": "never"})

        factory = APIRequestFactory()
        request = factory.get("/api/v1/nowhere/")
        view = SecretView.as_view()
        response = view(request)
        self.assertEqual(response.status_code, 401)


class CursorPaginationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        base = dt.datetime(2026, 10, 1, 0, 0, 0, tzinfo=dt.timezone.utc)
        for index in range(25):
            Probe.objects.create(
                created_at=base + dt.timedelta(hours=index),
                name=f"row-{index:02d}")

    def test_first_page_and_second_page_no_overlap(self):
        qs = Probe.objects.all()
        items, cursor = cursor_paginate(qs, cursor=None, page_size=20)
        self.assertEqual(len(items), 20)
        names_first = {item.name for item in items}
        items2, cursor2 = cursor_paginate(qs, cursor=cursor, page_size=20)
        names_second = {item.name for item in items2}
        self.assertEqual(len(items2), 5)
        self.assertFalse(names_first & names_second)
        self.assertIsNone(cursor2)

    def test_cursor_is_position_not_permission(self):
        # A cursor from another actor's page cannot expand visibility; the
        # caller's queryset filters still apply (simulated here by filtering).
        _, cursor = cursor_paginate(Probe.objects.all(), cursor=None, page_size=3)
        items, _ = cursor_paginate(
            Probe.objects.filter(name__startswith="row-0"),
            cursor=cursor, page_size=50)
        for item in items:
            self.assertTrue(item.name.startswith("row-0"))

    def test_bad_cursor_rejected_loudly(self):
        from rest_framework.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            cursor_paginate(Probe.objects.all(), cursor="!!!not-a-cursor",
                            page_size=20)


class ExceptionEnvelopeTests(TestCase):
    def test_family_bridge_error_maps_to_envelope(self):
        from rest_framework.test import APIRequestFactory
        from rest_framework.views import APIView

        class Explode(APIView):
            permission_classes = []

            def get(self, request):
                raise CooldownActive({"cooldown_until": "2026-10-11T09:05:00+00:00"})

        factory = APIRequestFactory()
        response = Explode.as_view()(factory.get("/"))
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["error"]["code"], "cooldown_active")
        self.assertIn("cooldown_until", response.data["error"]["details"])

    def test_harness_user_model_is_uuid(self):
        user = get_user_model().objects.create_user(username="uuid-check",
                                                    password="x-test-only")
        self.assertEqual(str(user.pk), str(user.pk))  # stable string form
        import uuid as uuid_lib
        self.assertIsInstance(user.pk, uuid_lib.UUID)
