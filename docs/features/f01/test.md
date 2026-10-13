# F01 — Lệnh kiểm tra

## Backend (harness feature-lab, SQLite local)

```bash
bash tests/feature-lab/scripts/test_feature.sh f01_identity
# hoặc trực tiếp:
cd tests/feature-lab && DJANGO_SETTINGS_MODULE=harness.settings DJANGO_ENV=test \
  FB_FEATURES=f01_identity PYTHONPATH=. python manage.py test family_bridge_features.f01_identity
```

Kết quả tại nhánh này (sau đợt sửa review PR #26): **88 tests — 84 PASS,
4 SKIPPED** (MySQL-gated, lý do in-line: SQLite không chứng minh row-lock/
unique race; xem test_race_mysql.py). Skip KHÔNG được tính là PASS.

## Suite MySQL race (khi có MySQL/MariaDB)

```bash
FB_TEST_DB=mysql FB_MYSQL_HOST=... FB_MYSQL_USER=... FB_MYSQL_PASSWORD=... \
  bash tests/feature-lab/scripts/test_feature.sh f01_identity
```

Hiện trạng: đã ĐƯỢC NỐI VÀO CI — job `mysql-checks`
(.github/workflows/backend-foundation.yml) chạy cả 4 test race trên service
container mysql:8.4 (2 confirm/claim race + 2 concurrent login: cùng
identity/user, không user mồ côi, không 500). Kết quả từng head xem trên
GitHub Actions; môi trường agent local không có MySQL server (chưa chạy local).
TiDB trên Render KHÔNG được thay thế bằng kết quả mysql:8.4 khi báo cáo.

## Frontend (zalo-mini-app)

```bash
cd zalo-mini-app && npm test        # 149/149 pass tại nhánh này (39 test f01-flows)
npm run build                       # build + verify app-config
```

Test frontend dùng payload đúng shape API thật (invite_id/role/revision/
counterpart{display_name, identity_basis}); không có field chỉ tồn tại trong
mock được dùng làm bằng chứng tích hợp.

## Phân tầng bằng chứng (bắt buộc khi báo cáo)

| Môi trường | Chứng minh được | Không chứng minh được |
|---|---|---|
| SQLite (feature-lab) | logic, error mapping, view enrichment, session generation, UI state | row-lock/unique race, charset MySQL |
| MySQL CI 8.4 (mysql-checks) | migration thật + 4 race test trên MySQL thật | hành vi TiDB (Render) |
| TiDB (Render) | smoke health/ready | race semantics — cần quan sát khi chạy thật |
| Thiết bị Zalo | SDK getAccessToken, token thật, webview | chưa chạy — theo two-account-script.md |

## Danh sách case backend

- identity/session: token hợp lệ → user+session; cùng subject → cùng user;
  wrong-app/expired/malformed provider → từ chối, không tạo token; provider
  network → 503; user disabled → 401; TTL hết → resolver từ chối; revoke →
  token chết; raw token chỉ trả một lần, DB giữ hash; không gắn is_staff.
- auth endpoint: 200 có token; unknown fields (is_staff/role) → 400 kèm tên
  field; logout → revoke thật; token rác → 401 envelope (không 500).
- transport provider (mới, đợt review): URLError (DNS/refused/reset), wrapped
  + bare socket.timeout, TimeoutError, OSError, HTTPError không có JSON body
  → 503 temporarily_unavailable/provider_unreachable; qua E2E login → 503
  envelope, KHÔNG token/KHÔNG ProviderIdentity/KHÔNG User; lỗi lập trình
  (ValueError/InputInvalid) KHÔNG bị che; transport mặc định test qua
  OpenerDirector thật (mock.open).
- display identity (mới, đợt review): GET/PUT /auth/me — display_name 1..80,
  trim, collapse space, unknown fields → 400, identity_basis=self_declared;
  counterpart theo đúng góc nhìn caller, không UUID/provider_subject; batch
  1 query; preview read-only (không đổi state, cùng budget rate limit, cùng
  mã lỗi anti-enumeration, self-connect/already_connected như claim).
- consent: ghi nhận theo purpose; research declined vẫn dùng app; version
  mới không tự accept; withdrawal giữ row; purpose lạ → 400.
- invites: code hash at rest + trả một lần; TTL 7 ngày (delta 1s); tạo invite
  mới hủy invite mở cùng kind; claim gắn candidate + revision++ + idempotent
  với cùng candidate; candidate thứ hai bị chặn (single-use); self-connect
  chặn; mã sai/hết hạn → 404 chung không leak; rate guard DB 30/giờ → 429.
- confirm: kích hoạt generation 1, canonical pair; confirm trước claim → 400;
  stranger (kể cả admin actor) → 404; expected_revision cũ → 409; double
  confirm → 400 + đúng 1 connection; pair đã active → already_connected.
- lifecycle: decline/cancel đúng actor; stranger decline → 404; mã hết hạn
  không claim; revoke idempotent; reconnect → generation 2; ConnectionReader
  port trả view đúng.
- API: flow hai bên qua HTTP; stranger list rỗng; 401 envelope khi không auth;
  kind sai → 400; 30 claim sai → 429; revoke xong list rỗng; mass assignment
  claim → 400; UUID sai → 400/404.
- race MySQL (4 test, SKIP khi không có MySQL): double confirm → đúng 1
  connection; claim race hai candidate → đúng 1 claimed; concurrent FIRST
  login → cả hai ok, 1 identity/1 user, không mồ côi, không 500; concurrent
  relogin identity có sẵn → cùng user, không duplicate identity.
