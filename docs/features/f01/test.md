# F01 — Lệnh kiểm tra

## Backend (harness feature-lab, SQLite local)

```bash
bash tests/feature-lab/scripts/test_feature.sh f01_identity
```

Kết quả tại SHA của nhánh này: 48 tests — 46 PASS, 2 SKIPPED (MySQL-gated,
lý do in-line: SQLite không chứng minh row-lock; xem test_race_mysql.py).

## Suite MySQL race (khi có MySQL/MariaDB)

```bash
FB_TEST_DB=mysql FB_MYSQL_HOST=... FB_MYSQL_USER=... FB_MYSQL_PASSWORD=... \
  bash tests/feature-lab/scripts/test_feature.sh f01_identity
```

Hiện trạng: NOT_RUN — không có MySQL server trong môi trường agent.

## Mobile (node)

```bash
node --test "packages/family_bridge_mobile/f01_identity/tests/*.test.mjs"
```

## Danh sách case backend

- identity/session: token hợp lệ → user+session; cùng subject → cùng user;
  wrong-app/expired/malformed provider → từ chối, không tạo token; provider
  network → 503; user disabled → 401; TTL hết → resolver từ chối; revoke →
  token chết; raw token chỉ trả một lần, DB giữ hash; không gắn is_staff.
- auth endpoint: 200 có token; unknown fields (is_staff/role) → 400 kèm tên
  field; logout → revoke thật; token rác → 401 envelope (không 500).
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
- race MySQL (SKIPPED khi không có MySQL): double confirm → đúng 1 connection;
  claim race hai candidate → đúng 1 claimed.
