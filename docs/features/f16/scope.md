# F16 scope — Đăng nhập lớp HS/PH và đề xuất kết nối hai chiều

## Phạm vi

- Tài khoản lớp `ClassAccount` (OneToOne auth user): mã đăng nhập lớp
  HS001–HS050/PH001–PH050 (chuẩn hóa UPPERCASE, unique), role student/
  caregiver, class_ref, external_ref (idempotency key của provisioning).
- Đăng nhập `POST /api/v1/auth/class-session` bằng mã + mật khẩu; phiên do
  cơ chế Session của F01 phát (hash SHA-256, TTL, revoke) — F16 không tự
  phát token.
- Cài đặt có re-auth bằng mật khẩu hiện tại: đổi mật khẩu (thu hồi phiên
  khác, giữ phiên hiện tại), đổi mã đăng nhập, đặt tên gọi tự khai báo
  (tái dùng display của F01).
- Đề xuất kết nối `CompanionProposal` hai chiều HS↔PH: list (chỉ của mình),
  confirm 2 bước, decline (refused|wrong_pair), cancel. Bước 2 tạo invite +
  connection qua `InviteService` của F01 trong CÙNG transaction.
- Provisioning quản trị: `manage.py provision_classroom` (CSV, dry-run,
  idempotent theo external_ref, fail-closed mật khẩu khởi tạo qua env).
- Deletion hook (F15): xóa CompanionProposal/ClassAccount/LoginAttempt
  theo user; đăng ký category "account" + "connections".
- Zalo dormancy: env `FB_ZALO_LOGIN_ENABLED` (default true) — khi tắt,
  middleware trả 503 cho `POST /api/v1/auth/session` (KHÔNG sửa f01 api.py,
  nhánh đó đang bị lock bởi PR #33); capabilities trả `zalo=false`.

## Ranh giới — KHÔNG làm

- Không ép đổi mật khẩu lần đầu (mật khẩu khởi tạo phát kênh riêng, không
  phải mật khẩu tạm — payload login không có `must_change_password`).
- Không tự liên kết tài khoản lớp với Zalo; không dùng zalo_id của lớp.
- Không sửa models/services của F01 (chỉ import); không tạo role mới trên
  auth user (role nằm trên ClassAccount).
- Không gửi SMS/email/token qua kênh số nào cả — phát mật khẩu là quy trình
  ngoài hệ thống (runbook).
- Không auto-confirm đề xuất; hai bên tự xác nhận.
- **Cập nhật 18/10/2026 (DEC-24):** NGOẠI LỆ cho chế độ cấp phát của quản trị — admin có CAP-23 `classroom.provision` (scope lọc thật) tạo Connection ACTIVE ngay qua `services/admin_provision.py` + 5 endpoint `classroom/admin/*` + lệnh `backfill_class_pairs`; provenance `source=admin_provisioned`/`source_admin`/`source_batch` (f01 Connection 0003). Mệnh đề "không auto-confirm" ở trên tiếp tục ÁP DỤNG cho luồng đề xuất tự nguyện hai bên.

## Dependencies

- F01: Session (issue/resolve/revoke), InviteService (create/claim/confirm),
  ConsentRecord + has_active_consent, display service.
- F15: deletion registry (hook đăng ký ở app.ready khi f15 có trong build).
