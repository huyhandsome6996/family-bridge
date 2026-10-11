# F06 — scope/test/manual (tóm tắt trong report.md; chi tiết bổ sung)

## Phạm vi

- Draft CRUD author-only; unknown fields (kể cả suggestion_id/original_text
  từ AI) bị từ chối — draft chỉ chứa nội dung cuối tác giả chọn.
- Pause: server ghi start/deadline = now+300s; re-pause KHÔNG reset/gia hạn;
  edit draft bump revision, deadline cố ý KHÔNG đổi (không reset cooldown
  tùy tiện); cancel-pause chủ động về editing.
- Preview chỉ khi now ≥ deadline (controlled clock: 299 chặn 409
  cooldown_active, 300/301 cho phép); bind (revision, recipient, payload
  hash); preview mới supersede preview cũ cùng draft.
- Confirm-send: thứ tự guard — sent(400 draft_already_sent) → preview
  404 → used(409) → revision lệch(409 preview_stale) → recipient lệch(409)
  → deadline(409/400) → sender port (connection guard nơi production path).
  Send xong消耗 preview (used) — một preview chỉ gửi được một lần.
- Mobile: countdown từ (deadline, server_time) + monotonic elapsed
  (performance.now) — đổi giờ thiết bị không rút ngắn; tick cleanup khi
  unmount; expiry không tự gửi gì.

## Test case chính (đã chạy — PASS trên SQLite)

| Case | Kỳ vọng | Kết quả |
| --- | --- | --- |
| Create/get draft author-only | 201/200 | PASS |
| AI linkage fields (suggestion_id, original_text) | 400 | PASS |
| Kind allowlist + bounds body | 400 | PASS |
| Edit bump revision, deadline giữ nguyên | revision 2, deadline không đổi | PASS |
| Cross-user + caregiver + admin đọc/sửa draft | 404 (ownership trước validation) | PASS |
| Delete hook apply_user_deletion | xóa sạch drafts+previews | PASS |
| Pause 300s server-decided | started/deadline đúng | PASS |
| Re-pause không reset deadline (cả sau 60s) | deadline gốc đứng yên | PASS |
| Preview 299s | 409 cooldown_active, remaining=1 | PASS |
| Preview 300s / 301s | 200 | PASS |
| Hết 301s: không tự gửi gì, status paused | 0 sender call | PASS |
| Cancel pause → preview | 400 pause_not_started | PASS |
| Preview khi chưa pause | 400 | PASS |
| Full flow pause→preview→confirm | sent, sender 1 lần | PASS |
| Confirm thiếu preview | 404 | PASS |
| Sửa sau preview (stale revision) | 409 preview_stale | PASS |
| Đổi recipient sau preview | 409 preview_stale | PASS |
| Double confirm | 400 draft_already_sent, 1 send | PASS |
| Connection revoked trước confirm | 403, draft nguyên vẹn | PASS |
| Sender chưa wire | 503 sender_not_wired | PASS |
| emotion_card kind dùng card sender | card sender 1 lần, text sender 0 | PASS |
| Unauthenticated | 401 | PASS |

Mobile (node): wrappers 9 path; remainingSeconds 299/300/301; đổi wall
clock không ảnh hưởng (không dùng wall clock); page factory.

## Manual review checklist (chờ Huy/reviewer + device)

| # | Actor | Thao tác | Kỳ vọng |
| --- | --- | --- | --- |
| 1 | Học sinh | Soạn → Lưu nháp | Nháp giữ được sau khi đóng app (server-side) |
| 2 | Học sinh | Bấm tạm dừng | Đếm từ deadline server; đổi giờ máy không đổi |
| 3 | Học sinh | Sửa nháp trong lúc pause | Deadline không reset; phải xem lại trước gửi |
| 4 | Học sinh | Chờ đủ 5 phút → Xem lại → Gửi | Thấy đúng nội dung + người nhận; bấm gửi mới đi |
| 5 | Học sinh | Hủy tạm dừng | Về editing; không tự gửi gì |
| 6 | Học sinh | Gửi signal trợ giúp khi đang pause | Không bị cooldown chặn (đường riêng F10/F13) |
| 7 | Admin | Thử đọc draft người khác | 404; không có nút đổi 300s |
