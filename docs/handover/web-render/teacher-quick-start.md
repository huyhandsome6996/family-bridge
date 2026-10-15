# Teacher Quick Start — web Family Bridge (Task 2, Render)

Dành cho giáo viên phụ trách lớp dùng Family Bridge bản web
(`https://family-bridge-web.onrender.com` sau khi owner apply Blueprint — xem
`web-render-deployment.md`). Đây là bản web desktop của cùng ứng dụng Zalo.

## 1. Luồng giáo viên từng bước

1. **Nhận mã HS/PH**: mã đăng nhập lớp học do hệ thống provision (Task 1,
   `manage.py provision_classroom`). Mỗi học sinh một mã `HS…`, người chăm sóc
   tương ứng `PH…`; mật khẩu ban đầu do lớp cấp. **Không phát mã qua kênh
   công khai.**
2. **Đăng nhập web**: mở `#/login` → nhập mã tài khoản + mật khẩu. Nếu trang
   báo "máy chủ có thể đang khởi động" — đợi khoảng **1 phút** rồi thử lại
   (Render free tier cold start).
3. **Đồng ý dịch vụ**: lần đầu đăng nhập sẽ gặp trang Đồng ý (`#/consent`).
   "Điều khoản sử dụng" bắt buộc để dùng app; AI gợi ý và Nghiên cứu là tùy
   chọn, không đồng ý vẫn dùng được. Đăng nhập không bao giờ tự hiểu là đồng ý.
4. **Xác nhận ghép đôi** (`#/proposal`): đề xuất ghép đôi HS–PH hiện ở đây.
   Cả hai bên đều bấm xác nhận thì kết nối mới hoạt động. Sai cặp → dùng
   "Từ chối" và chọn lý do.
5. **Thẻ / tín hiệu / hộp thư** (sau khi ghép đôi):
   - `#/cards` — thư viện thẻ cảm xúc; gửi phải qua xem trước + xác nhận cuối.
   - `#/signal` — tín hiệu "cần được lắng nghe" với 3 nhu cầu có sẵn.
   - `#/mailbox` — hộp thư trao đổi; danh sách chỉ tiêu đề, mở từng thư để đọc.
6. **Đổi mật khẩu / đổi mã tại Cài đặt** (`#/settings`):
   - Đổi **mật khẩu** cần mật khẩu hiện tại; đổi xong các phiên khác bị đăng
     xuất (số phiên do máy chủ báo).
   - Đổi **mã đăng nhập** cần mật khẩu hiện tại; mã mới 4–32 chữ cái/số.
   - Đổi **tên hiển thị** không cần mật khẩu.
7. **Đăng xuất** ở cuối trang Cài đặt — phiên trên thiết bị này bị thu hồi.

## 2. Hỗ trợ riêng tư cho học sinh

- `#/privacy` — học sinh tự xem "đang chia sẻ với ai", thu hồi từng mục, gửi
  yêu cầu xóa dữ liệu, rút đồng ý. Giáo viên không mở được nội dung riêng tư
  của học sinh; yêu cầu xóa do máy chủ xử lý theo quy trình (US-017).
- Thu hồi chỉ chặn lần đọc mới; bản sao ngoài ứng dụng không thu hồi được —
  nói rõ với học sinh khi hướng dẫn.

## 3. Troubleshooting

| Hiện tượng | Nguyên nhân & cách xử lý |
| --- | --- |
| Trang vào chậm / "máy chủ có thể đang khởi động" | Cold start Render free ~1 phút. Đợi rồi thử lại; không bấm gửi lặp. |
| "Mã tài khoản hoặc mật khẩu chưa đúng" | Kiểm tra mã `HS…/PH…` và mật khẩu. Sai nhiều lần sẽ bị chặn tạm ~15 phút (máy chủ quyết). Liên hệ quản trị lớp nếu mất mã. |
| Thao tác báo "xung đột 409" / "trạng thái vừa thay đổi" | Hai nơi cùng đổi trạng thái (ví dụ xác nhận ghép đôi đồng thời). **Tải lại trang** để lấy trạng thái mới nhất rồi thao tác lại. |
| "Tính năng chưa được bật trên máy chủ" (Cài đặt) | Máy chủ của đợt này chưa bật đổi mật khẩu/mã — liên hệ owner, không thử lặp lại. |
| Lỗi mạng khi gửi thư/thẻ | KẾT QUẢ CHƯA XÁC ĐỊNH — kiểm tra Hộp thư người nhận trước khi gửi lại; dùng nút "Kiểm tra trạng thái gửi" nếu có. |

## 4. Điều cần biết

- Không có "đã xem thư" hai chiều — không ai biết ai đã mở thư nào.
- Không thu hồi được ảnh chụp màn hình bên ngoài app.
- Trạng thái yêu cầu xóa dữ liệu luôn phản ánh thật: chưa xong sẽ ghi rõ
  "Cần xử lý thêm", không bao giờ báo "hoàn tất" sớm.
