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

## Bổ sung 2026-10-16 (wiring + family agreement + revision pin)

| Case | Kỳ vọng | Kết quả |
| --- | --- | --- |
| Provider chỉ surface published; draft/malformed/retired không lộ | đúng | PASS |
| Provider validate đúng 4 tuần (1..4, không trùng) + bounds | đúng | PASS |
| WeekProgress pin revision — activity_key tái dụng rev mới không kế thừa status | đúng | PASS |
| Thỏa ước: propose 201 proposed; re-propose idempotent | đúng | PASS |
| Thỏa ước: hai actor KHÁC nhau xác nhận cùng revision → confirmed (2 timestamp) | đúng | PASS |
| Thỏa ước: confirm lặp/đã confirmed → 400 sạch | đúng | PASS |
| Thỏa ước: người lạ 404; người ngoài cặp không confirm được | đúng | PASS |
| Thỏa ước: counterpart pin revision khác → revision_mismatch chặn | đúng | PASS |
| Thỏa ước: withdraw chỉ proposer; sau withdrawn, confirm bị chặn | đúng | PASS |
| Generation mới (unlink/reconnect) → instance mới riêng, không tái dùng | đúng | PASS |
| E2E local production wiring: connect→enroll→weeks→progress→F09→agreement→opt-out | 44/44 | PASS |

E2E script: `scripts/f02_e2e_flow.mjs` (env `FB_E2E_CLASS_PASSWORD`, không
hardcode mật khẩu; runner bash ngoài repo: migrate → provision cặp synthetic
→ seed draft → publish mô phỏng admin → runserver → flow → DB inspect:
FamilyAgreement confirmed 2 timestamp, WeekProgress rev1 hai người độc lập).
