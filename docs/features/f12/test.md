# F12 — scope/test/manual (tóm tắt trong report.md; chi tiết bổ sung)

## Test case chính (đã chạy — PASS trên SQLite)

| Case | Kỳ vọng | Kết quả |
| --- | --- | --- |
| Directory yêu cầu auth / verified-only | 401 / 1 verified | PASS |
| Staff unwired / rỗng → tạo request | 503 scheduling_no_staff | PASS |
| Full flow: submit→claim→propose→accept→complete | đúng state machine | PASS |
| Submit chưa có nghĩa là có lịch (note ở propose + UI wording) | đúng | PASS |
| Stale acceptance (slot bị supersede) | 409 preview_stale | PASS |
| Overlap cùng handler (accept rồi propose chồng giờ) | 409 slot_unavailable | PASS |
| Notes: stranger/admin 404; requester+handler đọc | đúng | PASS |
| Revoke staff → propose + đọc note | 404 ngay | PASS |
| Claim bởi người không capability | 404 (không leak scope) | PASS |
| Queue assigned-only | đúng | PASS |
| Cancel idempotent | đúng | PASS |
| Topic allowlist / note bounds / slot quá khứ | 400 | PASS |
| Unauthenticated | 401 | PASS |

Mobile (node): wrappers 7 path; wording "Chưa có lịch hẹn nào cho tới khi
thầy cô đề xuất và bạn xác nhận"; scheduling_no_staff state; openPhone
trong click listener; textContent.

## Manual review checklist (chờ Huy/reviewer + device)

| # | Actor | Thao tác | Kỳ vọng |
| --- | --- | --- | --- |
| 1 | Học sinh | Xem danh bạ trường | Verified + giờ thật; gọi khi tự bấm |
| 2 | Học sinh | Gửi yêu cầu hẹn | Trạng thái "đã gửi", KHÔNG báo có lịch |
| 3 | Thầy cô (staff) | Claim + đề xuất giờ | Chỉ handler có capability; slot UTC |
| 4 | Học sinh | Đồng ý / hỏi giờ khác | Accept tạo lịch; decline cho đề xuất lại |
| 5 | Thầy cô bị revoke | Vào queue/đọc note | Mất quyền ngay |
| 6 | Chưa có staff | Gửi yêu cầu | Thông báo tắt lịch hẹn + hướng dẫn gọi trực |
| 7 | Hai handler trùng giờ | Propose chồng slot | 409 slot_unavailable |
