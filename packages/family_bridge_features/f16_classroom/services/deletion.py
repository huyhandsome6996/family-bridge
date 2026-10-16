"""Deletion hook cua F16 (dang ky vao co che xoa cua F15).

Giao thuc hook (f15 services/deletion.py process_request):
- hook la MODULE/CLASS co apply_user_deletion(*, user_id, requested_at);
- ket qua PHAI la dict co "ok" (bool) — F15 dung result.get("ok") de quyet
  dinh completed/failed (int tra ve se bi tinh la hook_error).

Du lieu xoa cua MOT user, idempotent (chay lai → 0 dong, ok=True):
- CompanionProposal co ClassAccount cua user (ca 2 phia) — PHAI xoa truoc
  ClassAccount vi FK on_delete=PROTECT;
- ClassAccount cua user (hook "account" — tai khoan lop la du lieu gan user);
- LoginAttempt theo khoa "acct:<user-uuid>" (cac khoa codeh:/ip: la du lieu
  chia se theo code/IP, khong gan user — purge theo chu ky trong
  ops/runbook.md, khong xoa theo user).

Category dang ky (category co san cua f15 services/registry):
- "account"     → module hook (proposals + ClassAccount + acct attempts);
- "connections" → ConnectionProposalDeletionHook (chi proposal lien quan).

Order: F15 goi hook truoc khi xoa auth user (CASCADE do OneToOne; nhung
proposal PROTECT phai duoc giai truoc).
"""

from __future__ import annotations

from django.db.models import Q

F16_DOMAIN = "f16_classroom"


def _delete_account_rows(user_id) -> int:
    from ..models import ClassAccount, CompanionProposal

    deleted = 0
    account = ClassAccount.objects.filter(user_id=user_id).first()
    if account is not None:
        removed, _ = (CompanionProposal.objects
                      .filter(Q(student_account_id=account.pk)
                              | Q(caregiver_account_id=account.pk))
                      .delete())
        deleted += int(removed)
        account.delete()
        deleted += 1
    return deleted


def _delete_acct_attempts(user_id) -> int:
    from ..models import LoginAttempt

    removed, _ = LoginAttempt.objects.filter(
        attempt_key=f"acct:{user_id}").delete()
    return int(removed)


def _delete_pair_proposals(user_id) -> int:
    from ..models import ClassAccount, CompanionProposal

    account = ClassAccount.objects.filter(user_id=user_id).first()
    if account is None:
        return 0
    removed, _ = (CompanionProposal.objects
                  .filter(Q(student_account_id=account.pk)
                          | Q(caregiver_account_id=account.pk))
                  .delete())
    return int(removed)


def apply_user_deletion(*, user_id, requested_at=None) -> dict:
    """Hook category "account": xoa toan bo hang f16 gan voi user.

    Idempotent — chay lai tren user da sach tra {"ok": True, "deleted": 0}.
    """
    deleted = _delete_account_rows(user_id) + _delete_acct_attempts(user_id)
    return {"ok": True, "domain": F16_DOMAIN, "deleted": int(deleted),
            "detail": f"removed {deleted} f16 rows (proposal/classaccount/"
                      f"acct loginattempt)"}


class ClassroomAccountDeletionHook:
    """Hook category "account" (dang ky qua dotted path lop — f15 runner
    khoi tao instance roi goi apply_user_deletion, ket qua dict co "ok")."""

    def apply_user_deletion(self, *, user_id, requested_at=None) -> dict:
        deleted = _delete_account_rows(user_id) + _delete_acct_attempts(user_id)
        return {"ok": True, "domain": F16_DOMAIN, "deleted": int(deleted),
                "detail": f"removed {deleted} f16 rows (proposal/"
                          f"classaccount/acct loginattempt)"}


class ConnectionProposalDeletionHook:
    """Hook category "connections": chi xoa proposal HS/PH lien quan user.

    Khong dong ClassAccount (do "account" chu tri) — dung cho deletion
    request chi hoi du lieu ket noi.
    """

    def apply_user_deletion(self, *, user_id, requested_at=None) -> dict:
        removed = _delete_pair_proposals(user_id)
        return {"ok": True, "domain": F16_DOMAIN, "deleted": int(removed),
                "detail": f"removed {removed} companion proposals"}
