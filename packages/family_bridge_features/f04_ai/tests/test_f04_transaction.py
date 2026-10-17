"""F04 transaction-phase probe (frozen contract C6, bug F04-04).

Proves the provider/network I/O runs OUTSIDE every transaction.atomic:
the provider double records connection.in_atomic_block AT CALL TIME and the
test asserts False. Uses TransactionTestCase so no test-level transaction
can mask an atomic block inside the service.
"""

from django.db import connection
from django.test import TransactionTestCase
from rest_framework.test import APIClient

import labgrants.sessions as _lab_sessions

from ..models import AiSuggestion
from ..services import registry
from .helpers import auth_header, make_session
from .test_f04 import HARSH, grant_ai_consent
from fixtures.actors import make_student


class ProbeProvider:
    """Records the atomic-block state of the connection when refine runs."""

    provider_id = "probe-ai"
    model_revision = "probe-model"
    prompt_revision = "probe-prompt"

    def __init__(self):
        self.calls = []
        self.in_atomic_block_at_call = None

    def refine(self, *, text, purpose, timeout_seconds=None):
        self.calls.append({"text": text, "purpose": purpose})
        self.in_atomic_block_at_call = connection.in_atomic_block
        return {
            "suggested_text": "Mình cảm thấy mệt và cần được lắng nghe.",
            "provider_id": self.provider_id,
            "model_revision": self.model_revision,
            "prompt_revision": self.prompt_revision,
        }


class ProviderOutsideTransactionProbeTests(TransactionTestCase):
    def test_provider_call_runs_outside_atomic_block(self):
        registry.reset_registries()
        self.addCleanup(registry.reset_registries)
        registry.register_session_resolver(_lab_sessions.resolve_session)
        provider = ProbeProvider()
        registry.register_ai_provider(provider)

        user = make_student()
        grant_ai_consent(user)
        token, _ = make_session(user)
        client = APIClient()
        response = client.post(
            "/api/v1/ai/refine",
            {"original_text": HARSH, "purpose": "refine_expression"},
            format="json", HTTP_X_IDEMPOTENCY_KEY="ai-probe-0001-abcdef",
            **auth_header(token))

        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(provider.calls), 1)
        # THE probe: provider I/O must never execute inside an atomic block.
        self.assertIs(provider.in_atomic_block_at_call, False)
        self.assertEqual(AiSuggestion.objects.count(), 1)
