# F16 test.md — case + lệnh chạy + môi trường

## Môi trường

- Harness SQLite (local + CI): `tests/feature-lab`, `DJANGO_SETTINGS_MODULE=harness.settings`,
  `FB_FEATURES` chứa `f16_classroom` (deps tự mở `f01_identity`).
- Backend thật (wiring): `DJANGO_ENV=test DB_ENGINE=sqlite DJANGO_SECRET_KEY=<60+ ký tự>`,
  run `family_bridge_features.f16_classroom core accounts`.
- MySQL races: chỉ chạy khi `FB_TEST_DB=mysql` + DB khả dụng; không có →
  SKIP có lý do, báo NOT_RUN (SQLite không chứng minh row-lock/unique race).

## Lệnh

```bash
# 1) Suite f16 trên harness (SQLite)
cd tests/feature-lab && DJANGO_SETTINGS_MODULE=harness.settings DJANGO_ENV=test \
  FB_FEATURES="f16_classroom,f01_identity,f15_privacy" \
  <venv>/bin/python manage.py test family_bridge_features.f16_classroom -v 1

# 2) CI-equivalent (toàn bộ feature + harness + labgrants)
cd tests/feature-lab && DJANGO_SETTINGS_MODULE=harness.settings DJANGO_ENV=test \
  FB_FEATURES="f01_identity,f15_privacy,f05_inbox,f03_cards,f04_ai,f06_drafts,f07_mood,f08_journal,f10_signal,f11_supporters,f13_help,f12_appointments,f09_activities,f02_program,f14_surveys,admin_core,f16_classroom" \
  <venv>/bin/python manage.py test harness labgrants \
  family_bridge_features.f01_identity family_bridge_features.f15_privacy \
  family_bridge_features.f05_inbox family_bridge_features.f03_cards \
  family_bridge_features.f04_ai family_bridge_features.f06_drafts \
  family_bridge_features.f07_mood family_bridge_features.f08_journal \
  family_bridge_features.f10_signal family_bridge_features.f11_supporters \
  family_bridge_features.f13_help family_bridge_features.f12_appointments \
  family_bridge_features.f09_activities family_bridge_features.f02_program \
  family_bridge_features.f14_surveys family_bridge_features.admin_core \
  family_bridge_features.f16_classroom -v 1

# 3) Backend wiring (check + migration drift + test)
cd backend && DJANGO_ENV=test DB_ENGINE=sqlite DJANGO_SECRET_KEY=$(python3 -c "print('x'*60)") \
  <venv>/bin/python manage.py check && \
  <venv>/bin/python manage.py makemigrations --check --dry-run && \
  <venv>/bin/python manage.py test family_bridge_features.f16_classroom core accounts -v 1

# 4) (nếu có MySQL) races
cd tests/feature-lab && FB_TEST_DB=mysql FB_MYSQL_*=<env> \
  <venv>/bin/python manage.py test family_bridge_features.f16_classroom.tests.test_races_mysql -v 1
```

## Case chính (suite `f16_classroom`)

| Suite | Case | Mục tiêu |
| --- | --- | --- |
| test_login | login_ok_shape, role_from_db_not_code_prefix, consents_required_lists_missing_purposes | Shape 200 theo hợp đồng; role đọc từ DB |
| test_login | unknown_wrong_disabled_byte_identical, malformed_code_same_envelope, missing_fields_generic_error | Chống dò mã: 401 body byte-giống-hệt |
| test_login | 4 case LoginRateGuardTests | Guard DB 10 fail/15ph theo acct/codeh/ip; `ok` không cộng ngưỡng; key chỉ HMAC |
| test_login | 100_accounts_login_and_token_usable | Q50: scale 100 tài khoản + token dùng được (MD5 hasher) |
| test_proposals | ConfirmFlowTests (10 case) | 2 bước xác nhận; generation 1; canonical pair; replay 400; expected_revision 409; consent gate 403; counterpart inactive 403; third actor 404; blocked_by_open_invite (invite KHÔNG bị hủy hộ); already_connected |
| test_proposals | DeclineCancelTests (6 case) | decline/cancel 2 phía 2 trạng thái; đóng invite nền; invalid_enum; terminal 400; 404 không leak |
| test_proposals | ListTests (2 case) | list chỉ proposal của chính mình; unauthenticated 401 |
| test_settings | ChangePasswordTests/ChangeCodeTests/ChangeDisplayNameTests | Re-auth bắt buộc; thu hồi phiên khác giữ phiên hiện tại; đổi mã chết mã cũ; duplicate_code; display_name đối tác thấy |
| test_provisioning | DryRunTests, ImportAccountsTests (5), ProposalImportTests (3), FailClosedTests, IntegrityRaceBestEffortTests | Dry-run zero-write; 100 tài khoản + auto pair 50; idempotent theo external_ref (giữ password + tên đã đổi); drift skip; duplicate/invalid chặn toàn bộ; cặp unknown/mismatch; skip cặp bất kỳ trạng thái; fail-closed password env; xung đột username ghi lỗi hàng, import chạy tiếp |
| test_capabilities | public shape; zalo flag off/creds thiếu/đủ | Public, fail closed, không lộ secret |
| test_zalo_gate | GateUnitTests (4) — mọi env | 503 envelope chính xác khi flag off; GET/path khác/flag on → passthrough |
| test_zalo_gate | GateMountedHTTPTests (3) — chỉ backend settings | Qua HTTP thật: 503 khi off; mặc định on không bị gate chặn; capabilities phản ánh flag |
| test_deletion | AccountDeletionHook (4), ConnectionsHook, RegistryWiring (2) | Hook xóa proposal/account/acct-attempts, giữ codeh/ip; idempotent; PROTECT được giải trước khi xóa user; registry dotted path resolve; protocol dict `ok` với F15 |
| test_races_mysql | double_confirm_second_step_single_connection; two_concurrent_imports | MySQL thật: 2 thread confirm bước 2 → 1 Connection; 2 lần provision song song → không trùng, không crash (NOT_RUN khi không có MySQL) |

## Wiring kiểm tra ở nơi khác

- `tests/feature-lab/harness/tests/test_core.py`: registry 18 entry (F01..F16 + B16 + B17), validate_registry sạch.
- `backend/core/tests/test_wiring.py`: 17 feature apps cài đủ; route đại diện F16 (`/api/v1/auth/class-capabilities`) resolve; `class_login` 200/hour; `/api/v1/classroom/proposals` 401 envelope.
