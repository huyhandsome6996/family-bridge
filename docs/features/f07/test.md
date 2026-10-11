# F07 — scope/test/manual (tóm tắt trong report.md; chi tiết bổ sung)

## Phạm vi

- 1 entry/người/ngày (UNIQUE owner+entry_date); entry_date thiếu → server
  lấy hôm nay theo Asia/Ho_Chi_Minh; chặn tương lai >1 ngày, quá khứ >730
  ngày (DEC-17); emotion allowlist 7 nhãn mô tả; note ≤2000 Unicode giữ nguyên.
- Edit (PATCH) bump revision — grant cũ bind revision cũ → nội dung sửa
  tự ẩn khỏi người nhận tới khi share lại (tạo grant mới revision mới).
- Share: POST share {recipient_id} — server kiểm connection ACTIVE
  generation hiện hành (ConnectionReader); share_to_self 400; một grant
  (entry, recipient, revision) UNIQUE.
- Đọc phía người nhận: grant unrevoked + revision còn hiện hành +
  connection còn active — drift nào cũng 404 fail-closed, không cache.
- Summary: đếm mô tả theo nhãn trong cửa sổ bounded (≤365 ngày), owner-only,
  không score/ranking/so sánh.
- Mobile: mood.js (chips radiogroup + note + summary + lịch sử cursor +
  share flow từng mục), mood-shared.js (danh sách nhận được + đọc chi tiết),
  mọi text qua textContent.

## Test case chính (đã chạy — PASS trên SQLite)

| Case | Kỳ vọng | Kết quả |
| --- | --- | --- |
| Create + detail owner | 201/200, revision 1 | PASS |
| 1 mục/ngày: duplicate | 400 entry_already_exists_use_edit | PASS |
| Date boundary: tương lai >1 ngày / quá khứ >730 / sai format | 400 | PASS |
| Date edge +1 ngày (VN) | 201 | PASS |
| Emotion ngoài allowlist | 400 | PASS |
| Note Unicode/emoji + >2000 | 201 / 400 | PASS |
| Edit bump revision | revision 2 | PASS |
| Owner khác / caregiver / admin đọc + admin PATCH | 404 | PASS |
| Pagination page20 vs page50 query count | bounded (không N+1) | PASS |
| Share 1 mục → grant revision hiện hành | 201 | PASS |
| Share không connection | 404 | PASS |
| Người nhận chỉ đọc mục được chia sẻ (mục kia không lộ) | đúng | PASS |
| Sửa sau share → đọc stale | 404 entry_edited_not_reshared | PASS |
| Share lại sau sửa → revision 2 đọc được | đúng | PASS |
| Revoke 1 mục: mục đó 404, mục khác vẫn 200 | scoped | PASS |
| Unlink → người nhận đọc | 404 fail-closed | PASS |
| Share cho chính mình | 400 | PASS |
| Stranger revoke/đọc share | 404 | PASS |
| Summary đếm đúng, chỉ {emotion,label,count} | không score | PASS |
| Summary days=9999 bounded, owner-only | đúng | PASS |
| Unauthenticated | 401 | PASS |

Mobile (node): wrappers 10 path; factories; wording "không chia sẻ cả
lịch sử" + textContent assertions.

## Manual review checklist (chờ Huy/reviewer + device)

| # | Actor | Thao tác | Kỳ vọng |
| --- | --- | --- | --- |
| 1 | Học sinh | Chọn cảm xúc + lưu | 1 mục/ngày; sửa qua lịch sử |
| 2 | Học sinh | Xem mô tả 3 tháng | Đếm theo nhãn, không điểm/xếp hạng |
| 3 | Học sinh | Chia sẻ 1 mục cho mẹ | Preview rõ chỉ mục đó; mẹ thấy bản đó |
| 4 | Học sinh | Sửa mục đã chia sẻ | Mẹ không còn thấy bản cũ tới khi share lại |
| 5 | Người nhận | Đọc mục được chia sẻ | Chỉ mục được cấp; mục khác không lộ |
| 6 | Học sinh | Thu hồi 1 mục | Người nhận đọc lại 404 ngay; mục khác không ảnh hưởng |
| 7 | Sau unlink | Người nhận đọc | 404 fail-closed |
