# Thông tin Triển khai Phiên bản Testing Zalo Mini App

Ngày phát hành: 16/10/2026.

---

## 1. Thông tin Định danh Mini App

- **Mini App ID:** `3411096375330044972`
- **Tên ứng dụng:** Family Bridge
- **Môi trường backend:** https://family-bridge-backend.onrender.com
- **Nhánh triển khai:** `main`
- **Trạng thái phát hành (Version Status):** `Testing` (Target 2 trên Zalo Mini App Platform)
- **Console quản lý phiên bản:** https://miniapp.zaloplatforms.com/miniapp/3411096375330044972/management/versions

---

## 2. Vì sao phải triển khai bản Testing (Target 2)

- Bản `Development` (Target 0) chỉ phục vụ debug cục bộ nhanh qua proxy `zdev-*`, đường link tự hủy sau thời gian ngắn và khi người khác quét sẽ gặp lỗi `404 Not Found` trên `app-config.json` dẫn đến trắng màn hình.
- Bản `Testing` (Target 2) được lưu chính thức trong bảng "Danh sách phiên bản" trên Zalo Developer Console, được đóng gói hoàn chỉnh với `www/app-config.json` và tài nguyên tĩnh, cho phép toàn bộ tài khoản thử nghiệm / người dùng quét mã QR mở và sử dụng ổn định.

---

## 3. Quy trình Triển khai Kỹ thuật

1. **Build mã nguồn:**
   ```bash
   cd zalo-mini-app
   npm run build
   ```
   Thư mục `www/` được đóng gói với `VITE_API_BASE_URL=https://family-bridge-backend.onrender.com`.

2. **Triển khai qua ZMP CLI:**
   ```bash
   npx zmp deploy -t -e -m "Family Bridge — HS/PH trong Zalo — $(git rev-parse --short HEAD) — 16/10/2026"
   ```
   - `-t` (`--testing`): Triển khai lên môi trường Testing (Target 2).
   - `-e` (`--existing`): Sử dụng gói build `www` đã kiểm định.
   - `-m` (`--message`): Ghi chú phiên bản hiển thị trong Console.

3. **Xác nhận trong Console:**
   - Phiên bản mới nhất xuất hiện ở đầu bảng "Danh sách phiên bản".
   - Trạng thái: "Testing" / "Thử nghiệm".
   - Quét mã QR bản thử nghiệm hoặc mở link `https://zalo.me/s/3411096375330044972/`.

---

## 4. Kịch bản Rollback / Khôi phục

Nếu cần quay lại phiên bản trước đó:
1. Truy cập https://miniapp.zaloplatforms.com/miniapp/3411096375330044972/management/versions.
2. Chọn phiên bản cũ mong muốn và bấm chọn kích hoạt cho bản thử nghiệm.
3. Về mặt git: thực hiện revert commit trên `main` và redeploy.
