# F16 report.md — kiểm chứng thực tế của Agent 3-a3 (chốt backend)

Baseline: `61d6ced` (docs(team): phân công công việc nhóm Huy/Ngọc/Thắng theo nhánh).
Commit models nằm giữa: `7b90761` (feat(f16): goi f16_classroom — models ClassAccount/CompanionProposal/LoginAttempt + migration 0001). Mọi phần còn lại là uncommitted worktree lúc bắt đầu kiểm chứng; agent này chạy toàn bộ suite LẦN ĐẦU, sửa lỗi phát hiện, và commit theo chunk.

## Phạm vi đã kiểm chứng

- Package `packages/family_bridge_features/f16_classroom`: models + migration
  0001 (GeneratedField `open_marker` + unique không điều kiện
  `uniq_open_proposal_pair` — idiom W036 của nhánh
  `bao-tri/chong-trung-mysql-tidb-us004`), services (accounts/ratelimit/
  proposals/capabilities/sessions/deletion/provisioning), api/auth/urls,
  `management/commands/provision_classroom.py`, 8 file test (71 case).
- Wiring: registry F16 (branch main, deletion_hook dotted), harness settings
  (VALID_LABELS + HARNESS_DEPS f16→[f01_identity] + throttle `class_login`
  200/hour), backend settings (FEATURE_APP_LABELS + flag
  `FB_ZALO_LOGIN_ENABLED` + middleware `FBZaloDormancyMiddleware`),
  test_wiring (17 apps + route đại diện), test_core (18 entry),
  `.github/workflows/tests.yml`, `.env.example`.

## Lệnh + kết quả (đã chạy thật)

Venv: `/home/z/my-project/fb-backend-wt/.venv/bin/python` (Django 5.2.18 + DRF).

1. Suite f16 trên harness (SQLite):

```
cd tests/feature-lab && DJANGO_SETTINGS_MODULE=harness.settings DJANGO_ENV=test \
  FB_FEATURES="f16_classroom,f01_identity,f15_privacy" \
  /home/z/my-project/fb-backend-wt/.venv/bin/python manage.py test family_bridge_features.f16_classroom -v 1
→ Ran 71 tests — OK (skipped=5: 2 MySQL race + 3 GateMountedHTTPTests vì harness không mount middleware)
```

2. CI-equivalent toàn bộ (khớp `.github/workflows/tests.yml`):

```
cd tests/feature-lab && DJANGO_SETTINGS_MODULE=harness.settings DJANGO_ENV=test \
  FB_FEATURES="f01_identity,f15_privacy,f05_inbox,f03_cards,f04_ai,f06_drafts,f07_mood,f08_journal,f10_signal,f11_supporters,f13_help,f12_appointments,f09_activities,f02_program,f14_surveys,admin_core,f16_classroom" \
  ... manage.py test harness labgrants \
  family_bridge_features.f01_identity family_bridge_features.f15_privacy \
  ... family_bridge_features.admin_core family_bridge_features.f16_classroom -v 1
→ Ran 475 tests — OK (skipped=9, toàn bộ MySQL-gated/middleware-gated có lý do)
```

3. Backend thật (wiring + drift migration):

```
cd backend && DJANGO_ENV=test DB_ENGINE=sqlite DJANGO_SECRET_KEY=<60 ký tự> \
  python manage.py check                          → 0 issues
  python manage.py makemigrations --check --dry-run → "No changes detected" (models ↔ migration khớp)
  python manage.py test family_bridge_features.f16_classroom core accounts -v 1
→ Ran 112 tests — OK (skipped=4)
```

4. Governance:

```
python3 scripts/check_agent_docs.py → "Agent documents OK" (exit 0)
```

Chi tiết case theo suite (71): test_login 11 (shape 3, anti-enumeration 3,
guard 4, scale 1), test_proposals 18 (list 2, confirm 10, decline/cancel 6),
test_settings 9, test_provisioning 11, test_capabilities 6, test_zalo_gate 7
(4 unit + 3 HTTP-mounted), test_deletion 7, test_races_mysql 2 (skip trên
SQLite). Suite đã xanh ngay trong lần chạy đầu của agent này — không có case
nào phải sửa code nghiệp vụ.

## Điểm hợp đồng đã đối chiếu trực tiếp

- CompanionProposal: `open_marker` GeneratedField (db_persist=False) +
  UniqueConstraint không điều kiện `uniq_open_proposal_pair`; migration khớp
  models (`makemigrations --check` sạch).
- Confirm bước 2: membership gate→404 `proposal_not_found`; pre-check open
  invite primary của người xác nhận 2→400 `proposal_blocked_by_open_invite`
  (KHÔNG hủy hộ — có test chứng minh invite còn sống); pre-check connection
  active→400 `already_connected`; MỘT transaction
  create_invite→claim_invite(rate_guard=None — signature f01 cho phép
  None)→inviter_confirm→proposal.invite/status=connected.
- Login: 401 body byte-giống-hệt (test so sánh nguyên response.content) cho
  unknown/wrong/disabled + sai định dạng; dummy-hash timing parity; guard DB
  10 fail/15ph với key acct:/codeh:(HMAC sha256(SECRET_KEY+b"fb-classroom-guard"))/ip:(sha256); throttle_scope `class_login` 200/h pin tường minh.
- change_password: thu hồi session khác (`exclude(token_hash=hash(current_raw_token))`),
  trả `sessions_revoked_other:N`.
- capabilities `zalo` = flag && ZALO_APP_ID && ZALO_APP_SECRET (fail closed).
- auth.py `FBSDSessionAuthentication` dùng per-view `authentication_classes`
  (harness AlwaysChallengeAuthentication không nhảy vào).
- Provisioning: per-row savepoint; fail-closed mật khẩu khởi tạo ở apply mode;
  idempotent theo external_ref (giữ password/tên đã đổi); cặp tồn ở BẤT KỲ
  trạng thái → skip; username `cls_{sanitized[^\w.@+-]→_}`.
- Middleware gate: POST `/api/v1/auth/session` → 503 envelope chính xác +
  `Cache-Control: no-store` khi flag off; default-on không chặn; capabilities
  phản ánh flag.

## Sửa đổi của agent kiểm chứng (so với bản trao）

- `docs/features/f16/api.md`: sửa typo "Class class:" → "Middleware class:".
- `docs/features/f16/test.md`: sửa số case khớp thực tế (ConfirmFlowTests 9→10,
  DeclineCancelTests 5→6, thêm dòng ListTests 2).
- File `docs/features/f16/report.md` này: tạo mới.
- Không sửa code nghiệp vụ nào — suite xanh lần chạy đầu.

## NOT_RUN (trung thực)

- MySQL/TiDB thật: 2 case race (`test_races_mysql.py` — double-confirm 1
  connection, concurrent provisioning) SKIP khi không có `FB_TEST_DB=mysql`;
  SQLite không chứng minh row-lock/unique race.
- Gate HTTP mounted trên harness: harness settings không mount
  `FBZaloDormancyMiddleware` (theo thiết kế) — 3 case HTTP chỉ chạy trên
  backend settings (backend run chứng minh được vì middleware có mount).
- Production migrate/deploy, Render, thiết bị Zalo thật: ngoài phạm vi agent.
- CI trên GitHub: chưa push (yêu cầu task — KHÔNG push); CI sẽ chạy khi PR mở.

## Commit chunks (đã commit local trên main, KHÔNG push)

1. `c968430` feat(f16): dịch vụ đăng nhập lớp, đổi mật khẩu/mã/tên, proposals 2 bước, capabilities, deletion hook
2. `99512b5` feat(f16): lệnh provision_classroom nạp CSV hồ sơ lớp, idempotent và fail-closed
3. `80af5c9` chore(f16): wire registry/settings/throttle class_login, flag FB_ZALO_LOGIN_ENABLED và middleware dormancy Zalo; open_marker NULL theo idiom W036
4. `d07042e` test(f16): 71 case login/guard/proposals/settings/provisioning/capabilities/gate/deletion + race MySQL có điều kiện
5. commit cuối của chính file này — docs(f16): api/test/scope/report + openapi + api-foundation + runbook + project-scope
