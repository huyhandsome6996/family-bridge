# F08 — scope/test/manual (tóm tắt trong report.md; chi tiết bổ sung)

## Test case chính (đã chạy — PASS trên SQLite)

| Case | Kỳ vọng | Kết quả |
| --- | --- | --- |
| Prompts: draft topic ẩn | published-only | PASS |
| Tạo trang với topic chưa publish | 400 | PASS |
| Create/get/list own | đúng | PASS |
| Search owner-scoped (không lộ người khác) | đúng | PASS |
| Owner khác / caregiver / admin GET + DELETE | 404 | PASS |
| PATCH expected_revision đúng | revision 2 | PASS |
| PATCH expected_revision cũ | 409 revision_conflict, nội dung không ghi đè | PASS |
| Bounds content 8001 / unknown fields | 400 | PASS |
| Share 1 trang → người nhận chỉ thấy trang đó | đúng | PASS |
| Sửa sau share → stale 404 → re-share rev2 đọc được | đúng | PASS |
| Revoke → 404 fail-closed | đúng | PASS |
| Share self 400 / stranger 404 | đúng | PASS |
| Xóa trang cascade share + reply (0 orphan) | đúng | PASS |
| Reply trên grant hợp lệ + owner đọc replies | đúng | PASS |
| Reply sau revoke | 404 (reply không mở đường đọc) | PASS |
| Reply update in-place (1 reply/page/responder) | đúng | PASS |
| Stranger reply/đọc | 404 | PASS |
| Unauthenticated | 401 | PASS |

## Manual review checklist (chờ Huy/reviewer + device)

| # | Actor | Thao tác | Kỳ vọng |
| --- | --- | --- | --- |
| 1 | Học sinh | Viết trang riêng | Không ai đọc được; search chỉ trong trang mình |
| 2 | Học sinh | Sửa trang đang mở ở máy khác | 409 → tải lại bản mới, không ghi đè mù |
| 3 | Học sinh | Chia sẻ 1 trang cho mẹ | Mẹ thấy đúng trang + bản hiện tại |
| 4 | Học sinh | Sửa trang đã chia sẻ | Mẹ không thấy bản cũ tới khi share lại |
| 5 | Người nhận | Viết phản hồi song hành | Lưu được; sửa thay thế in-place |
| 6 | Học sinh | Thu hồi trang | Người nhận mất trang; không đọc được qua reply |
| 7 | Học sinh | Xóa trang | Share + reply biến mất sạch (không orphan) |
