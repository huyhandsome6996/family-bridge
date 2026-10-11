# F15 — scope/test/manual (tóm tắt trong report.md; chi tiết bổ sung)

## Phạm vi

- Policy service deny-by-default + grant provider registry (F07/F08 nối ở B18).
- Deletion workflow trung thực + ledger append-only + restore replay.
- API privacy owner-only, không admin bypass; consent withdraw qua port.
- Mobile: trang quyền riêng tư.

## Test case chính (đã chạy — PASS trên SQLite)

| Case | Kỳ vọng | Kết quả |
| --- | --- | --- |
| Không grant → đọc | deny | PASS |
| Grant đúng (item, recipient, revision) | allow | PASS |
| Sai revision / sai recipient / revoked | deny, không leak body | PASS |
| Connection dead qua reader | deny | PASS |
| Provider chưa đăng ký | deny / ModuleUnavailable khi revoke | PASS |
| Ledger append-only | sửa event bị chặn | PASS |
| Deletion receipt một lần, hash at rest | đúng | PASS |
| Duplicate request khi đang mở | idempotent, không receipt thứ hai | PASS |
| Cancel chỉ khi requested | đúng | PASS |
| Hook ok → completed; hook fail → failed_needs_action | truthful | PASS |
| Hook xóa grant thật | grant bị xóa | PASS |
| Restore replay sau "backup" | revoke được re-apply, không hồi sinh | PASS |
| API overview/revoke owner-only | stranger 404 | PASS |
| superuser đọc deletion detail | 404 (không bypass) | PASS |
| Mass assignment deletion request | 400 | PASS |
| Consent withdraw chưa wire port | 503 fail-closed | PASS |

## Manual review checklist (chờ Huy/reviewer + device)

| # | Actor | Thao tác | Kỳ vọng |
| --- | --- | --- | --- |
| 1 | Owner | Mở trang Quyền riêng tư | Thấy đúng danh sách đang chia sẻ, không thấy của người khác |
| 2 | Owner | Thu hồi 1 mục | Người nhận đọc lại bị chặn ngay; có cảnh báo bản sao ngoài app |
| 3 | Owner | Gửi yêu cầu xóa | Receipt một lần; trạng thái phản ánh thật |
| 4 | Owner | Hủy yêu cầu trước khi xử lý | Được; sau processing thì không |
| 5 | Admin | Thử mở deletion case người khác | 404, không có đường đọc body |
