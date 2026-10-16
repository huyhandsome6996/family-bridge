# Hướng dẫn Kiểm thử Bản phát hành Zalo Mini App cho Huy & Đồng nghiệp

Dành cho: Huy và các cộng tác viên tham gia trải nghiệm đợt thử nghiệm Family Bridge.
Môi trường: Zalo Mini App (Zalo trên điện thoại di động).

---

## 1. Cách mở Mini App

- **Cách 1 (Quét QR):** Dùng ứng dụng Zalo trên điện thoại quét mã QR phiên bản Testing mới nhất (xem mã QR ở cuối báo cáo hoặc trên Console).
- **Cách 2 (Mở đường dẫn trực tiếp):** Nhấp vào liên kết sau trong Zalo:
  👉 **https://zalo.me/s/3411096375330044972/**

---

## 2. Các Bước Kiểm thử Luồng Đăng nhập Mới

### Bước 1: Mở ứng dụng và kiểm tra màn hình Giới thiệu
- Khi Mini App mở lên, ứng dụng sẽ vào trang Giới thiệu (`#/welcome`).
- Nhìn nút bấm chính: Nút hiển thị **"Tiếp tục để đăng nhập"** (thay vì nút Zalo cũ).
- Bấm vào nút này để chuyển tới màn hình Đăng nhập (`#/login`).

### Bước 2: Xác nhận Form Đăng nhập HS/PH
- Màn hình đăng nhập sẽ hiển thị:
  - Form gồm 2 ô nhập: **Mã tài khoản** (ví dụ: `HS001`, `PH001`) và **Mật khẩu**.
  - Nút con mắt để ẩn/hiện mật khẩu.
  - Nút bấm: **"Đăng nhập vào không gian"**.
- **Tiêu chuẩn đạt:** Hoàn toàn **KHÔNG CÒN** nút "Đăng nhập bằng Zalo" nào xuất hiện trên màn hình.

### Bước 3: Đăng nhập bằng Tài khoản Thử nghiệm
Nhập một trong các tài khoản trong cơ sở dữ liệu mẫu:
- **Tài khoản Học sinh:**
  - Mã: `HS001` (hoặc `HS002`, `HS003`, ..., `HS050`)
  - Mật khẩu: `matkhau123` (hoặc mật khẩu do giáo viên/quản trị viên cấu hình)
- **Tài khoản Phụ huynh:**
  - Mã: `PH001` (hoặc `PH002`, ..., `PH050`)
  - Mật khẩu: `matkhau123`

Bấm **"Đăng nhập vào không gian"**.

> **Lưu ý máy chủ Render:** Nếu máy chủ backend vừa thức dậy sau thời gian chờ (cold-start), lần gửi đầu tiên có thể mất từ 20–40 giây. Form sẽ hiển thị trạng thái "Đang xác thực…" và chuyển trang an toàn sau khi máy chủ phản hồi.

### Bước 4: Kiểm tra Màn hình Điều khoản & Trang chủ
- Sau khi xác thực thành công, nếu tài khoản chưa ghi nhận đồng ý điều khoản dịch vụ, ứng dụng sẽ chuyển tới màn hình **Đồng ý điều khoản (Consent)**.
- Người dùng chọn đồng ý để vào thẳng **Trang chủ (Home)** với vai trò tương ứng (Học sinh hoặc Phụ huynh).

---

## 3. Danh sách Kiểm tra Nhanh (Checklist)

- [ ] Người bạn khác quét QR vào được app bình thường, không còn lỗi 404 trắng màn hình.
- [ ] Không thấy nút Zalo nào lúc đăng nhập.
- [ ] Nhập sai mật khẩu thì báo "Mã tài khoản hoặc mật khẩu chưa đúng" (trung thực).
- [ ] Nhập đúng tài khoản `HS001` / `matkhau123` vào được trang học sinh.
