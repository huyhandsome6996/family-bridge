"""F16 models: tai khoan lop HS/PH, de xuat ket noi hai chieu, thu ghi dang nhap.

Invariants (hop dong Task 1 — dang nhap lop hoc khong qua Zalo):
- ClassAccount la OneToOne voi auth user; login_code CHUAN HOA UPPERCASE va
  UNIQUE — day la thong tin dang nhap, KHONG phai du lieu bi mat (mat khau
  nam tren auth User, hash boi Django).
- CompanionProposal ghi de xuat ket noi HS <-> PH duoc nhap bang CSV. Cap mo
  (proposed/awaiting_confirmation) la DUY NHAT voi marker GeneratedField theo
  mau W036 (PR bao-tri/chong-trung-mysql-tidb-us004): UNIQUE khong dieu kien
  tren (student_account, caregiver_account, open_marker) — an toan MySQL/TiDB
  (conditional unique constraint bi MySQL drop khi migrate). Marker la 1 khi
  cap CON MO va NULL khi da dong (idiom active_marker cua F01 Connection):
  UNIQUE coi cac dong NULL la khac nhau nen proposal cu da declined/canceled
  khong chan proposal moi cua cung cap — chi cap mo la bi chan.
- LoginAttempt chi luu khoa bam (acct:/codeh:/ip:), ket qua va thoi diem —
  khong bao gio luu ma dang nhap hay mat khau (SEC-22).
"""

import datetime as dt
import uuid

from django.conf import settings
from django.db import models

from family_bridge_core.timeutils import UTC

ROLE_STUDENT = "student"
ROLE_CAREGIVER = "caregiver"
ROLES = (ROLE_STUDENT, ROLE_CAREGIVER)

PROPOSAL_PROPOSED = "proposed"
PROPOSAL_AWAITING = "awaiting_confirmation"
PROPOSAL_CONNECTED = "connected"
PROPOSAL_DECLINED = "declined"
PROPOSAL_CANCELED = "canceled"
PROPOSAL_OPEN_STATUSES = (PROPOSAL_PROPOSED, PROPOSAL_AWAITING)
PROPOSAL_TERMINAL_STATUSES = (PROPOSAL_CONNECTED, PROPOSAL_DECLINED,
                              PROPOSAL_CANCELED)

OUTCOME_OK = "ok"
OUTCOME_WRONG_PASSWORD = "wrong_password"
OUTCOME_UNKNOWN_CODE = "unknown_code"
OUTCOME_LOCKED_OUT = "locked_out"


def _utc_now() -> dt.datetime:
    return dt.datetime.now(tz=UTC)


class ClassAccount(models.Model):
    """Tai khoan dang nhap lop cho HS/PH (khong qua Zalo)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                related_name="class_account")
    login_code = models.CharField(max_length=32, unique=True)  # normalized UPPERCASE
    role = models.CharField(max_length=16, choices=[(r, r) for r in ROLES])
    class_ref = models.CharField(max_length=64, db_index=True)
    external_ref = models.CharField(max_length=128, unique=True)
    created_at = models.DateTimeField(default=_utc_now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "f16_classroom"
        constraints = [
            models.CheckConstraint(check=models.Q(role__in=ROLES),
                                   name="f16_classroom_role_valid"),
        ]

    def __str__(self) -> str:  # pragma: no cover - debug aid only
        return f"ClassAccount({self.login_code}/{self.role})"


class CompanionProposal(models.Model):
    """De xuat ket noi hai chieu giua mot HS va mot PH (cap lap lop).

    Trang thai: proposed -> awaiting_confirmation -> connected; hoac
    declined / canceled tu trang thai mo. Xac nhan thu nhat chi chuyen
    trang thai; xac nhan thu hai mo InviteService cua F01 trong CUNG
    transaction (khong co window invite treo ben ngoai).
    """

    STATUS_PROPOSED = PROPOSAL_PROPOSED
    STATUS_AWAITING = PROPOSAL_AWAITING
    STATUS_CONNECTED = PROPOSAL_CONNECTED
    STATUS_DECLINED = PROPOSAL_DECLINED
    STATUS_CANCELED = PROPOSAL_CANCELED

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student_account = models.ForeignKey(ClassAccount, on_delete=models.PROTECT,
                                        related_name="proposals_as_student")
    caregiver_account = models.ForeignKey(ClassAccount, on_delete=models.PROTECT,
                                          related_name="proposals_as_caregiver")
    status = models.CharField(
        max_length=32, default=PROPOSAL_PROPOSED,
        choices=[(s, s) for s in (PROPOSAL_PROPOSED, PROPOSAL_AWAITING,
                                  PROPOSAL_CONNECTED, PROPOSAL_DECLINED,
                                  PROPOSAL_CANCELED)])
    # W036 idiom (PR #34 branch): marker GeneratedField + UNIQUE khong dieu kien
    # — MySQL/TiDB drop conditional unique constraint khi migrate, nen cap mo
    # duoc dam bao bang open_marker=1 thay vi condition=Q(status__in=...).
    # Cap dong tra NULL (khong phai 0): UNIQUE bo qua dong NULL — nhieu
    # proposal da ket thuc cua cung cap khong xung dot voi nhau (idiom
    # active_marker cua F01 Connection).
    open_marker = models.GeneratedField(
        expression=models.Case(
            models.When(status__in=[PROPOSAL_PROPOSED, PROPOSAL_AWAITING],
                        then=models.Value(1)),
            default=models.Value(None),
            output_field=models.IntegerField(null=True),
        ),
        output_field=models.IntegerField(null=True),
        db_persist=False,
    )
    invite = models.ForeignKey("f01_identity.ConnectionInvite",
                               null=True, blank=True, on_delete=models.PROTECT,
                               related_name="classroom_proposals")
    first_confirmed_role = models.CharField(max_length=16, null=True, blank=True,
                                            choices=[(r, r) for r in ROLES])
    first_confirmed_at = models.DateTimeField(null=True, blank=True)
    outcome_role = models.CharField(max_length=16, null=True, blank=True)
    outcome_reason = models.CharField(max_length=32, null=True, blank=True)
    revision = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(default=_utc_now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "f16_classroom"
        constraints = [
            models.UniqueConstraint(fields=["student_account", "caregiver_account",
                                            "open_marker"],
                                    name="uniq_open_proposal_pair"),
        ]
        indexes = [
            models.Index(fields=["student_account", "status"]),
            models.Index(fields=["caregiver_account", "status"]),
        ]


class LoginAttempt(models.Model):
    """Thu ghi sliding-window cho guard dang nhap (pattern ClaimRateGuard).

    attempt_key: "acct:<user-uuid>" | "codeh:<hmac-hex>" | "ip:<sha256-hex>".
    Chi khoa bam co domain-separation — khong luu ma dang nhap thô.
    """

    id = models.BigAutoField(primary_key=True)
    attempt_key = models.CharField(max_length=80)
    outcome = models.CharField(max_length=16, choices=[
        (o, o) for o in (OUTCOME_OK, OUTCOME_WRONG_PASSWORD,
                         OUTCOME_UNKNOWN_CODE, OUTCOME_LOCKED_OUT)])
    attempted_at = models.DateTimeField(default=_utc_now)

    class Meta:
        app_label = "f16_classroom"
        indexes = [models.Index(fields=["attempt_key", "attempted_at"])]
