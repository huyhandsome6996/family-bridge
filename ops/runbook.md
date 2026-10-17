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

## Cấp phát cặp HS/PH do quản trị + chuyển đổi cặp đang chờ (F16-A, bổ sung 18/10/2026)

Mới: admin có CAP-23 `classroom.provision` thao tác trên web tại `#/admin-provision`
(bảng hai cột PH trái / HS phải) — lưu là kết nối ACTIVE ngay, không cần hai bên
xác nhận (DEC-24). Provenance ghi `source=admin_provisioned` + admin actor + mã đợt.

Cấp quyền cho admin (thực hiện 1 lần bởi người có `caps.grant`):

```
POST /api/v1/admin/capabilities/grant
{"user_id":"<UUID admin>", "capability":"classroom.provision",
 "scope_type":"global", "ttl_days":180}          # hoặc scope_type:"school", scope_ref:"<class_ref>"
```

Chuyển đổi bộ mẫu đang chờ (100 tài khoản HS001–HS050/PH001–PH050, 50 cặp
proposal còn mở) — chạy TRÊN MÁY CÓ KẾT NỐI DB production (Render backend dùng
TiDB; migrate đã chạy thì mới có bảng mới):

```
# 1) KHO (không ghi) toàn bộ phạm vi:
python manage.py backfill_class_pairs --admin-code <MA_ADMIN> --json
# 2) ÁP DỤNG (bắt buộc batch_ref UUID để idempotent — chạy lại không nhân đôi):
FB_ADMIN_PROVISION_BATCH_REF=$(python -c "import uuid;print(uuid.uuid4())") python manage.py backfill_class_pairs --admin-code <MA_ADMIN>   --batch-ref-env FB_ADMIN_PROVISION_BATCH_REF --apply --json
# Giới hạn 1 lớp: thêm --class-ref <LOP>. Lệnh exit 2 nếu còn lỗi — đọc rows[].
```

Quy tắc trung thực của lệnh/web:
- Chỉ cặp proposal CON MỞ, cả hai tài khoản active mới được chuyển; cặp đã
  revoke/hủy KHÔNG tự hồi sinh (nối lại là hành động admin riêng, generation mới).
- Không đổi mật khẩu/mã/tên đã đổi của tài khoản có sẵn; không ghi consent hộ.
- Web `#/admin-provision` có cùng 2 đường: bảng hai cột (preview → lưu) và
  thẻ "Chuyển cặp đang chờ" (xem danh sách → chuyển). Mọi đợt ghi có mã đợt
  (`batch_ref`) — gửi lại cùng mã trả kết quả đã lưu, không nhân đôi.
- Sau khi chạy: kiểm chứng bằng đăng nhập thật HS/PH (màn chủ + người đồng
  hành) và `GET /api/v1/connections` của từng phía; đối chiếu số before/after
  trong kết quả JSON (không tạo/xóa tài khoản để ép số).
