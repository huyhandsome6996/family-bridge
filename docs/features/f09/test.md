# F09 — scope/test/manual (tóm tắt trong report.md; chi tiết bổ sung)

## Test case chính (đã chạy — PASS trên SQLite)

| Case | Kỳ vọng | Kết quả |
| --- | --- | --- |
| Catalog: retired/draft ẩn; kind/audience filter | đúng | PASS |
| Progress riêng: stranger list rỗng | private | PASS |
| Retired content chặn progress + invite | 404 | PASS |
| Invite cần connection (stranger) | 404 | PASS |
| Inviter KHÔNG tick thay invitee (respond 404) | ownership | PASS |
| Mỗi bên tự ghi done/skipped độc lập | đúng | PASS |
| Invitee phải accept trước khi ghi response | 400 | PASS |
| Cancel chỉ khi pending; declined không accept lại | đúng | PASS |
| Không có endpoint reminder/schedule | cấu trúc | PASS |
| Unauthenticated | 401 | PASS |

Mobile (node): wrappers 6 path; wording "Mỗi người tự đánh dấu phần mình";
không video/autoplay; textContent.

## Manual review checklist (chờ Huy/reviewer + device)

| # | Actor | Thao tác | Kỳ vọng |
| --- | --- | --- | --- |
| 1 | Học sinh | Duyệt catalog + tự tick | Riêng tư; không ai thấy |
| 2 | Cả hai | Mời + đồng ý hoạt động chung | Mỗi người tự ghi phần mình |
| 3 | Học sinh | Từ chối lời mời | Trạng thái trung thực, không áp lực |
| 4 | B16 retire nội dung | Đánh dấu lại | Bị chặn ngay (404) |
| 5 | Cả hai | Không làm gì | Không có nhắc tự động |
