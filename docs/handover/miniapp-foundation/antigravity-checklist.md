# Checklist deploy/device — dành cho Antigravity

Phạm vi Agent B kết thúc ở "frontend foundation/demo đã kiểm tra cục bộ". Các mục dưới đây cần môi trường Zalo thật.

## A. Chuẩn bị

- [ ] Cấu hình App ID thật vào Mini App Center + `zalo-mini-app/.env` (`APP_ID`).
- [ ] Chốt phân loại danh mục dịch vụ + chuẩn bị giấy tờ xác thực chủ sở hữu (xem zalo-policy-report.md 4.2 — giáo dục có thể yêu cầu giấy phép).
- [ ] `npm ci && npm test && npm run build` trên máy deploy — phải pass (79/79 tests, verify-build OK).

## B. Nối backend thật (theo docs/contracts/api-foundation.md)

- [ ] Thay `VITE_API_BASE_URL` bằng backend của Agent A (HTTPS).
- [ ] Kiểm tra `GET /api/v1/health/` → `{"status":"ok"}` qua màn "Kiểm tra kết nối máy chủ" (trạng thái success).
- [ ] Kiểm tra `GET /api/v1/ready/`: 200 ok → success; 503 unavailable → trạng thái "Máy chủ chưa sẵn sàng" (không phải lỗi mạng); timeout → trạng thái timeout riêng.
- [ ] Gỡ thiết lập demo: xác nhận production KHÔNG có nút "Giả lập" ở màn kiểm tra kết nối; URL không `?demo=1` không bao giờ hiển thị fixture.
- [ ] Nối các API nghiệp vụ US-004 vào `src/core/adapter/zalo-adapter.js` (boundary đã đánh dấu getConnectionStatus/getProfile ném 501).

## C. Kiểm tra Zalo Android/iOS thật

- [ ] Safe area: notch, thanh Zalo/tabbar — bottom nav không bị che (`env(safe-area-inset-bottom)` + app-config `hideIOSSafeAreaBottom`).
- [ ] Menu Zalo góc phải trên: không có nút nào bị che/xung đột vùng chạm.
- [ ] Back gesture/nút back hệ thống: từ các trang phụ về đúng; không crash; keyboard đóng không mất trạng thái.
- [ ] Bottom nav 5 mục: xác nhận khuyến nghị DG ≤4 tab — đo mức khó nhấn/nhận diện, báo Huy quyết định hạ xuống 4.
- [ ] Viewports 320/360/390/430: không cuộn ngang, không mất nội dung/hành động.
- [ ] Text scale 200% (đã bỏ `user-scalable=no`): consent/mô tả không bị cắt dấu Việt.
- [ ] Touch target ≥44px thực tế; contrast đo trên màn hình thật (CTA #A84733/#FFF4E8 ≈5.36:1).
- [ ] prefers-reduced-motion + hiệu năng: không frame drop khi chuyển trang.
- [ ] sessionStorage trong webview Zalo: role selection giữ khi điều hướng; nếu bị chặn, app vẫn chạy (in-memory).
- [ ] Logo placeholder: thay bằng asset mẫu 03 được duyệt trước khi gửi thẩm định; kiểm tra tỉ lệ/khoảng trống.
- [ ] Trang Tìm trợ giúp: điền thông tin nhà phát triển thật (Điều 5.5.a) + đầu mối đã xác minh trước khi hiển thị số thật.

## D. Ràng buộc chính sách cần nhớ khi deploy

- Không tuyên bố "Zalo đã duyệt" trong bất kỳ kênh nào trước khi có kết quả thẩm định.
- Không bật analytics bên thứ ba; không remote asset; dữ liệu người dùng lưu trong Việt Nam (Agreement 9.3).
- App ở trạng thái Testing không được cấp dữ liệu riêng tư — không gọi getUserInfo/getPhoneNumber.
- Sentry đi kèm zmp-sdk: mô tả trong chính sách riêng tư khi public.

## E. Kết quả đã kiểm tra cục bộ (tham chiếu)

- `npm test`: 79/79 pass (mock adapter; không cần server).
- `npm run build`: Verified Zalo app-config and all referenced assets; bundle `www/` scan sạch secret.
- Browser preview: luồng U01→U02→U04→home, 5 hub, connection-check 4 trạng thái, help; demo `?demo=1` có nhãn "Dữ liệu minh họa" và cô lập khỏi production.
