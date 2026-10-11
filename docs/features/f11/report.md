# Report — F11 Điểm tựa dự phòng (B11)

- Feature ID / nhánh / US: F11 / feat/f11-backup-supporters / US-022, US-035
- Baseline SHA (B00) / head: `cc6ade2f2c1d1760172046f045b3cf8c2d9894d7` / xem commit cuối
- PR: target `chore/full-build-contract-baseline` (URL trong PR list)

## Đã có

- **SupporterRole**: relationship allowlist (family/teacher/counselor),
  scope v1 = listening; partial UNIQUE (student, supporter) khi
  pending/active — mời lại sau declined/revoked được; không tạo bảng
  User/định danh riêng (tái dùng F01).
- **Consent hai bên thật**: invite (student) → pending; CHỈ supporter tự
  accept/decline endpoint của mình (test: student accept hộ → 404);
  accept đặt TTL 90 ngày (DEC-17); decline một chiều; revoke bởi either
  party; không giả định thầy đã nhận lời.
- **Invite connector port**: khi supporter CHƯA kết nối, luồng mời đi qua
  F01 ConnectionInvitation adapter (B18 wiring; chưa wire → role vẫn
  pending nhưng contact bị chặn bởi connection guard — test teacher).
- **Contact = lời nhắn MỚI** qua MessageTransport port: DTO chỉ `body`
  (unknown fields như quoted_letter/journal_page → 400); không sao chép
  thư/nhật ký/AI cũ; không broadcast/family group; idempotency key bắt
  buộc; replay an toàn.
- **Re-verify lúc gửi**: role active + chưa hết TTL (service) + connection
  active generation hiện hành (transport) — revoked/expired/unlink đều
  chặn với lý do trung thực (tests).
- **Chọn điểm tựa khác chủ động**: học sinh thấy trạng thái từng role và
  tự chọn role active khác để soạn request mới — không auto-forward.
- **F13 luôn mở**: mobile hiển thị link Trang tìm trợ giúp kể cả khi
  chưa có điểm tựa (node test).
- **Enumeration protection**: list owner-scoped; stranger/admin list rỗng
  (test); detail participant-only.
- Mobile supporters.js: list trạng thái, invite flow, contact composer,
  help link; textContent mọi nơi; registry F11 routes "".

## Lệnh kiểm tra

```bash
bash tests/feature-lab/scripts/test_feature.sh f11_supporters
node --test packages/family_bridge_mobile/f11_supporters/tests/f11.test.mjs
# Suite rộng:
cd tests/feature-lab && DJANGO_SETTINGS_MODULE=harness.settings \
  DJANGO_ENV=test FB_FEATURES=f11_supporters python manage.py test harness labgrants family_bridge_features.f11_supporters
```

Kết quả: f11 14/14 backend PASS; suite rộng 36/36 PASS (SQLite); mobile
node 3/3 PASS.

## DSA

- Partial UNIQUE index (student, supporter) WHERE status IN
  (pending, active); list index (student/supporter, status); contact là
  1 insert qua transport + 1 role lookup theo pk.

## Security/privacy

- SEC-03/04: owner-scoped lists; participant-only detail; stranger/admin
  enumerate rỗng; consent không thể mượn tay.
- SEC-05: DTO minimal; unknown fields reject (chống dán ngữ cảnh cũ).
- SEC-01: supporter role KHÔNG tự cấp admin/data access (model chỉ là
  quan hệ hỗ trợ; mọi dữ liệu vẫn qua policy riêng).
- TTL + unlink re-check lúc gửi (không cache quyền).

## Kết quả

- PASS: 14 backend f11 + 36/36 harness suite + 3 mobile (SQLite local).
- NOT_RUN: MySQL race invite/accept (không DB).
- BLOCKED: none trong phạm vi module; F01 invite connector + transport
  thật wire ở B18.

## Còn lại / Input cần

- B18: wire F01 invite connector (ensure_backup_connection) và transport
  thật; TTL 90 ngày chờ policy duyệt (DEC-12/17); nối supporters page
  vào navigation; US-022/035 wording chính thức.
