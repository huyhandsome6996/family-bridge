# Tương thích F02 (nhánh `tinh-nang/f02-dong-hanh-bon-tuan-us036-us044`)

## Nguyên tắc

Task này KHÔNG merge F02 vào main và KHÔNG ghi đè nhánh F02
(head khi kiểm tra: `689531e06a593d39462041329c0581b4ec1b0aba`, PR #39
draft). F02 owner tự nhận hợp đồng mới theo ghi chú dưới đây trên nhánh
của mình.

## F02 đọc Connection thế nào

F02 (provider/connection consumer trên nhánh riêng) đọc kết nối qua
`ConnectionReader`/`ConnectionView` — **không đụng `invite`**. Vì vậy:

- Cặp do admin cấp (mới) hiển thị cho F02 như kết nối active bình thường:
  `active_connection_between()` trả view đầy đủ (`status="active"`,
  `relationship_kind="primary"`, generation).
- Không cần đổi code F02 để "hiểu" nguồn admin — nguồn chỉ mang ý nghĩa
  kiểm toán (`source`, `source_admin`, `source_batch` trên row).

## Điều F02 cần biết (để không phá)

1. **Thỏa ước gia đình vẫn cần hai người xác nhận** — ghép đôi do admin
   cấp KHÔNG đồng nghĩa hai bên đã ký thỏa ước. `FL-15` giữ nguyên: hai
   unique signers tự accept current revision. Đừng tự điền chữ ký.
2. **Consent hộ bị cấm**: provisioning không tạo ConsentRecord — nếu F02
   gate theo consent thì người dùng vẫn được đưa qua consent như cũ.
3. **`Connection.invite` nullable**: nếu nhánh F02 có code giả định
   `connection.invite` không null (ForeignKey raw), sửa thành kiểm tra
   null. Trên main không có consumer nào đọc trực tiếp invite (đã rà).
4. **Reconcile sau backfill**: nếu F02 có cache/hàng đợi theo proposal
   status, chạy lại sau khi backfill apply — proposal cùng cặp đã chuyển
   sang `connected` với `outcome_reason="admin_provisioned"`.

## Patch đề xuất cho F02 (nếu nhánh có đụng invite)

```python
# TRƯỚC (giả định invite luôn có):
invite_code_ref = connection.invite_id
# SAU (an toàn với cả hai nguồn):
invite_code_ref = connection.invite_id  # None với cặp admin-cấp — chấp nhận None
```

Không cần migration thêm cho F02: migration f01 0003 ở main là đủ khi F02
rebase/merge main vào nhánh của mình.
