# Runbook vận hành (B17) — KHÔNG tự chạy cloud/production

## Backup / Restore (US-018)

- `ops/backup/backup.sh` — mysqldump single-transaction; secrets qua env
  out-of-band; kiểm tra kích thước tối thiểu; exit non-zero khi lỗi.
- `ops/backup/verify_restore.sh` — rehearsal CHỈ vào DB cô lập (từ chối
  tên nhìn như production); sau restore PHẢI replay deletion/revocation
  ledger (F15/B18) trước khi phục vụ — raw restore không hồi sinh quyền
  đã thu hồi.
- **PENDING duyệt**: RPO/RTO mục tiêu, cadence, owner, storage mã hóa và
  key ownership (DEC-12 mở) — script không tự chạy cloud.

## Env hardening

- `ops/env_check.py` — kiểm tra presence/shape (DEBUG=False, secret
  strength, https CORS, least-privilege DB user, Zalo env) KHÔNG in giá
  trị secret. Chạy trong CI + trước deploy.

## CI least-privilege

- `ops/ci/tests.yml`: READY-TO-INSTALL template (`permissions:
  contents: read`; KHÔNG dùng `pull_request_target` với secrets).
  **Cài đặt**: copy vào `.github/workflows/tests.yml` bởi người có token
  `workflow` scope (PAT hiện tại của lead KHÔNG đủ scope — push bị
  GitHub từ chối ngày 11/10/2026); sau đó pin actions theo full commit
  SHA trước khi guard production.

## Bounded purge (task dọn dẹp)

- Nguyên tắc: mọi purge PHẢI có `--dry-run` mặc định, phạm vi chặn
  (bounded), status output; KHÔNG scheduler tự gửi nháp/tâm sự. Tooling
  chi tiết sẽ ghép với deletion hooks F15 ở B18.

## US-019 — notification ngoài app (nghiên cứu, conditionally disabled)

- Xem `docs/operations/zalo-notification-research.md`: chỉ nghiên cứu +
  adapter/feature gate; KHÔNG fake push; KHÔNG chặn hộp thư nội bộ.

## US-051 — hồ sơ kỹ thuật Zalo

- Xem `docs/operations/zalo-submission-dossier-checklist.md`: inventory
  quyền/nguồn + release checklist; KHÔNG tự submit.

## Cấp tài khoản lớp HS/PH (F16, bổ sung 16/10/2026)

- Chuẩn bị CSV tài khoản (header bắt buộc:
  `external_ref,login_code,role,class_ref,display_name`; login_code dạng
  HS001–HS050/PH001–PH050, chuẩn hóa UPPERCASE) và CSV cặp đề xuất
  (`student_login_code,caregiver_login_code`) hoặc dùng
  `--auto-pair-by-index` (HS{n} ↔ PH{n}).
- **Mật khẩu khởi tạo chung PHÁT NGOÀI KÊNH RIÊNG** (in giấy/trao đổi trực
  tiếp với lớp): đặt biến môi trường `FB_CLASS_INITIAL_PASSWORD` trong phiên
  chạy lệnh — KHÔNG truyền mật khẩu qua đối số dòng lệnh, KHÔNG commit giá
  trị, KHÔNG log. Lệnh fail-closed: thiếu biến/quá ngắn (<8) → không ghi gì.
- Dry-run trước (không ghi DB, in dự kiến tạo bao nhiêu):
  `python manage.py provision_classroom --csv accounts.csv --proposals-csv pairs.csv --dry-run --json`
- Apply (idempotent theo external_ref; chạy lại file giống hệt không tạo
  thêm, không đổi mật khẩu đã cấp):
  `FB_CLASS_INITIAL_PASSWORD=... python manage.py provision_classroom --csv accounts.csv --proposals-csv pairs.csv --json`
- Cặp đã tồn ở BẤT KỲ trạng thái (proposed/awaiting/connected/declined/
  canceled) → skip, không bao giờ hồi sinh proposal đã declined/canceled.
- Khi tắt đăng nhập Zalo (dormancy): đặt `FB_ZALO_LOGIN_ENABLED=false` ở env
  backend → `POST /api/v1/auth/session` trả 503
  `module_unavailable/zalo_login_disabled`, đăng nhập lớp
  (`/auth/class-session`) và mọi endpoint khác giữ nguyên.
- Guard đăng nhập: 10 lần sai/15 phút theo tài khoản + mã (HMAC) + IP; khóa
  tự mở sau cửa sổ 15 phút. Purge định kỳ `LoginAttempt` cũ hơn 30 ngày là
  việc cleanup theo chu kỳ (task dọn dẹp), không xóa theo user.
