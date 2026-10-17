# Hợp đồng API F16-A (cấp phát cặp do quản trị)

Nguồn chính thức: `docs/contracts/api-foundation.md` mục F16-A + OpenAPI
(`docs/contracts/openapi.yaml`, tag `x-owner-feature: F16`). Trang này tóm
tắt cho người đọc nhanh.

## Auth/authz (mọi endpoint)

- Bearer session (`FBSDSessionAuthentication`), lỗi 401 envelope chuẩn.
- Capability `classroom.provision` (CAP-23) với **scope lọc thật**:
  - không có grant nào → **404** `not_found` (bề mặt không tồn tại — không
    phân biệt, giống admin_core);
  - grant `global` → mọi class_ref;
  - grant `school` + `scope_ref=X` → chỉ class_ref == X; khác → **403**
    `class_out_of_scope`.
- Rate: throttle user mặc định (120/phút); bounds server: rows ≤ 50/đợt,
  body ≤ 64 KiB, tên ≤ 80, external_ref ≤ 128.

## Endpoint

| Method | Path | Ghi chú |
| --- | --- | --- |
| GET | `/api/v1/classroom/admin/classes` | `{results:[{class_ref, students, caregivers, pending_proposals}]}` trong scope |
| POST | `/api/v1/classroom/admin/pairs-preview` | Body `{class_ref, rows[≤50], initial_password?}`; CHỈ ĐỌC |
| POST | `/api/v1/classroom/admin/pairs-apply` | Body thêm `batch_ref` (UUID); Connection ACTIVE ngay |
| GET | `/api/v1/classroom/admin/backfill-inventory` | Query `class_ref?`; kho cặp chờ |
| POST | `/api/v1/classroom/admin/backfill-apply` | Body `{class_ref?, batch_ref}`; chuyển cặp chờ |

## Hàng cặp (row) — đầu vào

```json
{
  "caregiver_code": "PH001", "student_code": "HS001",
  "caregiver_name": "Phụ huynh mẫu 001", "student_name": "Học sinh mẫu 001",
  "caregiver_external_ref": "SYNTHETIC-ONLY-PH001", "student_external_ref": "SYNTHETIC-ONLY-HS001",
  "allow_reconnect": false
}
```

- `_name` bắt buộc cho phía TẠO MỚI; tài khoản có sẵn được tìm theo
  `login_code` (UPPERCASE, `^[A-Z0-9]{3,16}$`) và phải đúng vai.
- `allow_reconnect=true` chỉ có ý nghĩa với cặp đã revoke.

## Trạng thái hàng — đầu ra

- Preview: `will_connect` | `will_create_accounts_and_connect` |
  `pair_already_active` | `pending_proposal_will_close_and_connect` |
  `pair_revoked` | `pair_revoked_reconnectable` | `error` (+`problems[]`).
- Apply: `connected` | `already_active` | `reconnected` | `error`
  (+`connection_id`, `generation`, `source` khi thành công).

## Idempotency

- `batch_ref` UUID do caller tạo. Trùng mã → trả `summary` ĐÃ LƯU với
  `replayed:true`, `batch_id` — không xử lý lại, không nhân đôi.
- Apply validate TOÀN BỘ trước; có hàng lỗi → `wrote:false`, không ghi gì.
  Sau khi qua validate: ghi theo savepoint từng hàng (lỗi bất ngờ 1 hàng
  không chặn các hàng khác, được báo chính xác theo hàng).

## Lỗi riêng

| Mã | HTTP | Ý nghĩa |
| --- | --- | --- |
| `class_out_of_scope` | 403 | Grant school không khớp class_ref |
| `not_found` | 404 | Không có grant `classroom.provision` |
| `invalid_batch_ref` / `invalid_class_ref` / `too_many_rows` | 400 | Đầu vào |
| `initial_password_required_for_new_accounts` | per-row (preview/apply) | Có phía tạo mới nhưng thiếu mật khẩu ≥8 |
| `pair_revoked_reconnect_requires_allow_reconnect` | per-row | Cặp revoked, chưa tick chủ ý |
| `weak_password` | 400 | Mật khẩu khởi tạo < 8 ký tự |

## Tương thích

- Không đổi endpoint/thông tin hợp đồng cũ nào (F01/F16 hiện có giữ nguyên;
  thêm 5 endpoint + 5 method adapter `admin*` — purely additive).
- `ConnectionView` không thêm trường — consumer cũ không đổi.
- Mock adapter có đủ 5 method để UI chạy demo (`?demo=1`) mà không đụng API.
