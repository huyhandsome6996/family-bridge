# F11 — scope/test/manual (tóm tắt trong report.md; chi tiết bổ sung)

## Test case chính (đã chạy — PASS trên SQLite)

| Case | Kỳ vọng | Kết quả |
| --- | --- | --- |
| Invite → pending; accept (supporter-only) → active + expires_at | TTL 90d | PASS |
| Consent bởi người khác (student) | 404 | PASS |
| Decline một chiều (accept sau decline không hiệu lực) | đúng | PASS |
| Tự mời chính mình / kind lạ | 400 | PASS |
| Duplicate pending role | idempotent (1 row) | PASS |
| Teacher CHƯA kết nối: contact | 403 transport guard (không lọt) | PASS |
| Contact gửi text MỚI qua transport | kind text, body đúng | PASS |
| Replay cùng key | cùng message, 1 send | PASS |
| Revoked / expired role contact | 400 supporter_not_available | PASS |
| Unlink rồi contact | 403 (connection guard) | PASS |
| DTO kèm quoted_letter/journal_page | 400 (không sao chép ngữ cảnh cũ) | PASS |
| Enumeration: stranger/admin list | rỗng | PASS |
| Transport chưa wire | 503 | PASS |
| Unauthenticated | 401 | PASS |

Mobile (node): wrappers đúng path; contact mang key + DTO chỉ `body`;
help link + wording "chờ người đó tự đồng ý"/"không đính kèm thư" có trong source.

## Manual review checklist (chờ Huy/reviewer + device)

| # | Actor | Thao tác | Kỳ vọng |
| --- | --- | --- | --- |
| 1 | Học sinh | Mời mẹ làm điểm tựa | Mời đi đúng 1 người đã kết nối; trạng thái pending |
| 2 | Mẹ | Nhận lời / từ chối | Chỉ mẹ tự bấm; học sinh không thể thay |
| 3 | Học sinh | Nhắn điểm tựa active | Chỉ lời vừa viết được gửi; không kèm ngữ cảnh cũ |
| 4 | Học sinh | Người đầu không trả lời | Tự chọn điểm tựa active khác, soạn request mới |
| 5 | Học sinh | Chưa có điểm tựa | Link F13 luôn hiện |
| 6 | Mẹ | Rút lui / hết TTL | Contact bị chặn ngay với lý do trung thực |
| 7 | Stranger | List supporters của học sinh khác | Rỗng |
