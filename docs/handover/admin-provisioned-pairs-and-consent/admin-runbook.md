# Runbook admin: bảng hai cột, dry-run, backfill, kết nối lại

## 1. Cấp quyền cho admin (một lần, do người có `caps.grant` thực hiện)

```
POST /api/v1/admin/capabilities/grant
Authorization: Bearer <session của người cấp>
{"user_id": "<UUID admin>", "capability": "classroom.provision",
 "scope_type": "global", "ttl_days": 180}
```

- `scope_type:"global"` → quản trị mọi lớp.
- `scope_type:"school", scope_ref:"<class_ref>"` → chỉ lớp đó (lọc thật).
- Thu hồi: `POST /api/v1/admin/capabilities/<grant_id>/revoke` với reason ≥10 ký tự.

## 2. Màn web hai cột `#/admin-provision`

Luôn theo thứ tự: **(1)** chọn lớp → **(2)** nhập bảng cặp (PH trái, HS
phải, tối đa 50 hàng/lần) → **(3)** mật khẩu khởi tạo (chỉ cần khi có tài
khoản tạo mới) → **"Kiểm tra trước khi cấp"** → đọc kết quả từng hàng →
**"Cấp tài khoản và kết nối"** → xác nhận → đọc kết quả từng hàng.

Kết quả xem trước theo hàng:

| Trạng thái | Ý nghĩa |
| --- | --- |
| Sẽ kết nối | Hai tài khoản đã có, chưa nối → lưu sẽ nối |
| Sẽ tạo tài khoản mới và kết nối | Tạo HS/PH rồi nối (cần mật khẩu khởi tạo) |
| Đã kết nối từ trước — giữ nguyên | Không làm gì cả |
| Có đề xuất đang chờ — sẽ đóng và kết nối | Proposal mở cùng cặp được đóng `admin_provisioned` |
| Đã hủy kết nối trước đó — không tự nối lại | Lỗi màu đỏ; muốn nối lại phải tick "cho phép nối lại" (xem §4) |
| Hàng không hợp lệ | Đỏ kèm mã lỗi (`*_code_role_mismatch`, `*_account_inactive`, `*_account_out_of_scope`, `same_account`, `*_name_required_for_new_account`, ...) |

Hàng lỗi → SỬA TRÊN FORM rồi kiểm tra lại; lỗi validate → KHÔNG ghi gì.
Khi lưu: mỗi hàng có kết quả riêng từ máy chủ (`connected` / `already_active`
/ `reconnected` / `error`) — không bao giờ hiện xanh cho hàng thất bại.

## 3. Chuyển cặp đang chờ thành kết nối (backfill)

Trên web: thẻ **"4. Chuyển cặp đang chờ thành kết nối hoạt động"** →
"Xem danh sách chờ" (số liệu + danh sách) → "Chuyển thành kết nối" → xác nhận.

Bằng dòng lệnh (máy có kết nối DB production):

```
# KHO (không ghi):
python manage.py backfill_class_pairs --admin-code <MA_ADMIN> --json
# ÁP DỤNG (idempotent theo batch_ref):
FB_ADMIN_PROVISION_BATCH_REF=$(python -c "import uuid;print(uuid.uuid4())") \
python manage.py backfill_class_pairs --admin-code <MA_ADMIN> \
  --batch-ref-env FB_ADMIN_PROVISION_BATCH_REF --apply --json
# Giới hạn một lớp: thêm --class-ref <LOP>
```

Kết quả trả: `activated`, `already_active`, `blocked`, `errors` + `rows[]`
theo từng cặp. Cặp bị chặn (tài khoản khóa/đã revoke) được liệt kê, KHÔNG
bị đụng tới. Sau apply: đăng nhập thử HS/PH và xem `GET /api/v1/connections`.

## 4. Kết nối lại sau khi người dùng hủy (unlink)

Không bao giờ tự hồi sinh. Để nối lại một cách CÓ CHỦ Ý: trên bảng hai cột,
nhập lại hàng cặp và tick **"cho phép nối lại"** (`allow_reconnect`) →
preview hiển thị "sẽ nối lại (generation mới)" → lưu → Connection mới
generation+1; bản cũ vẫn revoked; các grant cũ KHÔNG sống lại (người dùng
phải chia sẻ lại nếu muốn).

## 5. Bảo mật vận hành

- Mật khẩu khởi tạo: chỉ nhập trong form khi tạo tài khoản mới, phát cho
  người dùng qua kênh riêng; không ghi vào log/CSV/audit (máy chủ không trả
  lại trong response nào).
- Mọi đợt ghi có mã đợt + một bản ghi audit (`classroom.provision`,
  `batch:<ref>`, số liệu tổng hợp — không có nội dung riêng).
- Sai cặp do người dùng báo: admin tra cứu `already_active`/danh sách lớp,
  thu hồi kết nối theo đúng luồng hủy hiện có, rồi nối lại đúng cặp nếu cần.
