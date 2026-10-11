# F13 — scope/test/manual (tóm tắt trong report.md; chi tiết bổ sung)

## Test case chính (đã chạy — PASS trên SQLite)

| Case | Kỳ vọng | Kết quả |
| --- | --- | --- |
| Truy cập KHÔNG auth | 200 (public by design) | PASS |
| Unverified / retired ẩn hoàn toàn | ẩn | PASS |
| review_due hết hạn → ẩn số + status verification_expired | trung thực | PASS |
| open_now deterministic (UTC↔UTC+7, 8-17 window biên) | đúng | PASS |
| Provider lỗi → fallback đã xác minh (fallback:true) | 200 vẫn có số | PASS |
| Fallback hết hạn → guidance-only, không có field phone | không bịa số | PASS |
| Đúng 1 endpoint (không telemetry/history/purpose) | đúng | PASS |

Mobile (node): path public; openPhone chỉ trong click listener; số chỉ
hiện khi verified; wording trạng thái trung thực; textContent.

## Manual review checklist (chờ Huy/reviewer + device)

| # | Actor | Thao tác | Kỳ vọng |
| --- | --- | --- | --- |
| 1 | Chưa đăng nhập | Mở trang trợ giúp | Vẫn thấy danh bạ verified |
| 2 | Học sinh | Bấm Gọi | Trình gọi mở do user bấm; không tự gọi |
| 3 | Ngoài giờ | Xem trạng thái | "Ngoài giờ phục vụ" — không hứa trực 24/7 |
| 4 | Backend lỗi | Mở trang | Fallback verified hiện; hết hạn → guidance-only |
| 5 | Sau khi gọi | Kiểm tra dữ liệu | Không có lịch sử gọi/purpose nào được lưu |
