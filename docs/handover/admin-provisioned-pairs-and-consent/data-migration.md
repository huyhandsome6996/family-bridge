# Dữ liệu & migration: DDL tách khỏi dữ liệu, rollout không phá hủy

## Nguyên tắc

**Migration (DDL) không tự kích hoạt hàng production nào.** Hai migration
mới chỉ thêm cấu trúc; việc chuyển đổi cặp là một thao tác dữ liệu RIÊNG,
có dry-run + batch_ref, chạy sau khi deploy schema (theo runbook Render:
migrate thủ công trước deploy backend đổi schema).

## Migration 1 — `f01_identity/migrations/0003_connection_admin_provenance`

| Thay đổi | Chi tiết | Rủi ro |
| --- | --- | --- |
| `Connection.invite` → nullable | Kết nối admin-cấp không có invite; luồng mời vẫn set invite thật | Mọi consumer đọc qua `ConnectionView` (không có invite) — đã rà toàn bộ; test f01 vẫn xanh |
| + `source` (default `user_invite`) | Phân biệt nguồn kết nối | Backfill mặc định an toàn cho dữ liệu cũ |
| + `source_admin`, `source_batch` | Provenance admin actor + mã đợt | Chuỗi, nullable — không FK chéo app |

Đã kiểm: `manage.py makemigrations --check --dry-run` sạch; SQLite migrate
+ 50 test backend OK. MySQL/TiDB: migration chỉ AlterField/AddField đơn
giản (không đổi constraint, không đụng unique `uniq_active_pair`) —
**NOT_RUN trên TiDB thật** (chờ owner chạy migrate theo runbook; sẽ được
thực hiện trong đợt deploy backend có kiểm soát).

## Migration 2 — `f16_classroom/migrations/0002_admin_pairs_f16`

Tạo bảng `f16_classroom.PairProvisionBatch` (batch_ref unique, admin_id,
class_ref, mode, summary JSON, created_at). Bảng mới — không đụng bảng cũ.

Lưu ý phiên bản: PR #34 (W036, đang mở) cũng có migration `0002` cho
f01/f09/f11/admin_core. Migration của task này đặt tên `0003` cho f01 để
không trùng tiền tố; khi #34 merge sau, hai nhánh không đụng file nhau
(đã kiểm patch #34: sửa vùng khác trong models.py).

## Dữ liệu: chuyển đổi cặp mẫu đang chờ

- **Không** `UPDATE ... SET status='active'` hàng loạt. Mỗi cặp đi qua
  `_create_admin_connection` (canonical pair, generation, provenance) +
  đóng proposal cùng cặp với `outcome_reason="admin_provisioned"`;
  `first_confirmed_*` giữ NULL (không giả chữ ký người dùng).
- Dry-run (inventory) liệt kê: đủ điều kiện / bị chặn / đã active. Apply
  chỉ chạm cặp đủ điều kiện; cặp revoked/khóa được tách báo cáo.
- Idempotent: chạy lại cùng `batch_ref` → replay kết quả đã lưu; chạy batch
  mới trên dữ liệu đã chuyển → `already_active`, không nhân đôi.
- Không tạo/xóa tài khoản để ép số 100/50; số lệch được báo trung thực.

## Quy trình deploy an toàn (production)

1. Merge code vào main → CI xanh (tests, agent-docs, web build).
2. Owner chạy `manage.py migrate` trên DB production (TiDB) từ máy có
   quyền — trước khi deploy backend có schema change (render autoDeploy
   backend đang OFF — deploy backend có kiểm soát).
3. Chạy `backfill_class_pairs` dry-run → xem JSON → apply với batch_ref.
4. Đăng nhập thử HS/PH thật + đối chiếu số before/after.
5. Rollback: không có migrate-down tự động trong runbook này; migration
   additive (nullable + bảng mới) an toàn khi để nguyên — dùng lại trạng
   thái cũ chỉ cần thu hồi grant `classroom.provision` (ngắt quyền tạo mới)
   và không chạy thêm apply. Không drop bảng/xóa cột trên production.
