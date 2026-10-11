# F05 — scope/test/manual (tóm tắt trong report.md; chi tiết bổ sung)

## Phạm vi

- MessageTransport duy nhất: 6 kind allowlist (text, emotion_card,
  journal_reply, mood_reply, listening_signal, quick_reply); F03/F04/F10
  gửi qua port này, không bảng/endpoint thứ hai.
- Send guards theo thứ tự: kind allowlist → body bounds (không truncate) →
  idempotency (UNIQUE sender+key; same key khác hash → 409) → connection
  active generation hiện hành qua ConnectionReader → context kinds đòi
  validator (fail closed khi chưa wire) → listening_signal KHÔNG bao giờ
  bị cooldown chặn (cooldown là việc của F06, gọi transport sau guard riêng).
- Inbox cursor (timestamp+UUID), metadata tối thiểu, lọc quyền ở queryset
  TRƯỚC pagination; detail participant-only; read receipt chỉ người nhận,
  set một lần (giữ mốc sớm nhất); "sent" ≠ "read".
- API operation status: owner-only lookup theo idempotency key cho
  unknown-outcome; stranger thấy not_found, không leak.
- Mobile: inbox (poll 30s chỉ khi visible, backoff ≤120s, cleanup timer),
  message-detail (mở body sau server recheck, đánh dấu đã đọc khi hiển thị
  thật, trả lời = explicit send).

## Test case chính (đã chạy — PASS trên SQLite)

| Case | Kỳ vọng | Kết quả |
| --- | --- | --- |
| Gửi → replay cùng key/cùng hash | trả về CÙNG message, không tạo bản mới | PASS |
| Cùng key khác payload | 409 duplicate_key_payload_mismatch | PASS |
| payload_hash client tự tính sai | 400 hash_mismatch_recompute (không tự sửa) | PASS |
| kind ngoài allowlist | 400 | PASS |
| body rỗng / > MAX_TEXT_CHARS | 400, không truncate âm thầm | PASS |
| Không có connection / revoked | 403 no_active_connection | PASS |
| generation được ghi = generation hiện hành | đúng | PASS |
| reply_to không phải thư gửi cho mình | 404 reply_target_not_found | PASS |
| journal_reply/mood_reply thiếu grant hợp lệ | 403 reply_context_no_longer_shared | PASS |
| context validator chưa wire | 400 fail-closed, không gửi lọt | PASS |
| mark_read bởi người khác | 404 | PASS |
| read idempotent, giữ mốc sớm nhất | đúng | PASS |
| "sent" chưa "read" | list metadata phản ánh đúng | PASS |
| Cursor pagination không overlap, insert giữa 2 trang | rơi đúng trang | PASS |
| Query count page20 vs page50 | bounded (không N+1) | PASS |
| Unlink: người nhận mất body, người gửi giữ bản đã gửi | DEC-13 fail-closed | PASS |
| Stranger enumerate message | 404 | PASS |
| Admin/superuser đọc list/detail/read của người khác | 404 / rỗng | PASS |
| Mass assignment (is_staff, read_at trong body) | 400 unknown fields | PASS |
| Thiếu X-Idempotency-Key | 400 | PASS |
| Operation lookup: owner thấy sent, stranger not_found | đúng | PASS |
| Quick replies theo audience; gợi ý KHÔNG tự thành reply | đúng | PASS |
| Unauthenticated | 401 | PASS |
| Full flow send→read→reply | đúng vai trò | PASS |

Mobile (node): API wrappers đúng contract path + mang idempotency key;
page modules export factories.

## Manual review checklist (chờ Huy/reviewer + device Zalo thật)

| # | Actor | Thao tác | Kỳ vọng |
| --- | --- | --- | --- |
| 1 | Học sinh | Gửi lời nhắn cho người đồng hành | Preview → bấm gửi mới đi; receipt là message id |
| 2 | Người đồng hành | Mở hộp thư | Thấy metadata; mở detail mới thấy body |
| 3 | Người nhận | Đọc thư | Trạng thái "đã đọc" hiện với người gửi; hai khái niệm tách bạch |
| 4 | Người nhận | Chọn mẫu trả lời | Phải sửa/xác nhận bấm gửi; mẫu không tự đi |
| 5 | Mất mạng | Gửi thất bại | Unknown outcome → mở operations/{key} kiểm tra trước khi gửi lại cùng key |
| 6 | Sau unlink | Người nhận mở thư cũ | Body bị chặn (fail-closed DEC-13); người gửi vẫn thấy bản mình đã gửi |
| 7 | Admin | Thử đọc hội thoại người khác | 404/rỗng |
