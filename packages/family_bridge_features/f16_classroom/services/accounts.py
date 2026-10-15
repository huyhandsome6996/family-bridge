"""Dang nhap tai khoan lop + doi mat khau/ma/ten goi (F16).

Nguyen tac bat dien:
- Khong biet le (anti-enumeration): ma khong ton tai, sai mat khau, tai
  khoan bi vo hieu hoa → cung MOT body loi 401 invalid_credentials, byte
  giong het nhau. Ma loi sai dinh dang cung ve cung body.
- Timing parity: khi ma khong ton tai van chay check_password tren hash gia
  (_DUMMY_HASH) de thoi gian phan hoi khong lo ma ton tai hay khong.
- Guard sliding-window DB (services/ratelimit.py) commit TRUOC nghiep vu.
- Session phat boi co che Session cua F01 (hash SHA-256, TTL, revoke) — F16
  khong tu phat token.
"""

from __future__ import annotations

import re
import datetime as dt

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.password_validation import (
    validate_password as django_validate_password,
)
from django.core.exceptions import ValidationError
from django.db import IntegrityError

from family_bridge_core.errors import InputInvalid, NotAuthenticated, NotAuthorized
from family_bridge_core.timeutils import UTC

from ..models import (
    OUTCOME_LOCKED_OUT, OUTCOME_OK, OUTCOME_UNKNOWN_CODE, OUTCOME_WRONG_PASSWORD,
    ClassAccount, LoginAttempt,
)
from .ratelimit import (
    guard_key_for_account, guard_key_for_code, guard_key_for_ip,
)

LOGIN_CODE_RE = re.compile(r"^[A-Z0-9]{3,16}$")

# Password policy toi thieu rieng cua F16 (con di qua validate_password Django).
MIN_PASSWORD_LENGTH = 8

# Hash gia cho timing parity — hang so, khong bi mat (khong kha truy nguoc
# thanh mot mat khau that cua ai).
_DUMMY_PASSWORD_CONSTANT = "fb-classroom-timing-parity-9f3a1c4e7d2b"
_DUMMY_HASH: str | None = None


def _dummy_password_hash() -> str:
    global _DUMMY_HASH
    if _DUMMY_HASH is None:
        _DUMMY_HASH = make_password(_DUMMY_PASSWORD_CONSTANT)
    return _DUMMY_HASH


def normalize_login_code(raw) -> str:
    """Chuan hoa ma dang nhap (strip, upper, regex ^[A-Z0-9]{3,16}$).

    Login path (chong biet le): sai dinh dang → NotAuthenticated generic.
    Path cau hinh (da xac thuc): sai dinh dang → InputInvalid cu the.
    """
    if not isinstance(raw, str):
        raise InputInvalid({"field": "code", "reason": "must_be_string"})
    normalized = raw.strip().upper()
    if not LOGIN_CODE_RE.fullmatch(normalized):
        raise InputInvalid({"field": "code", "reason": "invalid_code_format"})
    return normalized


def _normalize_for_login(raw) -> str:
    try:
        return normalize_login_code(raw)
    except InputInvalid:
        raise NotAuthenticated({"reason": "invalid_credentials"}) from None


def _consents_required(user) -> list:
    """Purposes chua co dong y hieu luc cho phien ban policy hien hanh."""
    from family_bridge_features.f01_identity.models import ConsentRecord
    from family_bridge_features.f01_identity.services.identity import has_active_consent

    return [purpose for purpose in ConsentRecord.PURPOSES
            if not has_active_consent(user.pk, purpose)]


def _issue_session(user):
    """Phat session bang co che F01 (verifier None — khong lien quan Zalo)."""
    from family_bridge_features.f01_identity.services.identity import SessionService

    session_service = SessionService(verifier=None, app_id="")
    return session_service._issue_session(user)


class ClassLoginService:
    """login(code, password, ip) → (user, account, raw_token, session, payload)."""

    def __init__(self, *, guard=None, ttl_seconds=None) -> None:
        from .ratelimit import LoginRateGuard
        self.guard = guard or LoginRateGuard()
        self.ttl_seconds = ttl_seconds

    def login(self, *, code, password, ip=""):
        normalized = _normalize_for_login(code)
        code_key = guard_key_for_code(normalized)
        ip_key = guard_key_for_ip(ip)

        account = (ClassAccount.objects.select_related("user")
                   .filter(login_code=normalized).first())
        keys = ([guard_key_for_account(account.user_id), code_key, ip_key]
                if account is not None else [code_key, ip_key])

        try:
            self.guard.assert_not_locked(keys=keys)
        except Exception:
            self.guard.record(keys=keys, outcome=OUTCOME_LOCKED_OUT)
            raise

        if account is not None:
            ok = (bool(account.user.is_active)
                  and isinstance(password, str)
                  and account.user.check_password(password))
            outcome = OUTCOME_OK if ok else OUTCOME_WRONG_PASSWORD
        else:
            # Timing parity: chay check_password that tren hash gia.
            check_password(password if isinstance(password, str) else "",
                           _dummy_password_hash())
            ok = False
            outcome = OUTCOME_UNKNOWN_CODE

        if not ok:
            self.guard.record(keys=keys, outcome=outcome)
            # Body GIONG HET cho moi nguyen nhan that bai (khong biet le).
            raise NotAuthenticated({"reason": "invalid_credentials"})

        raw_token, session = _issue_session(account.user)
        self.guard.record(keys=keys, outcome=OUTCOME_OK)
        payload = {
            "token": raw_token,
            "token_type": "Bearer",
            "expires_at": session.expires_at.isoformat(),
            "user": {
                "id": str(account.user.pk),
                "display_name": _display_name_of(account.user),
                "role": account.role,
                "class_ref": account.class_ref,
            },
            # Khong co "must_change_password": F16 khong ep doi mat khau
            # (mat khau khoi tao phat kenh rieng, khong phai mat khau tam).
            "consents_required": _consents_required(account.user),
        }
        return account.user, account, raw_token, session, payload


def _display_name_of(user):
    from family_bridge_features.f01_identity.services.display import display_name_of
    return display_name_of(user)


def _require_class_account(user) -> ClassAccount:
    account = getattr(user, "class_account", None)
    if account is None:
        try:
            account = ClassAccount.objects.get(user=user)
        except ClassAccount.DoesNotExist:
            raise NotAuthorized({"reason": "not_a_class_account"}) from None
    return account


def _require_reauth(user, current_password) -> None:
    """Xac thuc lai bang mat khau hien hanh truoc moi thay doi cau hinh."""
    if not isinstance(current_password, str) or not current_password \
            or not user.check_password(current_password):
        raise NotAuthorized({"reason": "reauth_failed"})


def change_password(user, *, current_password, new_password,
                    current_raw_token) -> int:
    """Doi mat khau; thu hoi cac session KHAC con song, giu phien hien tai.

    Tra ve so session da thu hoi. current_raw_token la bearer token dang
    dung cua chinh request nay (khong duoc revoke chinh no).
    """
    _require_reauth(user, current_password)
    if not isinstance(new_password, str) or len(new_password) < MIN_PASSWORD_LENGTH:
        raise InputInvalid({"reason": "weak_password",
                            "messages": [f"Mật khẩu cần ít nhất "
                                         f"{MIN_PASSWORD_LENGTH} ký tự."]})
    try:
        django_validate_password(new_password, user=user)
    except ValidationError as exc:
        raise InputInvalid({"reason": "weak_password",
                            "messages": [str(m) for m in exc.messages]}) from exc
    if new_password == current_password:
        raise InputInvalid({"reason": "same_password"})

    user.set_password(new_password)
    user.save(update_fields=["password"])

    # Thu hoi cac session khac con song — giu phien hien tai (khong doi GUI).
    from family_bridge_features.f01_identity.models import Session, hash_token
    now = dt.datetime.now(tz=UTC)
    revoked = Session.objects.filter(
        user_id=user.pk, revoked_at__isnull=True, expires_at__gt=now,
    ).exclude(token_hash=hash_token(current_raw_token)).update(revoked_at=now)
    return int(revoked)


def change_login_code(user, *, current_password, new_code) -> str:
    """Doi ma dang nhap cua tai khoan lop; trang thai khac giu nguyen."""
    _require_reauth(user, current_password)
    account = _require_class_account(user)
    try:
        normalized = normalize_login_code(new_code)
    except InputInvalid:
        raise InputInvalid({"field": "new_code",
                            "reason": "invalid_code_format"}) from None
    if normalized == account.login_code:
        raise InputInvalid({"reason": "same_code"})
    account.login_code = normalized
    try:
        account.save(update_fields=["login_code", "updated_at"])
    except IntegrityError:
        raise InputInvalid({"reason": "duplicate_code"}) from None
    return normalized


def change_display_name(user, *, current_password, raw) -> dict:
    """Dat ten goi tu khai bao (tai su dung co che display cua F01)."""
    _require_reauth(user, current_password)
    from family_bridge_features.f01_identity.services.display import (
        IDENTITY_BASIS_SELF_DECLARED, save_display_name,
    )
    name = save_display_name(user, raw)
    return {"display_name": name, "identity_basis": IDENTITY_BASIS_SELF_DECLARED}
