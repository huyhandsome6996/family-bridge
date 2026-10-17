# Quyết định của Huy — 18/10/2026: ghép cặp do quản trị cấp

## Văn bản gốc (dịch trung thực từ gói ANTIGRAVITY V2)

> "Khi quản trị viên tạo/cấp tài khoản, hiển thị một cột phụ huynh và một
> cột học sinh. Không bắt hai người phải chờ đồng ý/xác nhận ghép đôi."

Và bổ sung V2: áp dụng cho cả các cặp tài khoản mẫu ĐÃ cấp trong hệ thống —
không để tiếp tục chờ xác nhận hai phía/đa bên; cặp đã active đúng thì giữ
nguyên; không giả chữ ký/timestamp đồng ý; không đặt lại mật khẩu/mã/tên đã
đổi; không mở dữ liệu riêng hay tự đồng ý điều khoản/AI/nghiên cứu.

## Phạm vi ngoại lệ (supersede có điều kiện)

| Hành vi | Luồng tự nguyện (giữ nguyên) | Chế độ quản trị cấp (mới — DEC-24) |
| --- | --- | --- |
| Tạo kết nối | Hai người tự tạo mời → claim → confirm | Admin lưu hàng cặp → ACTIVE ngay |
| Cần xác nhận của HS/PH? | Có, từng phía | KHÔNG (chỉ admin có CAP-23) |
| Ghi consent điều khoản/AI/nghiên cứu | Người dùng tự chọn | KHÔNG BAO GIỜ ghi hộ |
| Mở quyền đọc nội dung riêng | Không | Không (khác gì ghi consent) |
| Thỏa ước gia đình F02 | Hai bên tự xác nhận cùng bản | KHÔNG đổi — vẫn cần hai bên |
| Hủy kết nối | FL-20 revoke | Giữ nguyên; nạp lại danh sách không tự hồi sinh |

Lý do sản phẩm: lớp học cấp tài khoản theo danh sách đã biết trước — ghép
đôi là dữ liệu hành chính, không phải lựa chọn xã hội của hai người dùng.
Người dùng vẫn thấy rõ ai được ghép cùng, vẫn báo sai cặp, vẫn hủy kết nối.

## Những gì KHÔNG bị supersede

- Luồng mời/đề xuất tự nguyện (F01 invites, F16 proposals) — dùng cho ghép
  nối tự nguyện sau này; code giữ nguyên.
- Bất biến riêng tư: admin không đọc nhật ký/tâm sự/tin nhắn; provisioning
  không tạo ShareGrant/MoodShare/JournalShare/ConsentRecord (test A10).
- `Connection` canonical pair + generation + F15 revoke/unlink.
- Không tin is_staff/superuser — chỉ grant `classroom.provision` còn hiệu
  lực với scope lọc THẬT (global hoặc school khớp chính xác class_ref).

## Cơ chế ghi quyết định vào repo

- `docs/product/decision-register.md`: hàng **DEC-24** (ngày, phạm vi,
  nguồn supersede).
- `docs/product/admin-capabilities.md`: hàng **CAP-23** `classroom.provision`.
- `docs/engineering/workflow-rules.md`: hàng **WF-25**.
- Ghi chú dated supersede: `docs/project-scope.md` (bổ sung 16/10/2026),
  `docs/product/workflow-state-machines.md` (FL-02P), access-sharing-matrix
  (hàng ConnectionInvite/Connection), `docs/product/user-flows.md` (FL-02).
- `AGENTS.md`: mục "Admin-provisioned classroom pairs (18 October 2026)"
  ghi quyền push main có phạm vi cho phần A.
