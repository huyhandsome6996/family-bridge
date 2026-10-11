# F02 — scope/test/manual (tóm tắt trong report.md; chi tiết bổ sung)

## Test case chính (đã chạy — PASS trên SQLite)

| Case | Kỳ vọng | Kết quả |
| --- | --- | --- |
| Catalog published-only | đúng | PASS |
| Enroll pin revision; re-publish không migrate thầm | pin giữ nguyên, catalog ra rev mới | PASS |
| Re-enroll tường minh sang revision mới | re-pin chủ động | PASS |
| Enroll revision lạ/không tồn tại | 404 | PASS |
| Opt-out → weeks 404 trung thực; rejoin được | đúng | PASS |
| Cả 4 tuần view được, locked=false, suggested chỉ mang tính thông tin | không khóa | PASS |
| Progress own-only (stranger 404) + reset xóa | đúng | PASS |
| Activity không thuộc chương trình pin | 400 | PASS |
| Accept idempotent cùng revision (UNIQUE) | created True→False | PASS |
| Mỗi người tự accept (không endpoint ký hộ — participant_id → 400) | đúng | PASS |
| Template sửa → re-enroll → phải accept lại | đúng | PASS |
| Unauthenticated | 401 | PASS |

Mobile (node): wrappers 6 path; wording tự nguyện + "mỗi người tự đồng ý"
+ sổ giấy + (gợi ý); textContent.

## Manual review checklist (chờ Huy/reviewer + device)

| # | Actor | Thao tác | Kỳ vọng |
| --- | --- | --- | --- |
| 1 | Học sinh | Tham gia | Pin revision; tự nguyện rõ ràng |
| 2 | Học sinh | Xem tuần 3, 4 trước | Vẫn xem được (không khóa theo tiến trình) |
| 3 | Học sinh | Tick hoạt động / bỏ qua / reset | Chỉ ảnh hưởng mình |
| 4 | Cả hai | Đồng ý thỏa ước | Mỗi người tự ký; ai chưa ký thấy rõ |
| 5 | B16 | Sửa template | Revision mới; acceptance cũ không áp dụng |
| 6 | Học sinh | Nghỉ chương trình | Không áp lực; quay lại được |
