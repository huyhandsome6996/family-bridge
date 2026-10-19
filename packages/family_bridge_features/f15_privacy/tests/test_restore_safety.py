"""Independent restore regressions: isolated synthetic test DB only."""
import datetime as dt
from unittest.mock import patch

from family_bridge_features.f01_identity.models import Connection
from family_bridge_features.f07_mood.models import MoodEntry, MoodShare

from ..models import DeletionLedgerEvent, DeletionRequest
from ..services import registry
from ..services.deletion import DeletionService
from ..services.revocation import revoke_connection_with_privacy
from .test_f15_wiring import F15WiringTestCase


class RestoreSafetyTests(F15WiringTestCase):
    def _verified_request(self, categories):
        service = DeletionService()
        receipt = service.request_deletion(user=self.owner, categories=categories)

        class SyntheticAuthorizer:
            def authorize(self, **kwargs):
                return True

        service.verify_request(request_id=receipt["request_id"],
                               verifier_ref="synthetic-independent",
                               actor_id=str(self.stranger.pk),
                               authorizer=SyntheticAuthorizer())
        return service, receipt["request_id"]

    @staticmethod
    def _snapshot(entry):
        return {f.attname: getattr(entry, f.attname)
                for f in entry._meta.fields}

    def test_other_party_restore_replays_own_grants(self):
        connection = self._make_connection(user_a=self.owner,
                                           user_b=self.recipient)
        entry = self._make_mood_entry(owner=self.recipient)
        share = self._make_mood_share(owner=self.recipient,
                                     recipient=self.owner, entry=entry,
                                     connection=connection)
        revoke_connection_with_privacy(actor=self.owner,
                                       connection_id=str(connection.pk))
        # Simulate backup-era rows; replay ONLY the non-initiating party.
        MoodShare.objects.filter(pk=share.pk).update(revoked_at=None)
        Connection.objects.filter(pk=connection.pk).update(status="active",
                                                           revoked_at=None)
        replay = DeletionService.replay_ledger_for_restore(
            target_user_id=str(self.recipient.pk))
        share.refresh_from_db()
        self.assertIsNotNone(share.revoked_at)
        self.assertFalse(replay["incomplete"])

    def test_partial_deletion_replays_success_and_reports_unresolved(self):
        entry = self._make_mood_entry(owner=self.owner)
        snapshot = self._snapshot(entry)
        service, request_id = self._verified_request(["mood", "messages"])
        result = service.process_request(request_id=request_id)
        self.assertEqual(result.status, "failed_needs_action")
        self.assertFalse(MoodEntry.objects.filter(pk=entry.pk).exists())
        # Remove new checkpoint events to prove replay of LEGACY partial
        # final events still preserves the categories already erased.
        DeletionLedgerEvent.objects.filter(
            payload__checkpoint=True).delete()
        MoodEntry.objects.create(**snapshot)
        replay = service.replay_ledger_for_restore(
            target_user_id=str(self.owner.pk))
        self.assertFalse(MoodEntry.objects.filter(pk=entry.pk).exists())
        self.assertTrue(replay["incomplete"])
        self.assertTrue(any(f["reason"] == "deletion_category_unresolved"
                            and f["category"] == "messages"
                            for f in replay["failures"]))

    def test_crash_before_request_checkpoint_still_has_tombstone(self):
        entry = self._make_mood_entry(owner=self.owner)
        snapshot = self._snapshot(entry)
        service, request_id = self._verified_request(["mood"])
        with patch.object(service, "_persist_checkpoint",
                          side_effect=RuntimeError("synthetic worker crash")):
            with self.assertRaises(RuntimeError):
                service.process_request(request_id=request_id)
        self.assertFalse(MoodEntry.objects.filter(pk=entry.pk).exists())
        event = DeletionLedgerEvent.objects.filter(
            event_type=DeletionLedgerEvent.EVENT_DELETION_APPLIED).get()
        self.assertTrue(event.payload["checkpoint"])
        # A new entry after the frozen cutoff must survive replay.
        later = self._make_mood_entry(owner=self.owner)
        later.entry_date = snapshot["entry_date"] + dt.timedelta(days=1)
        later.save(update_fields=["entry_date"])
        MoodEntry.objects.create(**snapshot)
        replay = service.replay_ledger_for_restore(
            target_user_id=str(self.owner.pk))
        self.assertFalse(MoodEntry.objects.filter(pk=entry.pk).exists())
        self.assertTrue(MoodEntry.objects.filter(pk=later.pk).exists())
        self.assertFalse(replay["incomplete"])

    def test_failed_hook_cannot_commit_unrecorded_partial_erase(self):
        entry = self._make_mood_entry(owner=self.owner)
        service, request_id = self._verified_request(["mood"])

        class PartialFailureHook:
            def apply_user_deletion(self, *, user_id, requested_at):
                MoodEntry.objects.filter(owner_id=user_id).delete()
                return {"ok": False, "detail": "synthetic partial failure"}

        with patch.object(registry, "get_deletion_hook",
                          return_value=PartialFailureHook):
            result = service.process_request(request_id=request_id)
        self.assertEqual(result.status, "failed_needs_action")
        self.assertTrue(MoodEntry.objects.filter(pk=entry.pk).exists())
        self.assertFalse(DeletionLedgerEvent.objects.filter(
            event_type=DeletionLedgerEvent.EVENT_DELETION_APPLIED).exists())


    def test_later_completion_resolves_prior_partial_outcome(self):
        entry = self._make_mood_entry(owner=self.owner)
        snapshot = self._snapshot(entry)
        service, request_id = self._verified_request(["mood", "messages"])
        service.process_request(request_id=request_id)

        class MessagesHook:
            def apply_user_deletion(self, **kwargs):
                return {"ok": True, "detail": "synthetic empty category"}

        actual_get_hook = registry.get_deletion_hook
        def hooks(category):
            return MessagesHook if category == "messages" else actual_get_hook(category)

        with patch.object(registry, "get_deletion_hook", side_effect=hooks):
            result = service.process_request(request_id=request_id)
            self.assertEqual(result.status, "completed")
            MoodEntry.objects.create(**snapshot)
            replay = service.replay_ledger_for_restore(
                target_user_id=str(self.owner.pk))
        self.assertFalse(MoodEntry.objects.filter(pk=entry.pk).exists())
        self.assertFalse(replay["incomplete"])
        self.assertEqual(replay["failures"], [])

    def test_corrupted_processing_cutoff_never_expands_scope(self):
        from family_bridge_core.errors import InputInvalid

        entry = self._make_mood_entry(owner=self.owner)
        service, request_id = self._verified_request(["mood"])
        corrupt_scopes = [
            {"cutoff": "invalid-iso-date"},
            {"cutoff": "2026-10-14T00:00:00"},
            {}, None,
        ]
        for scope in corrupt_scopes:
            with self.subTest(scope=scope):
                DeletionRequest.objects.filter(pk=request_id).update(
                    failure_detail={"_scope": scope})
                with patch.object(service, "_run_category") as hook:
                    with self.assertRaises(InputInvalid) as raised:
                        service.process_request(request_id=request_id)
                    self.assertEqual(raised.exception.details["reason"],
                                     "persisted_deletion_cutoff_malformed")
                    hook.assert_not_called()
                self.assertTrue(MoodEntry.objects.filter(pk=entry.pk).exists())

    def test_replay_naive_cutoff_is_incomplete_and_keeps_data(self):
        entry = self._make_mood_entry(owner=self.owner)
        event = DeletionLedgerEvent.objects.create(
            target_user_id=str(self.owner.pk), actor_ref="synthetic",
            event_type=DeletionLedgerEvent.EVENT_DELETION_APPLIED,
            payload={"request_id": "synthetic", "categories": ["mood"],
                     "cutoff": "2099-01-01T00:00:00"})
        replay = DeletionService.replay_ledger_for_restore(
            target_user_id=str(self.owner.pk))
        self.assertTrue(MoodEntry.objects.filter(pk=entry.pk).exists())
        self.assertTrue(replay["incomplete"])
        self.assertEqual(replay["failures"][0]["reason"],
                         "deletion_cutoff_malformed")
        self.assertEqual(replay["next_after_seq"], event.seq - 1)

    def test_replay_failure_cursor_revisits_failed_event_after_repair(self):
        from django.utils import timezone

        failed_event = DeletionLedgerEvent.objects.create(
            target_user_id=str(self.owner.pk), actor_ref="synthetic",
            event_type=DeletionLedgerEvent.EVENT_DELETION_APPLIED,
            payload={"request_id": "synthetic", "categories": ["messages"],
                     "cutoff": timezone.now().isoformat()})
        later_event = DeletionLedgerEvent.objects.create(
            target_user_id=str(self.owner.pk), actor_ref="synthetic",
            event_type=DeletionLedgerEvent.EVENT_DELETION_REQUESTED,
            payload={"request_id": "unrelated-request"})
        replay = DeletionService.replay_ledger_for_restore(
            target_user_id=str(self.owner.pk))
        self.assertTrue(replay["incomplete"])
        self.assertEqual(replay["scanned_last_seq"], later_event.seq)
        self.assertEqual(replay["last_seq"], later_event.seq)
        self.assertEqual(replay["next_after_seq"], failed_event.seq - 1)
        self.assertEqual(replay["safe_resume_after_seq"], failed_event.seq - 1)

        class RepairedHook:
            def apply_user_deletion(self, **kwargs):
                return {"ok": True}

        with patch.object(registry, "get_deletion_hook",
                          return_value=RepairedHook):
            retried = DeletionService.replay_ledger_for_restore(
                target_user_id=str(self.owner.pk),
                after_seq=replay["next_after_seq"])
        self.assertFalse(retried["incomplete"])
        self.assertEqual(retried["applied"], 1)
        self.assertEqual(retried["events_total"], 2)
        self.assertIsNone(retried["next_after_seq"])
