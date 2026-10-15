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
- Mobile supporters.js: list trạng thái, invite flow, contact composer với nút Hủy,
  lời mời làm điểm tựa (commitments: nhận lời / từ chối), dừng đồng hành (revoke);
  help link; textContent mọi nơi; registry F11 routes "".

## Lệnh kiểm tra

```bash
bash tests/feature-lab/scripts/test_feature.sh f11_supporters
node --test packages/family_bridge_mobile/f11_supporters/tests/f11.test.mjs
# Suite rộng:
cd tests/feature-lab && DJANGO_SETTINGS_MODULE=harness.settings \
  DJANGO_ENV=test FB_FEATURES=f11_supporters python manage.py test harness labgrants family_bridge_features.f11_supporters
```

Kết quả: f11 20/20 backend PASS; suite rộng 44/44 PASS (SQLite); mobile
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

## Kết quả (kết quả test case QA đã thu thập)

- Backend F11: 20/20 PASS (SQLite) — invite/consent TTL, decline one-way,
  self-invite & invalid kind (400), duplicate idempotent, teacher not
  connected (403 transport guard), contact new text via transport,
  replay same key (1 send), revoked/expired/unlink blocked,
  DTO rejects old-context fields (400), enumeration protection (stranger/
  admin list rỗng), transport unwired (503), unauthenticated (401),
  revoke by either party (200) / stranger (404), commitments owner-scoped,
  alternate supporter selection with no auto-forward,
  supporter cannot initiate reverse contact (404 / TC-F11-AUTH-01),
  supporter role grants zero admin permissions (TC-F11-NEG-05).
- Mobile F11 (node): 3/3 PASS — API wrappers hit contract paths with
  idempotency key + DTO only `body`; page module exports createPage;
  wording "chờ người đó tự đồng ý"/"không đính kèm thư", help link
  `#/help`, cancel button, dừng đồng hành, commitments list presenti trong
  source (textContent, không innerHTML).
- QA suite (zalo-mini-app/tests/): qa-secrets-privacy, qa-router,
  qa-no-auto-send, qa-demo-isolation — quét `zalo-mini-app/src/`;
  không secret, không localStorage.setItem, sessionStorage chỉ role,
  hash-based routing + not-found + role guard, không setInterval /
  auto-send / "Đã gửi" claim, demo chỉ bật qua ?demo=1|true, zalo adapter
  ném 501.
- NOT_RUN: MySQL race invite/accept (không DB trong môi trường này).
- BLOCKED: none trong phạm vi module F11; F01 invite connector +
  transport thật wire ở B18 (chờ tích hợp, không chặn F11 module).

## Còn lại / Input cần

- B18: wire F01 invite connector (ensure_backup_connection) và transport
  thật; TTL 90 ngày chờ policy duyệt (DEC-12/17); nối supporters page
  vào navigation; US-022/035 wording chính thức.

