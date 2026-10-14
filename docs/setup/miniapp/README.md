# Cài đặt và chạy local — Mini App Family Bridge (US-003)

Ngày cập nhật: 15/10/2026 (quy hoạch nhánh: tên nhánh cũ `feat/us-003-miniapp-ui-foundation` đã xóa sau khi merge — nội dung dưới đây áp dụng cho `main` và các nhánh `tinh-nang/*` mới).

## 1. Yêu cầu môi trường

- Node.js >= 22.12 (đã kiểm tra với Node 24.21) và npm >= 10.
- Không cần backend để chạy tests: toàn bộ kiểm thử dùng mock adapter.
- Không cần tài khoản Zalo để xem bản preview trong browser; tài khoản/App ID chỉ cần khi Antigravity deploy lên Zalo thật.

## 2. Cài đặt và chạy

```bash
cd zalo-mini-app
npm install        # hoặc npm ci để cài đúng lockfile
npm start          # dev server tại http://127.0.0.1:3000
```

Trình duyệt sẽ mở bản preview SPA. Vì chạy ngoài Zalo, mọi tính năng SDK Zalo thật (định danh, kết nối) chưa kích hoạt ở đợt này — app hiển thị trạng thái "chưa kết nối" một cách trung thực.

## 3. Chạy tests và build

```bash
npm test           # node --test tests/*.test.mjs — mock adapter, không cần server
npm run build      # vite build + verify-build: kiểm tra www/app-config.json và assets
```

Kết quả tham chiếu sau Task 13-c: 97/97 tests pass (gồm 18 test phân loại lỗi connection-check); build sinh `www/` (entry `assets/app.module.js`, CSS `assets/index.css`) và `verify-build` in "Verified Zalo app-config and all referenced assets".

## 4. Chế độ demo (dữ liệu minh họa)

- Bật CHỈ khi thêm `?demo=1` vào URL, ví dụ `http://127.0.0.1:3000/?demo=1#/home`.
- Khi demo bật: mọi màn hình có nhãn "Dữ liệu minh họa"; home hiển thị trạng thái "đã kết nối" với người dùng fixture (không tạo connection/grant/session thật); màn kiểm tra kết nối có 3 nút "Giả lập: Thành công / Lỗi / Timeout".
- Không demo: mọi lỗi API hiển thị trung thực (ErrorState + nút Thử lại), không fallback sang dữ liệu giả. Production build cũng KHÔNG tự bật demo; chỉ URL có `?demo=1` mới kích hoạt.
- Xem lỗi: trạng thái lỗi hiện ngay trên màn hình kèm nút thử lại; không có lỗi kỹ thuật/SDK code trong copy người dùng.

## 5. Biến môi trường

Sao chép `.env.example` thành `.env` (KHÔNG commit `.env`):

- `APP_ID`: ID Mini App trên Zalo (thông tin công khai, không phải secret).
- `VITE_API_BASE_URL`: địa chỉ backend HTTPS cho build thật, ví dụ `https://family-bridge-backend.example.com`. Khi thiếu (hoặc địa chỉ không HTTPS ngoài localhost), màn kiểm tra kết nối hiển thị lỗi cấu hình — copy kỳ vọng: tiêu đề "Chưa cấu hình địa chỉ máy chủ" kèm hướng dẫn thêm `VITE_API_BASE_URL` khi build; TUYỆT ĐỐI không hiện thông báo timeout ("Kết nối quá thời gian chờ") cho trường hợp này. Lỗi mạng hiển thị "Chưa kết nối được máy chủ" + nút Thử lại. Không tự dùng dữ liệu giả.

Tuyệt đối không đặt secret/API key/PAT vào biến `VITE_*` — chúng đi vào bundle công khai (SEC-19).

## 6. Những gì chưa chạy ở local

- Webview Zalo thật (Android/iOS): safe area, back gesture, keyboard, hiệu năng — Antigravity kiểm tra theo checklist `docs/handover/miniapp-foundation/antigravity-checklist.md`.
- Gọi backend thật: hợp đồng `GET /api/v1/health/` và `GET /api/v1/ready/` đã sẵn trong adapter; nối điểm cuối thuộc Antigravity/US-004.
- Deploy/đăng ký/testing trên Mini App Center: ngoài phạm vi đợt này.
