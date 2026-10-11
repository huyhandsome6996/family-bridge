# F14 — scope/test/manual (tóm tắt trong report.md; chi tiết bổ sung)

## Test case chính (đã chạy — PASS trên SQLite)

| Case | Kỳ vọng | Kết quả |
| --- | --- | --- |
| Consent không tự ghi (mở màn ≠ consent) | status rỗng | PASS |
| Grant/withdraw tường minh + withdrawn_at | đúng | PASS |
| purpose/decision lạ | 400 | PASS |
| Submit cần consent active | 403 consent_required | PASS |
| Gửi OK; gửi lại cùng phase | 400 already_submitted | PASS |
| Form draft / revision sai | 404 | PASS |
| Phase lạ / form phase không khớp | 400 | PASS |
| Answer sai kiểu/scala/choice/unknown q | 400 | PASS |
| Form có text question bị từ chối TOÀN BỘ | không hiện trong catalog | PASS |
| Withdraw xong submit bị chặn | 403 | PASS |
| Policy unset | 403 report_policy_unset | PASS |
| Nhóm nhỏ (< k) | suppressed toàn bộ (complementary) | PASS |
| Nhóm đủ lớn | count + mean/distribution, KHÔNG raw/participant | PASS |
| Withdraw → tính lại ngay (3→2→1 → suppressed) | đúng | PASS |
| Không endpoint export/raw | cấu trúc | PASS |
| Admin không bypass (== user view) | đúng | PASS |
| Unauthenticated | 401 | PASS |

## Manual review checklist (chờ Huy/reviewer)

| # | Actor | Thao tác | Kỳ vọng |
| --- | --- | --- | --- |
| 1 | Học sinh | Từ chối khảo sát | Dùng app bình thường |
| 2 | Học sinh | Điền pre + post | Mỗi phase 1 lần; typed only |
| 3 | Học sinh | Rút đồng ý | Response không còn tính vào báo cáo |
| 4 | Thầy | Xem báo cáo | Chỉ aggregate, nhóm nhỏ ẩn, không raw export |
| 5 | DEC-15 chưa chốt | Xem báo cáo | 403 report_policy_unset |
