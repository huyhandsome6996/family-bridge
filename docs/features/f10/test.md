# F10 — scope/test/manual (tóm tắt trong report.md; chi tiết bổ sung)

## Test case chính (đã chạy — PASS trên SQLite)

| Case | Kỳ vọng | Kết quả |
| --- | --- | --- |
| Meta: đúng 3 nhu cầu allowlist | đúng | PASS |
| Preview bind (need, recipient) + body canonical | đúng | PASS |
| Send qua transport kind listening_signal | đúng | PASS |
| Replay cùng key | cùng message, 1 row | PASS |
| Need ngoài allowlist | 400 | PASS |
| Không connection (transport guard) | 403 | PASS |
| Transport chưa wire | 503 transport_not_wired | PASS |
| Unknown fields (draft_id, original) | 400 — không kèm tâm sự/draft | PASS |
| Thiếu X-Idempotency-Key | 400 | PASS |
| Chỉ 1 recipient/lần gửi; không broadcast endpoint | đúng | PASS |
| View: participant-only; stranger/admin 404 | đúng | PASS |
| Ack: recipient-only, idempotent; sender ack → 404 | đúng | PASS |
| View phản ánh read state sau ack | đúng | PASS |
| Không phản hồi → không có gì tự chạy | 0 job/forward | PASS |
| Unauthenticated | 401 | PASS |

Mobile (node): wrappers đúng path + key; DTO assertion
`need,recipient_id` (không field khác); help link `#/help` hiện trong
trạng thái lỗi; wording trung thực "không ai bảo đảm trả lời ngay".

## Manual review checklist (chờ Huy/reviewer + device)

| # | Actor | Thao tác | Kỳ vọng |
| --- | --- | --- | --- |
| 1 | Học sinh | Bấm nút → chọn nhu cầu → chọn bố mẹ → preview | Thấy đúng câu sẽ gửi + người nhận |
| 2 | Học sinh | Bấm gửi | Signal đến Hộp thư bố mẹ; không qua cooldown |
| 3 | Bố mẹ | Mở signal → ack | Trạng thái "đã đọc" hiện với con; ack không tự tạo reply |
| 4 | Bố mẹ | Trả lời/đề nghị giờ | Là message thường do bố mẹ soạn; "hẹn giờ" không tạo lịch hẹn trường học |
| 5 | Học sinh | Chưa được trả lời | Thấy đường tự liên hệ điểm tựa khác + F13; không có gì tự chạy |
| 6 | Mất mạng | Gửi thất bại | Trang trợ giúp vẫn mở |
